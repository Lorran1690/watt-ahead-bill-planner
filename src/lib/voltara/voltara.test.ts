import { describe, expect, it } from "vitest";
import { applianceKwh, billError, calibrate, confidence, daysInMonth, dayTypeCounts, forecastMonth, modelKwh } from "./calc";
import { defaultState } from "./defaults";
import { expenseTotal, expensesForMonth, isValidExpenseDate, localDateKey, parseExpenseAmount } from "./expenses";
import { expensesCsv } from "./export";
import { loadState, parseBackup, saveState, STORAGE_KEY, type KV } from "./storage";
import type { VoltaraState } from "./types";

const memKV = (): KV & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
};
const find = (s: VoltaraState, id: string) => s.appliances.find((a) => a.id === id)!;

describe("dias do mês", () => {
  it("fevereiro bissexto e comum", () => {
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2027-02")).toBe(28);
    expect(daysInMonth("2026-11")).toBe(30);
  });
  it("conta dias úteis/sábados/domingos de nov/2026", () => {
    expect(dayTypeCounts("2026-11")).toEqual({ weekday: 21, saturday: 4, sunday: 5, total: 30 });
  });
});

describe("calculadora", () => {
  const s = defaultState();
  it("ventilador: 75 W × 8 h × 30 dias = 18 kWh", () => {
    expect(applianceKwh(find(s, "ventilador"), "2026-11")).toBeCloseTo(18, 5);
  });
  it("geladeira usa etiqueta (40 kWh/30 dias), não W × 24h", () => {
    expect(applianceKwh(find(s, "geladeira"), "2026-11")).toBeCloseTo(40, 5);
    expect(applianceKwh(find(s, "geladeira"), "2026-12")).toBeCloseTo(40 * 31 / 30, 5);
  });
  it("scooter: 1,2 kWh × 30 recargas = 36 kWh", () => {
    expect(applianceKwh(find(s, "scooter"), "2026-11")).toBeCloseTo(36, 5);
  });
  it("PC fica perto de 16 kWh/mês", () => {
    const v = applianceKwh(find(s, "pc"), "2026-11");
    expect(v).toBeGreaterThan(14);
    expect(v).toBeLessThan(18);
  });
  it("aparelho desabilitado não consome", () => {
    expect(applianceKwh({ ...find(s, "ventilador"), enabled: false }, "2026-11")).toBe(0);
  });
});

describe("calibração", () => {
  it("previsão do mês de referência reproduz R$ 220 (sem contagem dupla)", () => {
    const s = defaultState();
    expect(forecastMonth(s, "2026-11").cost).toBeCloseTo(220, 6);
  });
  it("adicionar aparelho reduz o resíduo e mantém o total do mês de referência", () => {
    const s = defaultState();
    const before = calibrate(s).residualPerDay;
    const s2: VoltaraState = { ...s, appliances: [...s.appliances, { id: "tv", name: "TV", icon: "tv", kind: "power", enabled: true, uncertainty: 0.2, watts: 100, hoursPerDay: 4, daysPerWeek: 7 }] };
    expect(calibrate(s2).residualPerDay).toBeCloseTo(before - 0.4, 6);
    expect(forecastMonth(s2, "2026-11").cost).toBeCloseTo(220, 6);
  });
  it("modelo maior que a conta zera o resíduo e sinaliza", () => {
    const s = defaultState();
    s.settings.referenceValue = 50;
    const c = calibrate(s);
    expect(c.overshoot).toBe(true);
    expect(c.residualPerDay).toBe(0);
  });
  it("conta com kWh calibra pelo kWh e encargos fixos não são cobrados duas vezes", () => {
    const s = defaultState();
    s.settings.fixedCharges = 20;
    s.bills = [{ id: "b1", month: "2027-01", value: 250, kwh: 170 }];
    const c = calibrate(s);
    expect(c.source).toBe("bill");
    expect(c.billKwh).toBe(170);
    expect(forecastMonth(s, "2027-01").kwh).toBeCloseTo(170, 6);
    expect(forecastMonth(s, "2027-01").cost).toBeCloseTo(170 * 1.35 + 20, 6);
    expect(modelKwh(s.appliances, "2027-01")).toBeLessThan(170);
  });
  it("erro de previsão exclui a própria conta", () => {
    const s = defaultState();
    s.bills = [{ id: "b1", month: "2026-12", value: 240 }];
    const e = billError(s, s.bills[0]!);
    expect(e.predicted).toBeGreaterThan(200);
    expect(e.error).toBeCloseTo(e.predicted - 240, 6);
  });
});

describe("persistência", () => {
  it("sinaliza falha de gravação sem apagar dados em memória", () => {
    const s=defaultState();
    expect(saveState(null,s)).toBe(false);
    expect(saveState({getItem:()=>null,setItem:()=>{throw Error("QuotaExceeded");}},s)).toBe(false);
    expect(saveState(memKV(),s)).toBe(true);
  });
  it("salva e carrega", () => {
    const kv = memKV();
    const s = defaultState();
    s.settings.tariff = 1.5;
    saveState(kv, s);
    expect(loadState(kv).settings.tariff).toBe(1.5);
  });
  it("dado corrompido volta aos padrões", () => {
    const kv = memKV();
    kv.data[STORAGE_KEY] = "{oops";
    expect(loadState(kv).settings.referenceValue).toBe(220);
  });
  it("backup inválido é rejeitado", () => {
    expect(() => parseBackup(JSON.stringify({ foo: 1 }))).toThrow();
    expect(parseBackup(JSON.stringify(defaultState())).appliances).toHaveLength(4);
  });
});


describe("segurança e histórico", () => {
  it("rejeita valores negativos, infinitos e dados de aparelho falsificados", () => {
    const s = defaultState();
    s.settings.tariff = -1;
    expect(() => parseBackup(JSON.stringify(s))).toThrow();
    s.settings.tariff = 1.35;
    const pc = s.appliances.find((a) => a.id === "pc");
    if (!pc || pc.kind !== "power") throw new Error("PC não encontrado");
    pc.watts = -500;
    expect(() => parseBackup(JSON.stringify(s))).toThrow();
    pc.watts = 100;
    s.settings.tariff = Infinity;
    expect(() => parseBackup(JSON.stringify(s))).toThrow();
  });
  it("rejeita faturas duplicadas e consumos impossíveis", () => {
    const s = defaultState();
    s.bills = [
      { id: "a", month: "2027-01", value: 250 },
      { id: "b", month: "2027-01", value: 270 },
    ];
    expect(() => parseBackup(JSON.stringify(s))).toThrow();
    s.bills = [{ id: "a", month: "2027-01", value: 250, kwh: -20 }];
    expect(() => parseBackup(JSON.stringify(s))).toThrow();
  });
  it("usa a conta registrada quando ela coincide com o mês de referência", () => {
    const s = defaultState();
    s.bills = [{ id: "novo", month: "2026-11", value: 240 }];
    expect(calibrate(s).billValue).toBe(240);
    expect(calibrate(s).source).toBe("bill");
  });
  it("não usa contas futuras para estimar o erro de uma conta antiga", () => {
    const s = defaultState();
    const jan = { id: "jan", month: "2027-01", value: 240 };
    s.bills = [jan, { id: "mar", month: "2027-03", value: 900 }];
    const a = billError(s, jan).predicted;
    const b = billError({ ...s, bills: [jan] }, jan).predicted;
    expect(a).toBeCloseTo(b, 6);
  });
  it("não classifica como alta confiança a referência que só contém preço", () => {
    expect(confidence(defaultState(), "2026-11").level).toBe("média");
    const s = defaultState();
    s.bills = [{ id: "real", month: "2026-11", value: 220, kwh: 160 }];
    expect(confidence(s, "2026-11").level).toBe("alta");
  });
  it("o cenário de economia mantém o resíduo fixo e não muda o perfil original", () => {
    const s = defaultState();
    const base = forecastMonth(s, "2026-11");
    const r = calibrate(s).residualPerDay;
    const appliances = s.appliances.map((a) =>
      a.id === "ventilador" && a.kind === "power" ? { ...a, hoursPerDay: 7 } : a);
    const simulated = forecastMonth({ ...s, appliances }, "2026-11", { residualPerDay: r });
    expect(simulated.cost).toBeLessThan(base.cost);
    expect(forecastMonth(s, "2026-11").cost).toBeCloseTo(220, 6);
  });
});


describe("controle de gastos diários", () => {
  it("usa a data local do dia, sem ajuste de fuso UTC", () => {
    expect(localDateKey(new Date(2026, 10, 23, 23, 55))).toBe("2026-11-23");
  });
  it("reconhece datas reais e anos bissextos", () => {
    expect(isValidExpenseDate("2028-02-29")).toBe(true);
    expect(isValidExpenseDate("2027-02-29")).toBe(false);
    expect(isValidExpenseDate("2026-11-31")).toBe(false);
  });
  it("aceita vírgula ou ponto e rejeita valores inválidos", () => {
    expect(parseExpenseAmount(" 25,90 ")).toBe(25.90);
    expect(parseExpenseAmount("25.90")).toBe(25.90);
    expect(parseExpenseAmount("0,01")).toBe(0.01);
    expect(parseExpenseAmount("-5")).toBeNull();
    expect(parseExpenseAmount("1,999")).toBeNull();
    expect(parseExpenseAmount("abc")).toBeNull();
    expect(parseExpenseAmount("0")).toBeNull();
  });
  it("soma lançamentos distintos no mesmo dia e separa meses", () => {
    const s = defaultState();
    s.expenses = [
      { id: "a", date: "2026-11-23", amount: 10.10, note: "Almoço" },
      { id: "b", date: "2026-11-23", amount: 20.20, note: "Mercado" },
      { id: "c", date: "2026-12-01", amount: 3, note: "Ônibus" },
    ];
    expect(expensesForMonth(s.expenses, "2026-11")).toHaveLength(2);
    expect(expenseTotal(expensesForMonth(s.expenses, "2026-11"))).toBeCloseTo(30.3, 2);
    expect(expenseTotal(expensesForMonth(s.expenses, "2026-12"))).toBe(3);
    expect(expensesCsv(s, "2026-11")).toContain("Mercado");
    expect(expensesCsv(s, "2026-11")).not.toContain("Ônibus");
  });
  it("restaura backups antigos sem gastos e preserva os novos", () => {
    const legacy = defaultState() as unknown as Record<string, unknown>;
    delete legacy.expenses;
    expect(parseBackup(JSON.stringify(legacy)).expenses).toEqual([]);

    const s = defaultState();
    s.expenses = [{ id: "compra1", date: "2026-11-23", amount: 17.4, note: "Padaria; café" }];
    const kv = memKV();
    saveState(kv, s);
    expect(loadState(kv).expenses).toEqual(s.expenses);
    expect(parseBackup(JSON.stringify(s)).expenses).toEqual(s.expenses);
    expect(expensesCsv(s)).toContain('"Padaria; café"');
  });
  it("rejeita gastos negativos, datas impossíveis e IDs repetidos", () => {
    const s = defaultState();
    s.expenses = [{ id: "a", date: "2026-02-30", amount: 10, note: "" }];
    expect(() => parseBackup(JSON.stringify(s))).toThrow();
    s.expenses[0]!.date = "2026-11-23";
    s.expenses[0]!.amount = -15;
    expect(() => parseBackup(JSON.stringify(s))).toThrow();
    s.expenses[0]!.amount = 10;
    s.expenses.push({ id: "a", date: "2026-11-24", amount: 20, note: "Mercado" });
    expect(() => parseBackup(JSON.stringify(s))).toThrow();
  });
  it("não interfere na previsão do consumo de energia", () => {
    const s = defaultState();
    const original = forecastMonth(s, "2026-11").cost;
    s.expenses.push({ id: "a", date: "2026-11-23", amount: 70, note: "Compras" });
    expect(forecastMonth(s, "2026-11").cost).toBeCloseTo(original, 6);
  });
});
