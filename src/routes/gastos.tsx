import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Download, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Notice, PageHeader, Panel } from "@/components/voltara/ui";
import { download, expensesCsv } from "@/lib/voltara/export";
import {
  expenseTotal, expensesForMonth, isValidExpenseDate, localDateKey, parseExpenseAmount,
} from "@/lib/voltara/expenses";
import { currentMonthKey, money, monthLong, uid } from "@/lib/voltara/format";
import { HOUSE_ROOMS, isHouseRoom, roomName, suggestedRoom, type HouseRoomId } from "@/lib/voltara/rooms";
import { setVoltara, useVoltara } from "@/lib/voltara/store";
import type { DailyExpense } from "@/lib/voltara/types";

export const Route = createFileRoute("/gastos")({
  validateSearch: (search: Record<string, unknown>): { room?: HouseRoomId } =>
    isHouseRoom(search.room) ? { room: search.room } : {},
  head: () => ({
    meta: [
      { title: "Controle de gastos — Voltara" },
      { name: "description", content: "Registre despesas por dia com data automática, anotação e valor em reais." },
    ],
  }),
  component: ExpensesPage,
});

const dayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const formatDay = (date: string) => dayFormatter.format(new Date(date + "T12:00:00"));

function ExpensesPage() {
  const state = useVoltara();
  const search = Route.useSearch();
  const [room, setRoom] = useState<HouseRoomId | "">(() => search.room ?? "");
  const [date, setDate] = useState(() => localDateKey());
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthKey());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const today = localDateKey();
  const records = expensesForMonth(state.expenses, selectedMonth);
  const suggestion = room ? null : suggestedRoom(note);
  const monthlyTotal = expenseTotal(records);
  const todayTotal = expenseTotal(state.expenses.filter((item) => item.date === today));
  const grouped = new Map<string, DailyExpense[]>();
  for (const expense of records) {
    const group = grouped.get(expense.date) ?? [];
    group.push(expense);
    grouped.set(expense.date, group);
  }

  function clearForm() {
    setEditingId(null);
    setDate(localDateKey());
    setNote("");
    setAmount("");
    setRoom(search.room ?? "");
    setError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = parseExpenseAmount(amount);
    if (!isValidExpenseDate(date)) {
      setError("Informe uma data válida.");
      setFeedback("");
      return;
    }
    if (value === null) {
      setError("Informe um valor maior que zero, com no máximo duas casas decimais.");
      setFeedback("");
      return;
    }
    if (note.length > 240) {
      setError("A anotação deve ter até 240 caracteres.");
      setFeedback("");
      return;
    }

    const item: DailyExpense = {
      id: editingId ?? uid(),
      date,
      note: note.trim(),
      amount: value,
      ...(room ? { room } : {}),
    };
    // Um mesmo dia pode conter quantas despesas forem necessárias.
    setVoltara((previous) => ({
      ...previous,
      expenses: editingId
        ? previous.expenses.map((existing) => existing.id === editingId ? item : existing)
        : [...previous.expenses, item],
    }));
    setSelectedMonth(date.slice(0, 7));
    setPendingDelete(null);
    setFeedback(editingId ? "Gasto atualizado com sucesso." : "Gasto registrado com sucesso.");
    clearForm();
  }

  function beginEdit(item: DailyExpense) {
    setEditingId(item.id);
    setDate(item.date);
    setNote(item.note);
    setAmount(item.amount.toFixed(2).replace(".", ","));
    setRoom(item.room ?? "");
    setPendingDelete(null);
    setError("");
    setFeedback("Editando o lançamento. Salve para confirmar.");
  }

  function remove(id: string) {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      return;
    }
    setVoltara((previous) => ({
      ...previous,
      expenses: previous.expenses.filter((item) => item.id !== id),
    }));
    if (editingId === id) clearForm();
    setPendingDelete(null);
    setFeedback("Gasto excluído.");
    setError("");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Controle de gastos"
        subtitle="Anote o que gastou, em qual dia e quanto. A data de hoje já vem preenchida."
        action={state.expenses.length > 0 ? (
          <Button type="button" variant="outline" size="sm"
            onClick={() => download("voltara-gastos.csv", expensesCsv(state), "text/csv;charset=utf-8")}>
            <Download className="mr-2 size-4" /> Exportar gastos
          </Button>
        ) : undefined}
      />
      <Notice>
        Seus gastos do cotidiano são independentes da conta de luz. Os registros ficam salvos
        neste navegador ou na casa compartilhada quando a sincronização estiver ativa.
        Os gastos por cômodo aparecem na <Link to="/casa-3d" className="underline">Casa 3D</Link>.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wallet className="size-4 text-primary" /> Total do mês selecionado</div>
          <p className="mt-2 text-2xl font-semibold tabular">{money(monthlyTotal)}</p>
          <p className="mt-1 text-xs capitalize text-muted-foreground">{monthLong(selectedMonth)}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-4 text-primary" /> Gastos de hoje</div>
          <p className="mt-2 text-2xl font-semibold tabular">{money(todayTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{today.split("-").reverse().join("/")}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Registros no mês</p>
          <p className="mt-2 text-2xl font-semibold tabular">{records.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {grouped.size === 0 ? "Sem dias registrados" : "Média nos dias com gastos: " + money(monthlyTotal / grouped.size)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title={editingId ? "Editar gasto" : "Adicionar gasto"} hint="Data automática, com opção de escolher outro dia" className="lg:col-span-2">
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="expense-date">Data do gasto</Label>
              <Input id="expense-date" type="date" required value={date}
                onChange={(e) => setDate(e.target.value)} />
              <p className="text-xs text-muted-foreground">Preenchida com a data local de hoje. Você pode alterar.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-note">Anotação do dia</Label>
              <Textarea id="expense-note" rows={3} maxLength={240} value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex.: mercado, almoço, combustível..." />
              <p className="text-xs text-muted-foreground">{note.length}/240 caracteres. Opcional.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-room">Cômodo da casa (opcional)</Label>
              <select id="expense-room" value={room}
                onChange={(event) => setRoom(isHouseRoom(event.target.value) ? event.target.value : "")}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="">Gasto geral / sem cômodo</option>
                {HOUSE_ROOMS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {suggestion && (
                <p className="text-xs text-muted-foreground">Talvez seja {roomName(suggestion).toLowerCase()}.{" "}
                  <button type="button" className="font-medium text-primary underline"
                    onClick={() => setRoom(suggestion)}>Associar a este cômodo</button>
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Cozinha americana e copa são duas áreas de gastos no mesmo ambiente aberto.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-amount">Valor gasto (R$)</Label>
              <Input id="expense-amount" type="text" inputMode="decimal" autoComplete="off"
                value={amount} onChange={(e) => setAmount(e.target.value)} required
                placeholder="Ex.: 25,90" />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {feedback && <p role="status" className="text-sm text-success">{feedback}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="flex-1">
                <Plus className="mr-2 size-4" /> {editingId ? "Salvar alteração" : "Registrar gasto"}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={() => { clearForm(); setFeedback(""); }}>
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </Panel>

        <Panel title="Histórico por dia" hint="Cada dia mostra suas anotações e o total gasto" className="lg:col-span-3">
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="expense-filter">Mês exibido</Label>
              <Input id="expense-filter" type="month" value={selectedMonth}
                onChange={(e) => {
                  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setSelectedMonth(e.target.value);
                }} />
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setSelectedMonth(currentMonthKey())}>
              Ir para este mês
            </Button>
          </div>

          {records.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-10 text-center">
              <Wallet className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-medium">Nenhum gasto registrado neste mês.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Preencha a data, uma anotação e o valor ao lado para começar.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(grouped.entries()).map(([day, items]) => (
                <section key={day} className="overflow-hidden rounded-xl border">
                  <header className="flex flex-wrap items-center justify-between gap-2 bg-accent/30 px-3 py-2.5">
                    <h3 className="text-sm font-semibold capitalize">{formatDay(day)}</h3>
                    <span className="text-sm font-semibold tabular">{money(expenseTotal(items))}</span>
                  </header>
                  <div className="divide-y">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="whitespace-pre-wrap break-words text-sm">
                            {item.note.trim() || <span className="italic text-muted-foreground">Sem anotação</span>}
                            {item.room && <span className="mt-1 block text-xs text-primary">{roomName(item.room)}</span>}
                          </p>
                          <p className="mt-1 text-sm font-semibold tabular">{money(item.amount)}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-1">
                          <Button type="button" size="icon" variant="ghost" aria-label="Editar gasto"
                            onClick={() => beginEdit(item)} title="Editar gasto">
                            <Pencil className="size-4" />
                          </Button>
                          <Button type="button" size={pendingDelete === item.id ? "sm" : "icon"}
                            variant={pendingDelete === item.id ? "destructive" : "ghost"}
                            aria-label={pendingDelete === item.id ? "Confirmar exclusão" : "Excluir gasto"}
                            title="Excluir gasto" onClick={() => remove(item.id)}>
                            {pendingDelete === item.id ? "Confirmar" : <Trash2 className="size-4" />}
                          </Button>
                          {pendingDelete === item.id && (
                            <Button type="button" size="sm" variant="outline" onClick={() => setPendingDelete(null)}>Cancelar</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
