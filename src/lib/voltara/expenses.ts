import type { DailyExpense, MonthKey } from "./types";

/** Data local do aparelho, sem converter para UTC (evita trocar de dia no Brasil). */
export function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

export function isValidExpenseDate(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

/** Aceita valores em centavos usando ponto ou vírgula, sem arredondamentos silenciosos. */
export function parseExpenseAmount(text: string): number | null {
  const value = text.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const amount = Number(value.replace(",", "."));
  return Number.isFinite(amount) && amount >= 0.01 && amount <= 1_000_000 ? amount : null;
}

export function expensesForMonth(expenses: DailyExpense[], month: MonthKey): DailyExpense[] {
  return expenses
    .filter((expense) => expense.date.startsWith(month + "-"))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function expenseTotal(expenses: DailyExpense[]): number {
  return Math.round(expenses.reduce((sum, expense) => sum + Math.round(expense.amount * 100), 0)) / 100;
}
