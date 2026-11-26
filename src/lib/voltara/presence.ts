import { useSyncExternalStore } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
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
  let channel: RealtimeChannel | null = null;
  let subscribed = false, tracked = false, tracking = false;
  const realtimeEnabled = import.meta.env.VITE_VOLTARA_PRIVATE_PRESENCE === "true";
  async function updateTracking() {
    if (!active || !subscribed || !channel || tracking) return;
    const desired = state.enabled && document.visibilityState === "visible";
    if (desired === tracked) return;
    tracking = true;
    try {
      if (desired) {
        // Authoritative timestamp is written through the authenticated RPC. Presence payload
        // contains no identity, email, location, or financial data; it only prompts a refresh.
        const { error } = await client!.rpc("voltara_presence_touch");
        if (error || !active || !state.enabled || document.hidden) return;
        lastSent = Date.now();
        tracked = await channel.track({ active: true }) === "ok";
      } else {
        if (await channel.untrack() === "ok") tracked = false;
      }
    } catch { /* retain server heartbeat fallback */ }
    finally { tracking = false; }
  }
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
  const onVisible = () => { void updateTracking(); if (document.visibilityState === "visible") void refresh(); };
  const onOffline = () => { if (active) publish({ error: "Sem conexão. Presença indisponível." }); };
  const onStorage = (event: StorageEvent) => {
    if (active && preferenceKey && event.key === preferenceKey) {
      publish({ enabled: event.newValue === "yes" });
      void updateTracking(); void refresh();
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
      wake = () => { void updateTracking(); void refresh(); };
      if (realtimeEnabled) {
        // Private authorization policies must be applied before enabling this feature.
        channel = client!.channel("voltara:presence:" + householdId, {config:{private:true}})
          .on("presence", {event:"sync"}, () => { void refresh(); })
          .on("presence", {event:"join"}, () => { void refresh(); })
          .on("presence", {event:"leave"}, () => { void refresh(); })
          .subscribe(status => {
            if (!active) return;
            subscribed = status === "SUBSCRIBED"; tracked = false;
            if (subscribed) { void updateTracking(); void refresh(); }
          });
      }
      // One loop polls and sends a heartbeat every 15s when presence is enabled.
      // The server independently rate-limits writes to one per 10 seconds.
      timer = window.setInterval(() => { void updateTracking(); void refresh(); }, 15000);
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
    if (channel) void client.removeChannel(channel);
    channel = null;
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
