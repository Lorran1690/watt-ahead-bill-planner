import { useSyncExternalStore } from "react";
import { defaultState } from "./defaults";
import { loadState, saveState, type KV } from "./storage";
import type { VoltaraState } from "./types";

const SERVER = defaultState();
let state: VoltaraState | null = null;
const listeners = new Set<() => void>();
const kv = (): KV | null => {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
};

function get(): VoltaraState {
  if (!state) state = loadState(kv());
  return state;
}
export function getVoltaraSnapshot(): VoltaraState {
  return get();
}

export function subscribeVoltara(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setVoltara(next: VoltaraState | ((s: VoltaraState) => VoltaraState)) {
  state = typeof next === "function" ? next(get()) : next;
  saveState(kv(), state);
  listeners.forEach((l) => l());
}
export function useVoltara(): VoltaraState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    get,
    () => SERVER,
  );
}
