import { fromKey } from "./calc";
import type { MonthKey } from "./types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (v: number) => brl.format(v);
export const num = (v: number, d = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d });
export const kwh = (v: number, d = 1) => `${num(v, d)} kWh`;
export const pct = (v: number) => `${v > 0 ? "+" : ""}${num(v * 100, 1)}%`;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monthLong = (k: MonthKey) => { const { y, m } = fromKey(k); return `${MESES[m]} de ${y}`; };
export const monthShort = (k: MonthKey) => { const { y, m } = fromKey(k); return `${MESES[m]!.slice(0, 3)}/${String(y).slice(2)}`; };
export const currentMonthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const uid = () => Math.random().toString(36).slice(2, 10);
