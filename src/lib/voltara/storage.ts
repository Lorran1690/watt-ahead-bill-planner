import { defaultState } from "./defaults";
import type { Appliance, Bill, Settings, VoltaraState } from "./types";

export const STORAGE_KEY = "voltara:v1";
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const validNumber = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const validMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const validName = (v: unknown, max = 80): v is string =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

function assertAppliance(raw: unknown): Appliance {
  if (!isObj(raw) || !validName(raw.id, 80) || !validName(raw.name) || !validName(raw.icon, 80) ||
      typeof raw.enabled !== "boolean" || !validNumber(raw.uncertainty, 0, 1) ||
      (raw.note !== undefined && (typeof raw.note !== "string" || raw.note.length > 500))) {
    throw new Error("Dados inválidos em um aparelho.");
  }
  if (raw.kind === "power") {
    if (!validNumber(raw.watts, 0, 20000) || !validNumber(raw.hoursPerDay, 0, 24) ||
        !validNumber(raw.daysPerWeek, 0, 7)) throw new Error("Potência ou horas inválidas.");
    if (raw.detailed !== undefined) {
      if (!isObj(raw.detailed) || !validNumber(raw.detailed.weekdayHours, 0, 24) ||
          !validNumber(raw.detailed.saturdayHours, 0, 24) ||
          !validNumber(raw.detailed.sundayHours, 0, 24)) throw new Error("Rotina detalhada inválida.");
    }
    if (raw.heavy !== undefined) {
      if (!isObj(raw.heavy) || !validNumber(raw.heavy.watts, 0, 20000) ||
          !validNumber(raw.heavy.share, 0, 1)) throw new Error("Modo intenso inválido.");
    }
  } else if (raw.kind === "monthly") {
    if (!validNumber(raw.kwhPerMonth, 0, 5000)) throw new Error("Consumo mensal inválido.");
  } else if (raw.kind === "perUse") {
    if (!validNumber(raw.kwhPerUse, 0, 5000) || !validNumber(raw.usesPerWeek, 0, 70)) {
      throw new Error("Consumo por uso inválido.");
    }
  } else {
    throw new Error("Tipo de aparelho desconhecido.");
  }
  return raw as unknown as Appliance;
}

function assertBill(raw: unknown): Bill {
  if (!isObj(raw) || !validName(raw.id, 80) || !validMonth(raw.month) ||
      !validNumber(raw.value, 0.01, 1_000_000) ||
      (raw.kwh !== undefined && !validNumber(raw.kwh, 0.01, 1_000_000))) {
    throw new Error("Fatura inválida.");
  }
  return raw as unknown as Bill;
}

/** Validação rigorosa para não importar valores falsos, negativos, NaN ou estruturas quebradas. */
export function normalizeState(raw: unknown): VoltaraState {
  if (!isObj(raw) || raw.version !== 1 || !isObj(raw.settings) ||
      !Array.isArray(raw.appliances) || !Array.isArray(raw.bills)) {
    throw new Error("Backup inválido ou de versão desconhecida.");
  }

  const defaults = defaultState();
  const settings = { ...defaults.settings, ...raw.settings } as Settings;
  if (!validNumber(settings.tariff, 0.01, 20) ||
      !validNumber(settings.fixedCharges, 0, 5000) ||
      !validNumber(settings.referenceValue, 0, 1_000_000) ||
      !validMonth(settings.referenceMonth) ||
      typeof settings.region !== "string" || settings.region.length > 100 ||
      (settings.billingDay !== null && (!Number.isInteger(settings.billingDay) || !validNumber(settings.billingDay, 1, 31))) ||
      !["bar", "area"].includes(settings.chartType) || typeof settings.showRange !== "boolean") {
    throw new Error("Configurações inválidas no backup.");
  }

  if (raw.appliances.length > 100 || raw.bills.length > 240) {
    throw new Error("Backup excede o limite de registros.");
  }
  const appliances = raw.appliances.map(assertAppliance);
  const bills = raw.bills.map(assertBill);
  if (new Set(appliances.map((a) => a.id)).size !== appliances.length ||
      appliances.some((a) => a.id === "outros") ||
      new Set(bills.map((b) => b.month)).size !== bills.length) {
    throw new Error("Backup com aparelhos ou faturas duplicados.");
  }
  const residualUncertainty = raw.residualUncertainty === undefined
    ? defaults.residualUncertainty : raw.residualUncertainty;
  if (!validNumber(residualUncertainty, 0, 1)) {
    throw new Error("Incerteza residual inválida.");
  }
  return { version: 1, settings, appliances, bills, residualUncertainty };
}

export function loadState(kv: KV | null): VoltaraState {
  if (!kv) return defaultState();
  try {
    const saved = kv.getItem(STORAGE_KEY);
    return saved ? normalizeState(JSON.parse(saved)) : defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(kv: KV | null, state: VoltaraState): void {
  try {
    kv?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Navegação privada, armazenamento desabilitado ou cota esgotada.
  }
}

export function parseBackup(text: string): VoltaraState {
  return normalizeState(JSON.parse(text));
}
