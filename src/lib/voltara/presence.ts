import { useSyncExternalStore } from "react";
import { getCloudClient } from "./cloud-client";
import { PUBLIC_APP_ORIGIN } from "./public-url";

export type MemberPresence = {
  role: "owner" | "member";
  is_self: boolean;
  joined_at: string;
  last_seen_at: string | null;
  server_now: string;
};
export type PresenceLabel = "online" | "unstable" | "offline" | "unknown";
export function presenceLabel(row: MemberPresence): PresenceLabel {
  if (!row.last_seen_at) return "unknown";
  const age = Date.parse(row.server_now) - Date.parse(row.last_seen_at);
  if (!Number.isFinite(age) || age < 0) return "unknown";
  return age <= 45000 ? "online" : age <= 90000 ? "unstable" : "offline";
}
type Snapshot = { members: MemberPresence[]; enabled: boolean; ready: boolean; error: string | null };
const initial: Snapshot = { members: [], enabled: false, ready: false, error: null };
let state = initial;
const listeners = new Set<() => void>();
let preferenceKey: string | null = null;
let wake: (() => void) | null = null;
const publish = (patch: Partial<Snapshot>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export function useFamilyPresence() {
  return useSyncExternalStore(subscribe, () => state, () => initial);
}
export function setPresenceEnabled(enabled: boolean) {
  if (!preferenceKey || !state.ready) return;
  try { window.localStorage.setItem(preferenceKey, enabled ? "yes" : "no"); } catch { /* apenas sessão */ }
  publish({ enabled });
  wake?.();
}

/** Called once from the persistent shell, not just on the sharing page.
 * A member opts in on this device. No background or external activity is collected.
 * Server timestamps prevent accidental clock skew. A missing heartbeat is not proof
 * that the person is physically offline.
 */
export function startFamilyPresence(householdId: string | null): () => void {
  state = initial;
  preferenceKey = null;
  wake = null;
  listeners.forEach((fn) => fn());
  if (!householdId || typeof window === "undefined") return () => {};
  if (window.location.origin !== PUBLIC_APP_ORIGIN && !import.meta.env.DEV) {
    publish({ error: "A presença está disponível no site público do Voltara." });
    return () => {};
  }
  const client = getCloudClient();
  if (!client) return () => {};
  let active = true, busy = false;
  let lastSent = 0;
  let timer: number | undefined;
  async function refresh() {
    if (!active || busy || document.visibilityState !== "visible") return;
    busy = true;
    try {
      if (state.enabled && Date.now() - lastSent >= 12000) {
        const { error } = await client!.rpc("voltara_presence_touch");
        if (error) throw error;
        lastSent = Date.now();
      }
      const { data, error } = await client!.rpc("voltara_presence_members");
      if (error) throw error;
      if (active) publish({ members: (data ?? []) as MemberPresence[], error: null });
    } catch {
      if (active) publish({ error: "Não foi possível consultar a presença. Os estados estão indisponíveis." });
    } finally { busy = false; }
  }
  const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
  const onOffline = () => { if (active) publish({ error: "Sem conexão. Presença indisponível." }); };
  const onStorage = (event: StorageEvent) => {
    if (active && preferenceKey && event.key === preferenceKey) {
      publish({ enabled: event.newValue === "yes" });
      void refresh();
    }
  };
  async function init() {
    try {
      const { data, error } = await client!.auth.getUser();
      if (!active) return;
      if (error || !data.user) throw new Error("Sessão indisponível");
      preferenceKey = "voltara:presence:v1:" + data.user.id;
      let enabled = false;
      try { enabled = window.localStorage.getItem(preferenceKey) === "yes"; } catch { /* opt-in inicial */ }
      publish({ enabled, ready: true });
      wake = () => { void refresh(); };
      // One loop polls and sends a heartbeat every 15s when presence is enabled.
      // The server independently rate-limits writes to one per 10 seconds.
      timer = window.setInterval(() => { void refresh(); }, 15000);
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("online", onVisible);
      window.addEventListener("offline", onOffline);
      window.addEventListener("storage", onStorage);
      await refresh();
    } catch {
      if (active) publish({ error: "Entre novamente para consultar a presença." });
    }
  }
  void init();
  return () => {
    active = false;
    if (timer !== undefined) window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("online", onVisible);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("storage", onStorage);
    preferenceKey = null;
    wake = null;
    state = initial;
    listeners.forEach((fn) => fn());
  };
}
