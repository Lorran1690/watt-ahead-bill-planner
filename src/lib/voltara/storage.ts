import { defaultState } from "./defaults";
import type { VoltaraState } from "./types";

export const STORAGE_KEY = "voltara:v1";
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Valida e mescla com os padrões; lança erro se o formato for inválido. */
export function normalizeState(raw: unknown): VoltaraState {
  if (!isObj(raw) || raw["version"] !== 1) throw new Error("Backup inválido ou de versão desconhecida.");
  const d = defaultState();
  const settings = isObj(raw["settings"]) ? { ...d.settings, ...raw["settings"] } : d.settings;
  if (typeof settings.tariff !== "number" || settings.tariff <= 0) throw new Error("Tarifa inválida no backup.");
  const appliances = Array.isArray(raw["appliances"]) ? (raw["appliances"] as VoltaraState["appliances"]).filter((a) => isObj(a) && typeof a.id === "string" && ["power", "monthly", "perUse"].includes(a.kind)) : d.appliances;
  const bills = Array.isArray(raw["bills"]) ? (raw["bills"] as VoltaraState["bills"]).filter((b) => isObj(b) && typeof b.value === "number" && /^\d{4}-\d{2}$/.test(String(b.month))) : [];
  const ru = typeof raw["residualUncertainty"] === "number" ? (raw["residualUncertainty"] as number) : d.residualUncertainty;
  return { version: 1, settings, appliances, bills, residualUncertainty: ru };
}

export function loadState(kv: KV | null): VoltaraState {
  if (!kv) return defaultState();
  try {
    const s = kv.getItem(STORAGE_KEY);
    return s ? normalizeState(JSON.parse(s)) : defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(kv: KV | null, state: VoltaraState): void {
  try { kv?.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* cota cheia / modo privado */ }
}

export function parseBackup(text: string): VoltaraState {
  return normalizeState(JSON.parse(text));
}
