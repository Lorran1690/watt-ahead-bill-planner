import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Droplets, Pencil, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Notice, PageHeader, Panel } from "@/components/voltara/ui";
import { download, waterHistoryCsv } from "@/lib/voltara/export";
import { currentMonthKey, money, monthLong, num } from "@/lib/voltara/format";
import { setVoltara, useVoltara } from "@/lib/voltara/store";
import type { WaterBill } from "@/lib/voltara/types";

export const Route = createFileRoute("/agua")({
  head: () => ({ meta: [
    { title: "Conta de Água — Voltara" },
    { name: "description", content: "Controle mensal da conta de água com valor, m³, histórico e comparação." },
  ] }),
  component: WaterPage,
});

function WaterPage() {
  const state = useVoltara();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [value, setValue] = useState("");
  const [m3, setM3] = useState("");
  const [note, setNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const bills = [...state.waterBills].sort((a, b) => b.month.localeCompare(a.month));
  const latest = bills[0];
  const previous = bills[1];
  const difference = latest && previous ? latest.value - previous.value : null;
  const thisYear = String(new Date().getFullYear());
  const yearlyBills = bills.filter((bill) => bill.month.startsWith(thisYear + "-"));
  const yearlyTotal = yearlyBills.reduce((sum, bill) => sum + bill.value, 0);
  const average = bills.length ? bills.reduce((sum, bill) => sum + bill.value, 0) / bills.length : 0;

  function resetForm() {
    setMonth(currentMonthKey());
    setValue("");
    setM3("");
    setNote("");
    setEditingId(null);
    setError("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId && state.waterBills.length >= 240) { setError("Limite de 240 contas de água atingido."); return; }
    const amount = Number(value.trim().replace(",", "."));
    const volume = m3.trim() ? Number(m3.trim().replace(",", ".")) : undefined;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      setError("Selecione um mês válido."); return;
    }
    if (!/^\d+(?:[,.]\d{1,2})?$/.test(value.trim()) || !Number.isFinite(amount) ||
      amount < 0.01 || amount > 1_000_000) {
      setError("Informe um valor válido em reais, com até duas casas decimais."); return;
    }
    if (volume !== undefined && (!/^\d+(?:[,.]\d{1,3})?$/.test(m3.trim()) ||
      !Number.isFinite(volume) || volume < 0.01 || volume > 1_000_000)) {
      setError("O consumo em m³ deve ser positivo ou ficar em branco."); return;
    }
    const cleanNote = note.trim();
    if (cleanNote.length > 240) {
      setError("A anotação deve ter no máximo 240 caracteres."); return;
    }
    if (editingId && !state.waterBills.some(bill => bill.id === editingId)) {
      setError("Esta fatura foi removida em outro aparelho. Cancele a edição e cadastre novamente."); return;
    }
    const existing = state.waterBills.find((bill) => bill.month === month);
    if (existing && existing.id !== editingId) {
      setError("Esse mês já está cadastrado. Use Editar no histórico para alterá-lo."); return;
    }
    const bill: WaterBill = {
      id: editingId ?? "water-" + month,
      month,
      value: amount,
      ...(volume === undefined ? {} : { m3: volume }),
      ...(cleanNote ? { note: cleanNote } : {}),
    };
    setVoltara((previousState) => ({
      ...previousState,
      waterBills: editingId
        ? previousState.waterBills.map((item) => item.id === editingId ? bill : item)
        : [...previousState.waterBills, bill],
    }));
    setFeedback(editingId ? "Conta de água atualizada." : "Conta de água adicionada.");
    setPendingDelete(null);
    resetForm();
  }

  function edit(bill: WaterBill) {
    setEditingId(bill.id);
    setMonth(bill.month);
    setValue(bill.value.toFixed(2).replace(".", ","));
    setM3(bill.m3 === undefined ? "" : String(bill.m3).replace(".", ","));
    setNote(bill.note ?? "");
    setError("");
    setPendingDelete(null);
    setFeedback("Editando a conta selecionada.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function remove(id: string) {
    if (pendingDelete !== id) { setPendingDelete(id); return; }
    setVoltara((previousState) => ({
      ...previousState,
      waterBills: previousState.waterBills.filter((bill) => bill.id !== id),
    }));
    if (editingId === id) resetForm();
    setPendingDelete(null);
    setFeedback("Conta de água excluída.");
  }

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        title="Conta de Água"
        subtitle="Acompanhe quanto vocês pagam por mês e registre o consumo em m³, quando vier na fatura."
        action={bills.length ? (
          <Button type="button" variant="outline" size="sm"
            onClick={() => download("voltara-contas-agua.csv", waterHistoryCsv(state), "text/csv;charset=utf-8")}>
            <Download className="mr-2 size-4" /> Exportar CSV
          </Button>
        ) : undefined}
      />

      <Notice>
        As contas de água ficam separadas das contas de luz e dos gastos diários. Você pode cadastrar
        um mês mesmo sem saber os metros cúbicos. Os registros são incluídos no backup e
        compartilhados com sua esposa quando a sincronização estiver ativa.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="min-w-0 rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Droplets className="size-4 text-cyan-400" /> Última conta cadastrada</p>
          <p className="mt-2 break-words text-2xl font-semibold tabular">{latest ? money(latest.value) : "Nenhuma"}</p>
          <p className="mt-1 text-xs capitalize text-muted-foreground">{latest ? monthLong(latest.month) : "Adicione uma conta abaixo"}</p>
        </div>
        <div className="min-w-0 rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total registrado em {thisYear}</p>
          <p className="mt-2 break-words text-2xl font-semibold tabular">{money(yearlyTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{yearlyBills.length} mês(es) cadastrados</p>
        </div>
        <div className="min-w-0 rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Média das contas registradas</p>
          <p className="mt-2 break-words text-2xl font-semibold tabular">{money(average)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {difference === null ? "Adicione duas contas para comparar" :
              <span className="flex items-center gap-1">
                {difference > 0 ? <TrendingUp className="size-3.5 text-destructive" /> : <TrendingDown className="size-3.5 text-success" />}
                {difference > 0 ? "Aumento" : difference < 0 ? "Redução" : "Sem variação"} de {money(Math.abs(difference))} entre as duas últimas
              </span>}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-5">
        <Panel title={editingId ? "Editar conta de água" : "Cadastrar conta de água"} hint="Preencha a conta quando recebê-la"
          className="min-w-0 lg:col-span-2">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="water-month">Mês de referência</Label>
              <Input id="water-month" type="month" value={month} required disabled={editingId !== null}
                onChange={(event) => setMonth(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="water-amount">Valor da conta (R$)</Label>
              <Input id="water-amount" value={value} type="text" inputMode="decimal"
                placeholder="Ex.: 89,50" autoComplete="off" required
                onChange={(event) => setValue(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="water-m3">Consumo em m³ (opcional)</Label>
              <Input id="water-m3" value={m3} type="text" inputMode="decimal"
                placeholder="Ex.: 12,5" autoComplete="off"
                onChange={(event) => setM3(event.target.value)} />
              <p className="text-xs text-muted-foreground">Use o consumo informado pela concessionária. 1 m³ corresponde a 1.000 litros.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="water-note">Anotação (opcional)</Label>
              <Textarea id="water-note" rows={2} maxLength={240} value={note}
                placeholder="Ex.: tarifa alterada, vazamento, leitura estimada..."
                onChange={(event) => setNote(event.target.value)} />
            </div>
            {error && <p role="alert" className="break-words text-sm text-destructive">{error}</p>}
            {feedback && <p role="status" className="break-words text-sm text-success">{feedback}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" className="min-h-11 min-w-[160px] flex-1">
                {editingId ? "Salvar alteração" : "Salvar conta de água"}
              </Button>
              {editingId && <Button type="button" variant="outline" className="min-h-11"
                onClick={() => { resetForm(); setFeedback(""); }}>Cancelar</Button>}
            </div>
          </form>
        </Panel>

        <Panel title="Histórico das contas de água" hint="Valores e consumo reais informados nas faturas"
          className="min-w-0 lg:col-span-3">
          {!bills.length ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <Droplets className="mx-auto mb-2 size-8 text-cyan-400" />
              <p className="font-semibold">Nenhuma conta de água registrada</p>
              <p className="mt-1 text-sm text-muted-foreground">Informe o mês e o valor para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bills.map((bill) => (
                <article key={bill.id} className="min-w-0 rounded-xl border bg-background/50 p-3">
                  <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold capitalize">{monthLong(bill.month)}</h3>
                      <p className="mt-1 break-words text-lg font-semibold tabular">{money(bill.value)}</p>
                      <p className="text-xs text-muted-foreground">
                        {bill.m3 === undefined ? "Consumo não informado" : num(bill.m3, 3) + " m³"}
                        {bill.m3 ? " • " + money(bill.value / bill.m3) + "/m³ (custo médio da fatura)" : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <Button type="button" variant="outline" size="sm" className="min-h-10"
                        onClick={() => edit(bill)} aria-label={"Editar conta de " + bill.month}>
                        <Pencil className="mr-1 size-3.5" /> Editar
                      </Button>
                      <Button type="button" size="sm" className="min-h-10"
                        variant={pendingDelete === bill.id ? "destructive" : "outline"}
                        onClick={() => remove(bill.id)}
                        aria-label={pendingDelete === bill.id ? "Confirmar exclusão" : "Excluir conta de " + bill.month}>
                        <Trash2 className="mr-1 size-3.5" /> {pendingDelete === bill.id ? "Confirmar" : "Excluir"}
                      </Button>
                      {pendingDelete === bill.id &&
                        <Button type="button" size="sm" className="min-h-10" variant="ghost"
                          onClick={() => setPendingDelete(null)}>Cancelar</Button>}
                    </div>
                  </div>
                  {bill.note && <p className="mt-2 whitespace-pre-wrap break-words border-t pt-2 text-xs text-muted-foreground">{bill.note}</p>}
                </article>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
