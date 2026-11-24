import type { DailyExpense } from "./types";

/**
 * Planta ilustrativa da casa: sete áreas de gasto, seis ambientes físicos.
 * Cozinha americana e copa formam UM espaço aberto, sem parede interna.
 * As posições não representam medidas reais. Ajustaremos após receber fotos/vídeos.
 */
export const HOUSE_ROOMS = [
  { id: "sala", name: "Sala grande", short: "Sala", description: "Móveis, decoração e entretenimento", color: "#9479e6", x: -5.4, z: -2.2, width: 4.8, depth: 4.4 },
  { id: "copa", name: "Copa", short: "Copa", description: "Refeições e mesa integrada à cozinha americana", color: "#e1a66b", x: -1.6, z: -2.2, width: 2.8, depth: 4.4 },
  { id: "cozinha", name: "Cozinha americana", short: "Cozinha", description: "Bancadas e eletrodomésticos no mesmo ambiente da copa", color: "#dab86f", x: 1.65, z: -2.2, width: 3.7, depth: 4.4 },
  { id: "banheiro", name: "Banheiro", short: "Banheiro", description: "Louças, banho e reparos", color: "#62b5b3", x: 4.75, z: -2.2, width: 2.5, depth: 4.4 },
  { id: "quarto1", name: "Quarto grande 1", short: "Quarto 1", description: "Cama, guarda-roupa e decoração", color: "#6d95d7", x: -5.4, z: 2.2, width: 4.8, depth: 4.4 },
  { id: "escritorio", name: "Escritório", short: "Escritório", description: "Computador, mesa e trabalho", color: "#bd91cf", x: -1, z: 2.2, width: 4, depth: 4.4 },
  { id: "quarto2", name: "Quarto grande 2", short: "Quarto 2", description: "Móveis, itens pessoais e reparos", color: "#84a5b2", x: 3.5, z: 2.2, width: 5, depth: 4.4 },
] as const;

export type HouseRoomId = (typeof HOUSE_ROOMS)[number]["id"];

export const isHouseRoom = (value: unknown): value is HouseRoomId =>
  typeof value === "string" && HOUSE_ROOMS.some((room) => room.id === value);

export function roomName(room?: HouseRoomId): string {
  return HOUSE_ROOMS.find((item) => item.id === room)?.name ?? "Sem cômodo";
}

/** Aproximações somente sugeridas. Nunca classificar gastos sem confirmação explícita. */
const ROOM_HINTS: ReadonlyArray<{ room: HouseRoomId; terms: string[] }> = [
  { room: "cozinha", terms: ["geladeira", "fogao", "panela", "forno", "microondas", "pia da cozinha", "armario da cozinha", "cooktop"] },
  { room: "copa", terms: ["mesa de jantar", "cadeira da copa", "copa", "jogo americano", "jogo de jantar"] },
  { room: "sala", terms: ["sofa", "televisao", "rack", "tapete da sala", "cortina da sala", "painel da tv"] },
  { room: "quarto1", terms: ["quarto 1", "primeiro quarto"] },
  { room: "quarto2", terms: ["quarto 2", "segundo quarto"] },
  { room: "banheiro", terms: ["chuveiro", "vaso sanitario", "box do banheiro", "pia do banheiro", "descarga"] },
  { room: "escritorio", terms: ["teclado", "mouse", "escrivaninha", "mesa do computador", "impressora", "monitor"] },
];

export function suggestedRoom(note: string): HouseRoomId | null {
  const normalized = note.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ROOM_HINTS.find(({ terms }) => terms.some((term) => normalized.includes(term)))?.room ?? null;
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
  const scoped = month ? expenses.filter((expense) => expense.date.startsWith(month + "-")) : [...expenses];
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
