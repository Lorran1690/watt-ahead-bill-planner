import { recordId, type RecordChange } from "./cloud-records";

const kinds = new Set(["meta", "appliance", "bill", "expense", "water_bill", "finance"]);
export type JournalStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const journalKey = (userId: string, householdId: string) =>
  "voltara:journal:v1:" + userId + ":" + householdId;

/** Latest intent per record. Edits never resend an entire stale household snapshot. */
export function mergeJournal(current: RecordChange[], next: RecordChange[]): RecordChange[] {
  const map = new Map(current.map(c => [recordId(c), c]));
  for (const change of next) map.set(recordId(change), change);
  return [...map.values()];
}
export function readJournal(store: JournalStore, key: string): RecordChange[] {
  const raw = store.getItem(key);
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 16000) throw new Error("Fila local inválida. Exporte um backup antes de continuar.");
  for (const c of value) {
    if (!c || typeof c !== "object" || !kinds.has(c.kind) ||
        typeof c.record_key !== "string" || !c.record_key || c.record_key.length > 80 ||
        !["upsert", "delete"].includes(c.operation) ||
        (c.operation === "upsert" && (!c.document || typeof c.document !== "object" || Array.isArray(c.document)))) {
      throw new Error("Fila local inválida. Exporte um backup antes de continuar.");
    }
  }
  return mergeJournal([], value as RecordChange[]);
}
export function saveJournal(store: JournalStore, key: string, changes: RecordChange[]): void {
  if (changes.length === 0) store.removeItem(key);
  else store.setItem(key, JSON.stringify(changes));
}
