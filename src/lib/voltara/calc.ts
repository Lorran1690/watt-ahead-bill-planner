/**
 * Calculadora Voltara — estimativas, NÃO medição.
 *
 * Fórmulas:
 *  - Aparelho por potência:   kWh = (W / 1000) × horas_no_mês
 *      horas_no_mês (simples)    = horas/dia × dias_do_mês × (dias_por_semana / 7)
 *      horas_no_mês (detalhado)  = h_útil × nº_dias_úteis + h_sáb × nº_sábados + h_dom × nº_domingos
 *      W efetivo com mistura     = W_leve × (1 − fração) + W_pesado × fração
 *  - Aparelho por etiqueta:   kWh = kWh_mês × dias_do_mês / 30   (geladeira: nunca W × 24h)
 *  - Aparelho por uso:        kWh = kWh_por_uso × nº_usos,  nº_usos = usos/semana × dias_do_mês / 7
 *  - Custo:                   R$ = kWh_total × tarifa_total + encargos_fixos
 *
 * Calibração (resíduo "Outros aparelhos e encargos"):
 *  kWh_conta = kWh informado na conta, ou (valor − encargos_fixos) / tarifa
 *  resíduo/dia = max(0, kWh_conta − kWh_modelo_no_mês_da_conta) / dias_do_mês_da_conta
 *  O resíduo é calculado UMA vez a partir dos aparelhos cadastrados; adicionar um aparelho
 *  reduz o resíduo (não há contagem dupla). Ele representa parcela desconhecida, não energia medida.
 */
import type { Appliance, Bill, MonthKey, VoltaraState } from "./types";

export const toKey = (y: number, m: number): MonthKey => `${y}-${String(m + 1).padStart(2, "0")}`;
export function fromKey(k: MonthKey): { y: number; m: number } {
  const [y, m] = k.split("-").map(Number);
  return { y: y ?? 2026, m: (m ?? 1) - 1 };
}
export function addMonths(k: MonthKey, n: number): MonthKey {
  const { y, m } = fromKey(k);
  const t = y * 12 + m + n;
  return toKey(Math.floor(t / 12), ((t % 12) + 12) % 12);
}
export function monthDiff(a: MonthKey, b: MonthKey): number {
  const A = fromKey(a), B = fromKey(b);
  return B.y * 12 + B.m - (A.y * 12 + A.m);
}

/** Dias reais do mês (fevereiro bissexto incluso). m: 0–11 */
export function daysInMonth(k: MonthKey): number {
  const { y, m } = fromKey(k);
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

export function dayTypeCounts(k: MonthKey) {
  const { y, m } = fromKey(k);
  const n = daysInMonth(k);
  let weekday = 0, saturday = 0, sunday = 0;
  for (let d = 1; d <= n; d++) {
    const w = new Date(Date.UTC(y, m, d)).getUTCDay();
    if (w === 0) sunday++;
    else if (w === 6) saturday++;
    else weekday++;
  }
  return { weekday, saturday, sunday, total: n };
}

export function effectiveWatts(a: Extract<Appliance, { kind: "power" }>): number {
  if (!a.heavy) return a.watts;
  const s = Math.min(1, Math.max(0, a.heavy.share));
  return a.watts * (1 - s) + a.heavy.watts * s;
}

export function monthlyHours(a: Extract<Appliance, { kind: "power" }>, k: MonthKey): number {
  if (a.detailed) {
    const c = dayTypeCounts(k);
    return a.detailed.weekdayHours * c.weekday + a.detailed.saturdayHours * c.saturday + a.detailed.sundayHours * c.sunday;
  }
  return a.hoursPerDay * daysInMonth(k) * (Math.min(7, Math.max(0, a.daysPerWeek)) / 7);
}

/** Energia estimada de um aparelho no mês (0 se desabilitado). */
export function applianceKwh(a: Appliance, k: MonthKey): number {
  if (!a.enabled) return 0;
  const days = daysInMonth(k);
  switch (a.kind) {
    case "power":
      return (effectiveWatts(a) / 1000) * monthlyHours(a, k);
    case "monthly":
      return (a.kwhPerMonth * days) / 30;
    case "perUse":
      return a.kwhPerUse * ((a.usesPerWeek * days) / 7);
  }
}

export function modelKwh(appliances: Appliance[], k: MonthKey): number {
  return appliances.reduce((s, a) => s + applianceKwh(a, k), 0);
}

export interface Calibration {
  source: "reference" | "bill";
  month: MonthKey;
  billValue: number;
  billKwh: number;
  kwhFromBill: boolean;
  modelKwh: number;
  residualPerDay: number;
  /** Modelo excede a conta: resíduo zerado, revise os aparelhos. */
  overshoot: boolean;
}

/** Calibra pelo registro mais recente (contas do histórico ou referência). */
export function calibrate(state: VoltaraState, excludeBillId?: string): Calibration {
  const { settings } = state;
  type Src = { source: "reference" | "bill"; month: MonthKey; value: number; kwh?: number };
  const sources: Src[] = [{ source: "reference", month: settings.referenceMonth, value: settings.referenceValue }];
  for (const b of state.bills) {
    if (b.id === excludeBillId) continue;
    sources.push({ source: "bill", month: b.month, value: b.value, ...(b.kwh ? { kwh: b.kwh } : {}) });
  }
  // mais recente; empate → conta do histórico vence a referência
  sources.sort((a, b) => monthDiff(b.month, a.month) || (a.source === b.source ? 0 : a.source === "bill" ? 1 : -1));
  const latest = sources[sources.length - 1]!;
  const kwhFromBill = !!latest.kwh && latest.kwh > 0;
  const billKwh = kwhFromBill ? latest.kwh! : Math.max(0, latest.value - settings.fixedCharges) / Math.max(0.01, settings.tariff);
  const m = modelKwh(state.appliances, latest.month);
  const diff = billKwh - m;
  return {
    source: latest.source,
    month: latest.month,
    billValue: latest.value,
    billKwh,
    kwhFromBill,
    modelKwh: m,
    residualPerDay: Math.max(0, diff) / daysInMonth(latest.month),
    overshoot: diff < 0,
  };
}

export interface ForecastItem { id: string; name: string; icon: string; kwh: number; min: number; max: number; cost: number; residual?: boolean }
export interface Forecast {
  month: MonthKey;
  days: number;
  items: ForecastItem[];
  kwh: number; kwhMin: number; kwhMax: number;
  cost: number; costMin: number; costMax: number;
}

export interface ForecastOptions {
  calibration?: Calibration;
  /** Resíduo fixo (simulador): mantém a parcela desconhecida do perfil salvo. */
  residualPerDay?: number;
  /** Alargamento extra da faixa (confiança menor). */
  extraUncertainty?: number;
}

export function forecastMonth(state: VoltaraState, k: MonthKey, opts: ForecastOptions = {}): Forecast {
  const { tariff, fixedCharges } = state.settings;
  const extra = opts.extraUncertainty ?? 0;
  const days = daysInMonth(k);
  const items: ForecastItem[] = state.appliances
    .filter((a) => a.enabled)
    .map((a) => {
      const kwh = applianceKwh(a, k);
      const u = a.uncertainty + extra;
      return { id: a.id, name: a.name, icon: a.icon, kwh, min: kwh * Math.max(0, 1 - u), max: kwh * (1 + u), cost: kwh * tariff };
    });
  const rpd = opts.residualPerDay ?? (opts.calibration ?? calibrate(state)).residualPerDay;
  const rk = rpd * days;
  if (rk > 0) {
    const u = state.residualUncertainty + extra;
    items.push({ id: "outros", name: "Outros aparelhos e encargos", icon: "circle-help", kwh: rk, min: rk * Math.max(0, 1 - u), max: rk * (1 + u), cost: rk * tariff, residual: true });
  }
  const kwh = items.reduce((s, i) => s + i.kwh, 0);
  const kwhMin = items.reduce((s, i) => s + i.min, 0);
  const kwhMax = items.reduce((s, i) => s + i.max, 0);
  return {
    month: k, days, items, kwh, kwhMin, kwhMax,
    cost: kwh * tariff + fixedCharges,
    costMin: kwhMin * tariff + fixedCharges,
    costMax: kwhMax * tariff + fixedCharges,
  };
}

/** Confiança cai com o tempo desde a última conta informada. */
export function confidence(state: VoltaraState, now: MonthKey) {
  const cal = calibrate(state);
  const months = Math.max(0, monthDiff(cal.month, now));
  const level: "alta" | "média" | "baixa" = months <= 2 && cal.kwhFromBill ? "alta" : months <= 5 ? "média" : "baixa";
  const extra = Math.min(0.25, Math.max(0, months - 2) * 0.03);
  return { level, months, extra, calibration: cal };
}

export function projection(state: VoltaraState, from: MonthKey, count: number): Forecast[] {
  const cal = calibrate(state);
  const out: Forecast[] = [];
  for (let i = 0; i < count; i++) {
    const k = addMonths(from, i);
    const extra = Math.min(0.25, Math.max(0, monthDiff(cal.month, k) - 2) * 0.03);
    out.push(forecastMonth(state, k, { calibration: cal, extraUncertainty: extra }));
  }
  return out;
}

/** Erro previsto vs real: prevê o mês da conta SEM usar a própria conta na calibração. */
export function billError(state: VoltaraState, bill: Bill) {
  // Evita vazamento temporal: uma conta FUTURA não pode calibrar uma previsão histórica.
  const pastState: VoltaraState = { ...state, bills: state.bills.filter((b) => b.id !== bill.id && b.month < bill.month) };
  // A referência manual também pode ser do próprio mês ou de um mês futuro.
  // Sem uma referência anterior, compare somente o modelo dos aparelhos.
  const hasPastReference = state.settings.referenceMonth < bill.month;
  const eligibleState = hasPastReference ? pastState : {
    ...pastState, settings: { ...pastState.settings, referenceMonth: "0001-01", referenceValue: 0 },
  };
  const f = forecastMonth(eligibleState, bill.month, !hasPastReference && !pastState.bills.length
    ? { residualPerDay: 0 } : { calibration: calibrate(eligibleState) });
  return { predicted: f.cost, error: f.cost - bill.value, pct: bill.value ? (f.cost - bill.value) / bill.value : 0 };
}
