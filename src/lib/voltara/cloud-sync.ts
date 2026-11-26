import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getCloudClient } from "./cloud-client";
import { PUBLIC_APP_ORIGIN, PUBLIC_SHARING_URL } from "./public-url";
import { parseVoltaraConfirmationLink } from "./auth-link";
import { diffSharedRecords, fromSharedRecords, toSharedRecords, overlayRecordChanges, recordId, type RecordChange, type SharedRecord } from "./cloud-records";
import { journalKey, mergeJournal, readJournal, saveJournal } from "./sync-journal";
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
let lastObserved: SharedRecord[] = [];
let journal: RecordChange[] = [];
let activeJournalKey: string | null = null;
let writing = false;
let retryTimer: ReturnType<typeof setInterval> | null = null;
let journalDurable = true;
let syncingFromRemote = false;
let pending = 0;
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
  if (typeof window !== "undefined" && window.location.origin !== PUBLIC_APP_ORIGIN && !import.meta.env.DEV) {
    throw new Error("Esta é a prévia do editor. Abra o site público do Voltara antes de pedir o e-mail de acesso.");
  }
  const client = assertBrowser();
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    // O domínio é fixo: solicitar login na prévia não deve abrir o editor Lovable.
    options: { emailRedirectTo: PUBLIC_SHARING_URL },
  });
  if (error) throw error;
}

/** Recupera uma sessão diretamente no domínio público, sem abrir o editor do Lovable.
 * A confirmação deve ser copiada antes do clique, pois cada token é de uso único.
 */
export async function signInWithCopiedEmailLink(link: string): Promise<void> {
  if (typeof window !== "undefined" && window.location.origin !== PUBLIC_APP_ORIGIN && !import.meta.env.DEV) {
    throw new Error("Abra o Voltara público para confirmar o acesso. Não utilize a prévia do editor.");
  }
  const confirmation = parseVoltaraConfirmationLink(link);
  if (!confirmation) throw new Error("Copie o endereço completo do botão de confirmação recebido no e-mail do Supabase, sem clicar nele primeiro.");
  const { data, error } = await assertBrowser().auth.verifyOtp(confirmation);
  if (error) throw error;
  if (!data.session) throw new Error("O link não gerou uma sessão. Solicite um novo e-mail de acesso.");
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
  for (let start = 0; start <= 11000; start += 500) {
    if (start === 11000) throw new Error("A casa excedeu o limite de registros suportado. Nenhum dado foi substituído.");
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
    lastObserved = toSharedRecords(validated);
  } finally {
    syncingFromRemote = false;
  }
}

function persistJournal() {
  if (!activeJournalKey) return;
  try {
    saveJournal(window.localStorage, activeJournalKey, journal);
    journalDurable = true;
  } catch {
    journalDurable = false;
  }
  pending = journal.length;
  setStatus({ pending });
}

async function refreshFromCloud() {
  if (!activeId || journal.length || writing || syncing) return;
  syncing = true;
  const id = activeId;
  const generation = connectionGeneration;
  try {
    const rows = await fetchRows(id);
    if (generation !== connectionGeneration || activeId !== id || journal.length || writing) return;
    if (rows.length === 0) {
      setStatus({ phase: "empty", message: "A casa não tem dados disponíveis. Confira sua associação antes de editar." });
      return;
    }
    applyRemote(rows);
    setStatus({ phase: "online", message: "", pending: 0 });
  } catch (error) {
    if (generation === connectionGeneration) setStatus({ phase: "error", message: error instanceof Error ? error.message : "Erro ao receber atualizações." });
  } finally {
    if (generation === connectionGeneration) syncing = false;
  }
}

async function flushJournal() {
  if (!activeId || writing || !journal.length) return;
  const id = activeId;
  const generation = connectionGeneration;
  writing = true;
  try {
    const client = assertBrowser();
    while (journal.length && generation === connectionGeneration) {
      const change = journal[0]!;
      if (change.operation === "delete") {
        const { error } = await client.from("voltara_records").delete()
          .eq("household_id", id).eq("kind", change.kind).eq("record_key", change.record_key);
        if (error) throw error;
      } else {
        const { error } = await client.from("voltara_records").upsert({
          household_id: id, kind: change.kind, record_key: change.record_key, document: change.document,
        }, { onConflict: "household_id,kind,record_key" });
        if (error) throw error;
      }
      // Do not acknowledge a newer edit of this same record that arrived while sending.
      if (generation !== connectionGeneration) return;
      journal = journal.filter(item => item !== change);
      persistJournal();
    }
    if (generation === connectionGeneration) setStatus({ phase: "online", message: "" });
  } catch (error) {
    if (generation !== connectionGeneration) return;
    const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
    setStatus({ phase: "error", message: duplicate
      ? "Conflito: outro aparelho já cadastrou uma fatura deste mês. Exporte o backup e confira o histórico antes de reenviar."
      : journalDurable ? "Alterações guardadas neste aparelho, aguardando reconexão."
      : "Alterações ainda na memória. O armazenamento local falhou: exporte um backup antes de fechar." });
  } finally {
    if (generation === connectionGeneration) {
      writing = false;
      if (!journal.length && status.phase !== "error") await refreshFromCloud();
    }
  }
}

function handleLocalChange() {
  if (syncingFromRemote || !activeId) return;
  const target = toSharedRecords(getVoltaraSnapshot());
  const changes = diffSharedRecords(lastObserved, target);
  if (!changes.length) return;
  lastObserved = target;
  journal = mergeJournal(journal, changes);
  persistJournal();
  setStatus({ message: journalDurable ? "Enviando alterações..." : "Armazenamento local indisponível. Exporte um backup antes de fechar." });
  void flushJournal();
}

function clearActive() {
  connectionGeneration++;
  const client = getCloudClient();
  unsubscribeLocal?.();
  unsubscribeLocal = null;
  if (channel && client) void client.removeChannel(channel);
  if (retryTimer !== null) clearInterval(retryTimer);
  retryTimer = null;
  channel = null;
  activeId = null;
  activeJournalKey = null;
  journal = [];
  pending = 0;
  lastObserved = [];
  writing = false;
  syncing = false;
  journalDurable = true;
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
      const client = assertBrowser();
      const { data: { user }, error } = await client.auth.getUser();
      if (error || !user) throw new Error("Sessão indisponível. Entre novamente.");
      if (generation !== connectionGeneration) return;
      const key = journalKey(user.id, householdId);
      const rows = await fetchRows(householdId);
      if (generation !== connectionGeneration) return;
      let saved: RecordChange[];
      try {
        saved = readJournal(window.localStorage, key);
      } catch {
        throw new Error("Não foi possível recuperar a fila local. Exporte um backup e verifique o armazenamento antes de continuar.");
      }
      if (!rows.length && !saved.length) {
        setStatus({ phase: "empty", householdId, message: "Esta casa ainda não possui dados para sincronizar." });
        return;
      }
      // Restore only queued edits belonging to this user and this house. Never
      // overwrite all records with a stale copy of the household.
      applyRemote(overlayRecordChanges(rows, saved));
      activeId = householdId;
      activeJournalKey = key;
      journal = saved;
      persistJournal();
      unsubscribeLocal = subscribeVoltara(handleLocalChange);
      retryTimer = setInterval(() => {
        if (journal.length) void flushJournal();
        else void refreshFromCloud();
      }, 15000);
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
          if (s === "SUBSCRIBED" && !journal.length) setStatus({ phase: "online", householdId, message: "" });
          if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
            setStatus({ phase: "error", householdId, message: "Conexão em tempo real interrompida. Tente reconectar." });
          }
        });
      if (journal.length) void flushJournal();
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
  const { error } = await client.from("voltara_records").insert(items.map(item => ({
    household_id: householdId, kind: item.kind, record_key: item.record_key, document: item.document,
  })));
  if (error) throw error;
  await startHouseholdSync(householdId);
}

/** Reconecta e tenta enviar alterações locais após uma interrupção. */
export async function retryHouseholdSync() {
  if (activeId) {
    if (journal.length) await flushJournal();
    else await refreshFromCloud();
  } else if (status.householdId) {
    await startHouseholdSync(status.householdId);
  }
}

export async function signOutFamily(): Promise<void> {
  if (journal.length || writing) throw new Error("Há alterações pendentes. Sincronize ou exporte um backup antes de sair.");
  const client = getCloudClient();
  if (client) {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }
  clearActive();
  let restore: VoltaraState = defaultState();
  try {
    const previous = window.localStorage.getItem(PERSONAL_BACKUP_KEY);
    if (previous) restore = parseBackup(previous);
  } catch {
    // Evita manter os lançamentos da casa compartilhada em sessão encerrada.
  }
  setVoltara(restore);
  try { window.localStorage.removeItem(PERSONAL_BACKUP_KEY); } catch { /* armazenamento indisponível */ }
}
