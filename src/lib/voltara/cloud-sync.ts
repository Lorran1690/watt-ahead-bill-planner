import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getCloudClient } from "./cloud-client";
import { diffSharedRecords, fromSharedRecords, toSharedRecords, type SharedRecord } from "./cloud-records";
import { defaultState } from "./defaults";
import { getVoltaraSnapshot, setVoltara, subscribeVoltara } from "./store";
import { parseBackup } from "./storage";
import type { VoltaraState } from "./types";

const PERSONAL_BACKUP_KEY = "voltara:before-sharing:v1";

type SyncPhase = "local" | "connecting" | "online" | "empty" | "error";
export interface CloudStatus {
  phase: SyncPhase;
  householdId: string | null;
  message: string;
  pending: number;
}

const INITIAL: CloudStatus = { phase: "local", householdId: null, message: "", pending: 0 };
let status: CloudStatus = INITIAL;
const listeners = new Set<() => void>();
let activeId: string | null = null;
let channel: RealtimeChannel | null = null;
let unsubscribeLocal: (() => void) | null = null;
let lastCommitted: SharedRecord[] = [];
let syncingFromRemote = false;
let pending = 0;
let chained: Promise<void> = Promise.resolve();
let syncing = false;
let connectionGeneration = 0;
let startingHousehold: string | null = null;
let startPromise: Promise<void> | null = null;

const notify = () => listeners.forEach((listener) => listener());
const setStatus = (patch: Partial<CloudStatus>) => { status = { ...status, ...patch }; notify(); };

export const getCloudStatus = () => status;
export const subscribeCloudStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function useCloudStatus() {
  return useSyncExternalStore(subscribeCloudStatus, getCloudStatus, () => INITIAL);
}

function assertBrowser() {
  const client = getCloudClient();
  if (!client) throw new Error("Configure o projeto Supabase exclusivo do Voltara antes de usar o compartilhamento.");
  return client;
}

export async function signedInEmail(): Promise<string | null> {
  const { data, error } = await assertBrowser().auth.getUser();
  if (error) return null;
  return data.user?.email ?? null;
}

export async function sendSignInEmail(email: string): Promise<void> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Informe um e-mail válido.");
  const client = assertBrowser();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin + "/compartilhar" },
  });
  if (error) throw error;
}

export async function findMyHousehold(): Promise<{ id: string; role: "owner" | "member" } | null> {
  const client = assertBrowser();
  const { data, error } = await client.from("voltara_members")
    .select("household_id,role").limit(1);
  if (error) throw error;
  const item = data?.[0];
  if (!item) return null;
  return { id: item.household_id as string, role: item.role as "owner" | "member" };
}

export async function createHousehold(name: string): Promise<string> {
  const { data, error } = await assertBrowser().rpc("voltara_create_household", { p_name: name.trim() || "Nossa casa" });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("O servidor não retornou a identificação da casa.");
  return data;
}

export async function issueHouseholdInvite(householdId: string): Promise<string> {
  const { data, error } = await assertBrowser().rpc("voltara_issue_invite", { p_household: householdId });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("O servidor não retornou o convite.");
  return data;
}

export async function joinHousehold(code: string): Promise<string> {
  if (!/^[a-f0-9]{64}$/.test(code.trim())) throw new Error("Código de convite inválido.");
  const { data, error } = await assertBrowser().rpc("voltara_join_household", { p_code: code.trim() });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Não foi possível entrar na casa.");
  return data;
}

async function fetchRows(householdId: string): Promise<SharedRecord[]> {
  const client = assertBrowser();
  const output: SharedRecord[] = [];
  // Data API geralmente limita consultas a 1000 linhas; buscar todas as páginas.
  for (let start = 0; start < 10000; start += 500) {
    const { data, error } = await client.from("voltara_records")
      .select("kind,record_key,document")
      .eq("household_id", householdId)
      .order("kind", { ascending: true })
      .order("record_key", { ascending: true })
      .range(start, start + 499);
    if (error) throw error;
    for (const row of data ?? []) {
      output.push({
        kind: row.kind as SharedRecord["kind"],
        record_key: row.record_key as string,
        document: row.document as Record<string, unknown>,
      });
    }
    if (!data || data.length < 500) break;
  }
  return output;
}

function retainLocalBackup() {
  try {
    if (!window.localStorage.getItem(PERSONAL_BACKUP_KEY)) {
      window.localStorage.setItem(PERSONAL_BACKUP_KEY, JSON.stringify(getVoltaraSnapshot()));
    }
  } catch {
    // Se armazenamento estiver desativado, Configurações permite backup manual.
  }
}

function applyRemote(records: SharedRecord[]) {
  const validated = fromSharedRecords(records);
  syncingFromRemote = true;
  try {
    retainLocalBackup();
    setVoltara(validated);
    lastCommitted = records;
  } finally {
    syncingFromRemote = false;
  }
}

async function refreshFromCloud() {
  if (!activeId || pending > 0 || syncing) return;
  syncing = true;
  const id = activeId;
  try {
    const rows = await fetchRows(id);
    // Uma edição local pode ter acontecido durante a consulta: não sobrescrevê-la.
    if (activeId !== id || pending > 0) return;
    if (rows.length === 0) {
      setStatus({ phase: "empty", message: "A casa ainda não tem dados compartilhados." });
      return;
    }
    applyRemote(rows);
    setStatus({ phase: "online", message: "", pending: 0 });
  } catch (error) {
    setStatus({ phase: "error", message: error instanceof Error ? error.message : "Erro ao receber atualizações." });
  } finally {
    syncing = false;
  }
}

function handleLocalChange() {
  if (syncingFromRemote || !activeId) return;
  const target = toSharedRecords(getVoltaraSnapshot());
  if (!diffSharedRecords(lastCommitted, target).length) return;
  const householdId = activeId;
  pending++;
  setStatus({ pending, message: "" });
  chained = chained.catch(() => {}).then(async () => {
    if (activeId !== householdId) return;
    const client = assertBrowser();
    const changes = diffSharedRecords(lastCommitted, target);
    try {
      for (const change of changes) {
        if (change.operation === "delete") {
          const { error } = await client.from("voltara_records").delete()
            .eq("household_id", householdId)
            .eq("kind", change.kind)
            .eq("record_key", change.record_key);
          if (error) throw error;
        } else {
          const { error } = await client.from("voltara_records").upsert({
            household_id: householdId,
            kind: change.kind,
            record_key: change.record_key,
            document: change.document,
          }, { onConflict: "household_id,kind,record_key" });
          if (error) throw error;
        }
      }
      lastCommitted = target;
      setStatus({ phase: "online", message: "" });
    } catch (error) {
      setStatus({
        phase: "error",
        message: "Alteração salva neste dispositivo, mas não enviada. " +
          (error instanceof Error ? error.message : "Verifique a conexão."),
      });
    } finally {
      pending = Math.max(0, pending - 1);
      setStatus({ pending });
      if (pending === 0 && status.phase !== "error") await refreshFromCloud();
    }
  });
}

function clearActive() {
  connectionGeneration++;
  const client = getCloudClient();
  unsubscribeLocal?.();
  unsubscribeLocal = null;
  if (channel && client) void client.removeChannel(channel);
  channel = null;
  activeId = null;
  pending = 0;
  lastCommitted = [];
  chained = Promise.resolve();
  setStatus({ phase: "local", householdId: null, message: "", pending: 0 });
}

/** Conecta à casa já autenticada. A nuvem é a referência e substitui a cópia local.
 * Idempotente: evita canais duplicados quando a sessão é aberta em duas telas simultaneamente.
 */
export function startHouseholdSync(householdId: string): Promise<void> {
  if (activeId === householdId && status.phase !== "error") return Promise.resolve();
  if (startingHousehold === householdId && startPromise) return startPromise;

  const connect = async () => {
    clearActive();
    const generation = connectionGeneration;
    setStatus({ phase: "connecting", householdId, message: "Conectando à casa..." });
    try {
      const rows = await fetchRows(householdId);
      // Um logout/troca de casa pode ter ocorrido enquanto a consulta estava em andamento.
      if (generation !== connectionGeneration) return;
      if (rows.length === 0) {
        setStatus({ phase: "empty", householdId, message: "Esta casa ainda não possui dados para sincronizar." });
        return;
      }
      applyRemote(rows);
      activeId = householdId;
      unsubscribeLocal = subscribeVoltara(handleLocalChange);
      const client = assertBrowser();
      channel = client.channel("voltara-family-" + householdId)
        .on("postgres_changes", {
          event: "*",
          schema: "public",
          table: "voltara_records",
          filter: "household_id=eq." + householdId,
        }, () => {
          // Buscar novamente com RLS garante que só sejam exibidos dados autorizados.
          if (pending === 0) void refreshFromCloud();
        })
        .subscribe((s) => {
          if (generation !== connectionGeneration) return;
          if (s === "SUBSCRIBED") setStatus({ phase: "online", householdId, message: "" });
          if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
            setStatus({ phase: "error", householdId, message: "Conexão em tempo real interrompida. Tente reconectar." });
          }
        });
    } catch (error) {
      if (generation === connectionGeneration) {
        setStatus({ phase: "error", householdId, message: error instanceof Error ? error.message : "Falha ao conectar à casa." });
      }
      throw error;
    }
  };
  startingHousehold = householdId;
  const task = connect().finally(() => {
    if (startPromise === task) {
      startPromise = null;
      startingHousehold = null;
    }
  });
  startPromise = task;
  return task;
}

/** Importar dados locais é sempre uma ação EXPLÍCITA do dono da casa. */
export async function importLocalToHousehold(householdId: string): Promise<void> {
  const client = assertBrowser();
  const current = await fetchRows(householdId);
  if (current.length > 0) {
    throw new Error("Esta casa já contém dados. Não é seguro sobrescrever os lançamentos do outro dispositivo.");
  }
  retainLocalBackup();
  const items = toSharedRecords(getVoltaraSnapshot());
  for (const item of items) {
    const { error } = await client.from("voltara_records").upsert({
      household_id: householdId,
      kind: item.kind,
      record_key: item.record_key,
      document: item.document,
    }, { onConflict: "household_id,kind,record_key" });
    if (error) throw error;
  }
  await startHouseholdSync(householdId);
}

/** Reconecta e tenta enviar alterações locais após uma interrupção. */
export async function retryHouseholdSync() {
  if (activeId) {
    const changes = diffSharedRecords(lastCommitted, toSharedRecords(getVoltaraSnapshot()));
    if (changes.length) {
      handleLocalChange();
      return;
    }
    if (status.phase === "error") {
      await startHouseholdSync(activeId);
      return;
    }
    await refreshFromCloud();
  } else if (status.householdId) {
    await startHouseholdSync(status.householdId);
  }
}

export async function signOutFamily(): Promise<void> {
  clearActive();
  const client = getCloudClient();
  if (client) await client.auth.signOut();
  let restore: VoltaraState = defaultState();
  try {
    const previous = window.localStorage.getItem(PERSONAL_BACKUP_KEY);
    if (previous) restore = parseBackup(previous);
  } catch {
    // Evita manter os lançamentos da casa compartilhada em sessão encerrada.
  }
  setVoltara(restore);
}
