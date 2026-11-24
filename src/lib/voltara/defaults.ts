import type { Appliance, VoltaraState } from "./types";

export const RESIDUAL_ID = "outros";

export function defaultAppliances(): Appliance[] {
  return [
    {
      id: "pc",
      name: "PC Ryzen 5 3400G + monitor",
      icon: "monitor",
      kind: "power",
      enabled: true,
      uncertainty: 0.25,
      // Média ~110 W (séries ~100 W, LoL ~150 W) → ~16 kWh/mês com a rotina abaixo.
      watts: 100,
      heavy: { watts: 150, share: 0.2 },
      hoursPerDay: 5,
      daysPerWeek: 5,
      detailed: { weekdayHours: 5.1, saturdayHours: 2, sundayHours: 6 },
      note: "Dias úteis 18h–23h (+30 min de manhã às vezes), domingo a partir das 17h.",
    },
    {
      id: "ventilador",
      name: "Ventilador de teto",
      icon: "fan",
      kind: "power",
      enabled: true,
      uncertainty: 0.15,
      watts: 75,
      hoursPerDay: 8,
      daysPerWeek: 7,
    },
    {
      id: "geladeira",
      name: "Geladeira",
      icon: "refrigerator",
      kind: "monthly",
      enabled: true,
      uncertainty: 0.15,
      kwhPerMonth: 40,
      note: "Valor de etiqueta: o compressor trabalha em ciclos, não 24h na potência máxima.",
    },
    {
      id: "scooter",
      name: "Scooter elétrica",
      icon: "bike",
      kind: "perUse",
      enabled: true,
      uncertainty: 0.3,
      kwhPerUse: 1.2,
      usesPerWeek: 7,
      note: "Energia medida na tomada por recarga, não watts do carregador × horas.",
    },
  ];
}

export function defaultState(): VoltaraState {
  return {
    version: 1,
    settings: {
      tariff: 1.35,
      fixedCharges: 0,
      referenceValue: 220,
      referenceMonth: "2026-11",
      region: "RJ",
      billingDay: null,
      chartType: "bar",
      showRange: true,
    },
    appliances: defaultAppliances(),
    bills: [],
    residualUncertainty: 0.25,
  };
}

type NoId<T> = T extends unknown ? Omit<T, "id"> : never;
export const PRESETS: NoId<Appliance>[] = [
  { name: "TV", icon: "tv", kind: "power", enabled: true, uncertainty: 0.2, watts: 90, hoursPerDay: 3, daysPerWeek: 7 },
  { name: "Roteador Wi-Fi", icon: "wifi", kind: "power", enabled: true, uncertainty: 0.1, watts: 10, hoursPerDay: 24, daysPerWeek: 7 },
  { name: "Chuveiro elétrico", icon: "shower-head", kind: "power", enabled: true, uncertainty: 0.3, watts: 5500, hoursPerDay: 0.25, daysPerWeek: 7 },
  { name: "Air fryer", icon: "cooking-pot", kind: "perUse", enabled: true, uncertainty: 0.25, kwhPerUse: 0.5, usesPerWeek: 3 },
  { name: "Micro-ondas", icon: "microwave", kind: "power", enabled: true, uncertainty: 0.25, watts: 1200, hoursPerDay: 0.15, daysPerWeek: 7 },
  { name: "Máquina de lavar", icon: "washing-machine", kind: "perUse", enabled: true, uncertainty: 0.3, kwhPerUse: 0.5, usesPerWeek: 2 },
  { name: "Iluminação (LED)", icon: "lightbulb", kind: "power", enabled: true, uncertainty: 0.25, watts: 50, hoursPerDay: 5, daysPerWeek: 7 },
];
