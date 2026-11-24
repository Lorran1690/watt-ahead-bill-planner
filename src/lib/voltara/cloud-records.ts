import { defaultState } from "./defaults";
import { normalizeState } from "./storage";
import type { Appliance, Bill, DailyExpense, Settings, VoltaraState } from "./types";

export type RecordKind = "meta" | "appliance" | "bill" | "expense";
export interface SharedRecord {
  kind: RecordKind;
  record_key: string;
  document: Record<string, unknown>;
}

export const recordId = (r: Pick<SharedRecord, "kind" | "record_key">) => r.kind + ":" + r.record_key;

/** Cada gasto/aparelho/fatura tem seu próprio registro. Mudanças simultâneas não substituem a lista inteira. */
export function toSharedRecords(state: VoltaraState): SharedRecord[] {
  const items: SharedRecord[] = [
    { kind: "meta", record_key: "settings", document: { ...state.settings } },
    { kind: "meta", record_key: "residual", document: { value: state.residualUncertainty } },
  ];
  for (const appliance of state.appliances) {
    items.push({ kind: "appliance", record_key: appliance.id, document: { ...appliance } });
  }
  for (const bill of state.bills) {
    items.push({ kind: "bill", record_key: bill.id, document: { ...bill } });
  }
  for (const expense of state.expenses) {
    items.push({ kind: "expense", record_key: expense.id, document: { ...expense } });
  }
  return items;
}

export function toRecordMap(records: SharedRecord[]): Map<string, SharedRecord> {
  return new Map(records.map((r) => [recordId(r), r]));
}

/** Restaura somente dados validados. Falha se a nuvem devolver registros incompatíveis. */
export function fromSharedRecords(records: SharedRecord[]): VoltaraState {
  const base = defaultState();
  const metaSettings = records.find((r) => r.kind === "meta" && r.record_key === "settings");
  const metaResidual = records.find((r) => r.kind === "meta" && r.record_key === "residual");
  const raw = {
    ...base,
    settings: (metaSettings?.document ?? base.settings) as Settings,
    residualUncertainty: metaResidual?.document?.value ?? base.residualUncertainty,
    appliances: records.filter((r) => r.kind === "appliance").map((r) => r.document as unknown as Appliance),
    bills: records.filter((r) => r.kind === "bill").map((r) => r.document as unknown as Bill),
    expenses: records.filter((r) => r.kind === "expense").map((r) => r.document as unknown as DailyExpense),
  };
  return normalizeState(raw);
}

export interface RecordChange {
  operation: "upsert" | "delete";
  kind: RecordKind;
  record_key: string;
  document?: Record<string, unknown>;
}

export function diffSharedRecords(before: SharedRecord[], after: SharedRecord[]): RecordChange[] {
  const oldMap = toRecordMap(before);
  const newMap = toRecordMap(after);
  const changes: RecordChange[] = [];
  for (const [key, next] of newMap) {
    const old = oldMap.get(key);
    if (!old || JSON.stringify(old.document) !== JSON.stringify(next.document)) {
      changes.push({ operation: "upsert", ...next });
    }
  }
  for (const [key, old] of oldMap) {
    if (!newMap.has(key)) {
      changes.push({ operation: "delete", kind: old.kind, record_key: old.record_key });
    }
  }
  return changes;
}
