import { describe, expect, it } from "vitest";
import { defaultState } from "./defaults";
import { parseBackup } from "./storage";
import { waterHistoryCsv } from "./export";
import { diffSharedRecords, fromSharedRecords, toSharedRecords } from "./cloud-records";

describe("Contas de água do Voltara", () => {
  it("mantém backups antigos compatíveis", () => {
    const state = defaultState() as unknown as Record<string, unknown>;
    delete state.waterBills;
    const upgraded = parseBackup(JSON.stringify(state));
    expect(upgraded.waterBills).toEqual([]);
    expect(upgraded.bills).toEqual([]);
    expect(upgraded.expenses).toEqual([]);
  });

  it("preserva uma conta de água no backup e no CSV", () => {
    const state = defaultState();
    state.waterBills = [{ id: "agua-jan", month: "2027-01", value: 95.5, m3: 12.75, note: "Leitura real" }];
    const restored = parseBackup(JSON.stringify(state));
    expect(restored.waterBills).toEqual(state.waterBills);
    expect(waterHistoryCsv(state)).toContain("12,75");
    expect(waterHistoryCsv(state)).toContain("Leitura real");
    expect(waterHistoryCsv(state)).not.toContain("consumo_kwh");
  });

  it("não confunde contas de água com as contas de luz", () => {
    const state = defaultState();
    state.bills = [{ id: "luz", month: "2027-01", value: 240, kwh: 151 }];
    state.waterBills = [{ id: "agua", month: "2027-01", value: 75, m3: 10 }];
    const restored = fromSharedRecords(toSharedRecords(state));
    expect(restored.bills).toEqual(state.bills);
    expect(restored.waterBills).toEqual(state.waterBills);
    expect(toSharedRecords(state).find((r) => r.kind === "water_bill")).toBeDefined();
  });

  it("identifica a inclusão de uma fatura por vez na nuvem", () => {
    const before = defaultState();
    const after = { ...before, waterBills: [{ id: "agua", month: "2027-01", value: 82 }] };
    const diff = diffSharedRecords(toSharedRecords(before), toSharedRecords(after));
    expect(diff).toEqual([{ operation: "upsert", kind: "water_bill", record_key: "agua", document: after.waterBills[0] }]);
  });

  it("rejeita contas inválidas e meses duplicados sem perder os dados", () => {
    const state = defaultState();
    state.waterBills = [{ id: "a", month: "2027-02", value: 100, m3: -2 }];
    expect(() => parseBackup(JSON.stringify(state))).toThrow();
    state.waterBills[0]!.m3 = 15;
    state.waterBills.push({ id: "b", month: "2027-02", value: 150 });
    expect(() => parseBackup(JSON.stringify(state))).toThrow();
    state.waterBills[1]!.month = "2027-03";
    expect(parseBackup(JSON.stringify(state)).waterBills).toHaveLength(2);
  });
});
