import { billError, projection } from "./calc";
import type { MonthKey, VoltaraState } from "./types";

const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
const n = (v: number) => v.toFixed(2).replace(".", ",");

export function projectionCsv(state: VoltaraState, from: MonthKey): string {
  const rows = [["mes", "dias", "kwh_min", "kwh_central", "kwh_max", "rs_min", "rs_central", "rs_max"].map(esc).join(";")];
  for (const f of projection(state, from, 13)) rows.push([f.month, f.days, n(f.kwhMin), n(f.kwh), n(f.kwhMax), n(f.costMin), n(f.cost), n(f.costMax)].map(esc).join(";"));
  return rows.join("\n");
}
export function historyCsv(state: VoltaraState): string {
  const rows = [["competencia", "valor_rs", "kwh", "previsto_rs", "erro_rs"].map(esc).join(";")];
  for (const b of [...state.bills].sort((a, b) => a.month.localeCompare(b.month))) {
    const e = billError(state, b);
    rows.push([b.month, n(b.value), b.kwh ? n(b.kwh) : "", n(e.predicted), n(e.error)].map(esc).join(";"));
  }
  return rows.join("\n");
}
export function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
