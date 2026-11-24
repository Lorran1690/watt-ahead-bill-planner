import { describe, expect, it } from "vitest";
import { defaultState } from "./defaults";
import {
  diffSharedRecords, fromSharedRecords, toRecordMap, toSharedRecords,
} from "./cloud-records";

describe("registros compartilhados do Voltara", () => {
  it("preserva dados atuais ao converter para registros por item", () => {
    const state = defaultState();
    state.expenses.push({ id: "x1", date: "2026-11-23", note: "Mercado", amount: 24.90 });
    state.bills.push({ id: "energia-jan", month: "2027-01", value: 250, kwh: 140 });
    const restored = fromSharedRecords(toSharedRecords(state));
    expect(restored).toEqual(state);
  });

  it("duas pessoas adicionando despesas independentes não sobrescrevem a lista inteira", () => {
    const base = defaultState();
    const owner = { ...base, expenses: [{ id: "owner", date: "2026-11-23", note: "Almoço", amount: 30 }] };
    const spouse = { ...base, expenses: [{ id: "spouse", date: "2026-11-23", note: "Farmácia", amount: 15 }] };
    const ownerChanges = diffSharedRecords(toSharedRecords(base), toSharedRecords(owner));
    const spouseChanges = diffSharedRecords(toSharedRecords(base), toSharedRecords(spouse));
    expect(ownerChanges).toHaveLength(1);
    expect(spouseChanges).toHaveLength(1);
    expect(ownerChanges[0]).toMatchObject({ operation: "upsert", kind: "expense", record_key: "owner" });
    expect(spouseChanges[0]).toMatchObject({ operation: "upsert", kind: "expense", record_key: "spouse" });
  });

  it("exclusão de uma despesa não apaga os outros itens", () => {
    const state = defaultState();
    state.expenses = [
      { id: "a", date: "2026-11-23", note: "Mercado", amount: 25 },
      { id: "b", date: "2026-11-23", note: "Transporte", amount: 5 },
    ];
    const later = { ...state, expenses: state.expenses.filter((e) => e.id !== "a") };
    const changes = diffSharedRecords(toSharedRecords(state), toSharedRecords(later));
    expect(changes).toEqual([{ operation: "delete", kind: "expense", record_key: "a" }]);
  });

  it("separa alterações das configurações de alterações de despesas", () => {
    const base = defaultState();
    const changed = { ...base, settings: { ...base.settings, tariff: 1.5 } };
    expect(diffSharedRecords(toSharedRecords(base), toSharedRecords(changed))).toEqual([
      { operation: "upsert", kind: "meta", record_key: "settings", document: changed.settings },
    ]);
  });

  it("contém uma chave estável por lançamento", () => {
    const state = defaultState();
    state.expenses.push({ id: "a", date: "2026-11-23", note: "Mercado", amount: 100 });
    const records = toRecordMap(toSharedRecords(state));
    expect(records.get("expense:a")?.document).toMatchObject({ amount: 100 });
    expect(records.has("bill:a")).toBe(false);
  });
});
