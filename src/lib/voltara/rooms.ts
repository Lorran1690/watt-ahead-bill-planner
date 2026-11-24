import type { DailyExpense } from "./types";

/** A planta 3D inicial representa uma casa de exemplo com seis cômodos.
 * Nenhum gasto é classificado sem seleção explícita do usuário.
 */
export const HOUSE_ROOMS = [
  { id: "sala", name: "Sala", short: "Sala", description: "Móveis, decoração e entretenimento", color: "#7461bd", x: -3.6, z: -1.75 },
  { id: "cozinha", name: "Cozinha", short: "Cozinha", description: "Eletrodomésticos e utensílios", color: "#d8a866", x: 0, z: -1.75 },
  { id: "quarto", name: "Quarto", short: "Quarto", description: "Cama, guarda-roupa e conforto", color: "#638bc5", x: 3.6, z: -1.75 },
  { id: "banheiro", name: "Banheiro", short: "Banheiro", description: "Higiene, chuveiro e reparos", color: "#55a6a4", x: -3.6, z: 1.75 },
  { id: "lavanderia", name: "Lavanderia", short: "Lavanderia", description: "Lavagem e manutenção", color: "#77a87b", x: 0, z: 1.75 },
  { id: "escritorio", name: "Escritório", short: "Escritório", description: "Mesa, computador e trabalho", color: "#b884b7", x: 3.6, z: 1.75 },
] as const;

export type HouseRoomId = (typeof HOUSE_ROOMS)[number]["id"];
export const isHouseRoom = (value: unknown): value is HouseRoomId =>
  typeof value === "string" && HOUSE_ROOMS.some((room) => room.id === value);

export function roomName(room?: HouseRoomId): string {
  return HOUSE_ROOMS.find((item) => item.id === room)?.name ?? "Sem cômodo";
}

/** Heurística apenas para sugestão visual; nunca altera ou salva um gasto automaticamente. */
const ROOM_HINTS: ReadonlyArray<{ room: HouseRoomId; terms: string[] }> = [
  { room: "cozinha", terms: ["geladeira", "fogao", "panela", "forno", "microondas", "torneira da cozinha", "armario da cozinha"] },
  { room: "sala", terms: ["sofa", "televisao", "rack", "tapete da sala", "cortina da sala"] },
  { room: "quarto", terms: ["cama", "colchao", "travesseiro", "guarda roupa", "lencol", "roupa de cama"] },
  { room: "banheiro", terms: ["chuveiro", "vaso sanitario", "box do banheiro", "pia do banheiro", "descarga"] },
  { room: "lavanderia", terms: ["maquina de lavar", "sabao em po", "tanquinho", "varal", "lavanderia"] },
  { room: "escritorio", terms: ["teclado", "mouse", "escrivaninha", "mesa do computador", "impressora", "monitor"] },
];
export function suggestedRoom(note: string): HouseRoomId | null {
  const normalized = note.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const candidate = ROOM_HINTS.find((group) => group.terms.some((term) => normalized.includes(term)));
  return candidate?.room ?? null;
}

export interface RoomSpending {
  room: HouseRoomId;
  total: number;
  count: number;
}

export function spendByRoom(expenses: readonly DailyExpense[], month?: string): {
  rooms: RoomSpending[];
  unassigned: number;
  unassignedCount: number;
  total: number;
} {
  const scoped = month ? expenses.filter((expense) => expense.date.startsWith(month + "-")) : expenses;
  const rooms = HOUSE_ROOMS.map((room) => {
    const related = scoped.filter((expense) => expense.room === room.id);
    return {
      room: room.id,
      count: related.length,
      total: Math.round(related.reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0)) / 100,
    };
  });
  const noRoom = scoped.filter((expense) => !expense.room || !isHouseRoom(expense.room));
  return {
    rooms,
    unassigned: Math.round(noRoom.reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0)) / 100,
    unassignedCount: noRoom.length,
    total: Math.round(scoped.reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0)) / 100,
  };
}
