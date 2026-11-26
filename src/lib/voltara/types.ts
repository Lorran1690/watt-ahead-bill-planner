/** Tipos do modelo Voltara. Todas as energias em kWh, valores em R$. */
export type MonthKey = string; // "YYYY-MM"

interface BaseAppliance {
  id: string;
  name: string;
  icon: string;
  enabled: boolean;
  /** Incerteza relativa (0.2 = ±20%) usada na faixa mínimo/máximo. */
  uncertainty: number;
  note?: string;
}

/** kWh = (W/1000) * horas no mês. */
export interface PowerAppliance extends BaseAppliance {
  kind: "power";
  watts: number;
  /** Modo simples: horas por dia em N dias por semana. */
  hoursPerDay: number;
  daysPerWeek: number;
  /** Modo detalhado (opcional): horas médias por tipo de dia, contando os dias reais do mês. */
  detailed?: { weekdayHours: number; saturdayHours: number; sundayHours: number };
  /** Mistura opcional de cargas (ex.: PC em séries vs. jogo). */
  heavy?: { watts: number; share: number };
}

/** kWh/mês de etiqueta (ex.: geladeira) escalado pelos dias reais: kWh * dias/30. */
export interface MonthlyAppliance extends BaseAppliance {
  kind: "monthly";
  kwhPerMonth: number;
}

/** kWh = kWh por uso (na tomada) * nº de usos no mês. */
export interface PerUseAppliance extends BaseAppliance {
  kind: "perUse";
  kwhPerUse: number;
  usesPerWeek: number;
}

export type Appliance = PowerAppliance | MonthlyAppliance | PerUseAppliance;

/** Lançamento de despesa cotidiana, separado das contas de energia. */
export interface DailyExpense {
  id: string;
  date: string; // YYYY-MM-DD (data local do usuário)
  note: string;
  amount: number; // R$
  /** Cômodo associado, quando o usuário indicar. Gasto geral fica sem cômodo. */
  room?: import("./rooms").HouseRoomId;
}

export interface Bill {
  id: string;
  month: MonthKey;
  value: number;
  kwh?: number;
}

export interface WaterBill {
  id: string;
  month: MonthKey;
  value: number; // R$
  m3?: number; // m³ de água (opcional)
  note?: string;
}

export interface Settings {
  tariff: number; // R$/kWh TOTAL estimado (já com tributos/bandeira médios)
  fixedCharges: number; // R$/mês fixos (ex.: iluminação pública) — fora da tarifa
  referenceValue: number;
  referenceMonth: MonthKey;
  region: string;
  billingDay: number | null;
  chartType: "bar" | "area";
  showRange: boolean;
}

export interface VoltaraState {
  version: 1;
  settings: Settings;
  appliances: Appliance[];
  bills: Bill[];
  waterBills: WaterBill[];
  expenses: DailyExpense[];
  residualUncertainty: number;
  /** Optional extension; v1 backups remain readable. */
  finance?: import("./finance").FinanceItem[];
}
