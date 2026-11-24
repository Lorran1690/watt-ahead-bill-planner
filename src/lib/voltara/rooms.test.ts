import { describe, expect, it } from "vitest";
import { defaultState } from "./defaults";
import { expensesCsv } from "./export";
import { HOUSE_ROOMS, isHouseRoom, roomName, spendByRoom, suggestedRoom } from "./rooms";
import { parseBackup } from "./storage";

describe("Casa 3D e gastos por ambiente", () => {
  it("representa os sete setores reais informados, sem inventar lavanderia", () => {
    expect(HOUSE_ROOMS.map((room) => room.id)).toEqual([
      "sala", "copa", "cozinha", "banheiro", "quarto1", "escritorio", "quarto2",
    ]);
    expect(HOUSE_ROOMS.filter((room) => room.name.includes("Quarto grande"))).toHaveLength(2);
    expect(HOUSE_ROOMS.some((room) => room.id === "lavanderia")).toBe(false);
  });

  it("copa e cozinha americana ocupam espaços adjacentes, sem gap para parede", () => {
    const copa = HOUSE_ROOMS.find((room) => room.id === "copa")!;
    const cozinha = HOUSE_ROOMS.find((room) => room.id === "cozinha")!;
    expect(copa.x + copa.width / 2).toBeCloseTo(cozinha.x - cozinha.width / 2, 6);
    expect(copa.z).toBe(cozinha.z);
    expect(copa.depth).toBe(cozinha.depth);
  });

  it("soma por cômodo, preserva outros gastos e filtra o mês", () => {
    const s = defaultState();
    s.expenses = [
      { id: "c1", date: "2026-11-24", amount: 100, note: "Bancada", room: "cozinha" },
      { id: "c2", date: "2026-11-24", amount: 50.5, note: "Panela", room: "cozinha" },
      { id: "cp1", date: "2026-11-24", amount: 75.5, note: "Mesa", room: "copa" },
      { id: "u1", date: "2026-11-24", amount: 25, note: "Ônibus" },
      { id: "d1", date: "2026-12-01", amount: 15, note: "Lâmpada", room: "sala" },
    ];
    const result = spendByRoom(s.expenses, "2026-11");
    expect(result.rooms.find((item) => item.room === "cozinha")).toMatchObject({ total: 150.5, count: 2 });
    expect(result.rooms.find((item) => item.room === "copa")).toMatchObject({ total: 75.5, count: 1 });
    expect(result.unassigned).toBe(25);
    expect(result.unassignedCount).toBe(1);
    expect(result.total).toBe(251);
    expect(spendByRoom(s.expenses, "2026-12").total).toBe(15);
    expect(spendByRoom(s.expenses).total).toBe(266);
  });

  it("nome e cômodo são preservados em backup e CSV", () => {
    const s = defaultState();
    s.expenses = [{ id: "coz", date: "2026-11-24", note: "Cooktop", amount: 599.9, room: "cozinha" }];
    expect(parseBackup(JSON.stringify(s)).expenses[0]?.room).toBe("cozinha");
    expect(expensesCsv(s)).toContain('"Cozinha americana"');
    expect(roomName("copa")).toBe("Copa");
    expect(isHouseRoom("quarto1")).toBe(true);
    expect(isHouseRoom("lavanderia")).toBe(false);
  });

  it("migra dados antigos para a nova lista sem apagar as despesas", () => {
    const s = defaultState();
    const oldBackup: unknown = {
      ...s,
      expenses: [
        { id: "a", date: "2026-11-23", note: "Cama", amount: 120, room: "quarto" },
        { id: "b", date: "2026-11-23", note: "Sabão", amount: 20, room: "lavanderia" },
      ],
    };
    const restored = parseBackup(JSON.stringify(oldBackup));
    expect(restored.expenses[0]?.room).toBe("quarto1");
    expect(restored.expenses[1]?.room).toBeUndefined();
    expect(restored.expenses.map((item) => item.amount)).toEqual([120, 20]);
  });

  it("anotações apenas sugerem o cômodo: não classificam automaticamente", () => {
    expect(suggestedRoom("Comprar GELADEIRA")).toBe("cozinha");
    expect(suggestedRoom("mesa de jantar")).toBe("copa");
    expect(suggestedRoom("Chuveiro")).toBe("banheiro");
    expect(suggestedRoom("posto de gasolina")).toBeNull();
  });
});
