import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice, PageHeader, Panel } from "@/components/voltara/ui";
import { billError, calibrate } from "@/lib/voltara/calc";
import { download, historyCsv } from "@/lib/voltara/export";
import { currentMonthKey, kwh, money, monthLong, pct, uid } from "@/lib/voltara/format";
import { setVoltara, useVoltara } from "@/lib/voltara/store";

export const Route = createFileRoute("/contas")({
  head: () => ({ meta: [
    { title: "Contas — Voltara" },
    { name: "description", content: "Histórico opcional de faturas para melhorar a previsão de energia." },
  ] }),
  component: Contas,
});

function Contas() {
  const state = useVoltara();
  const [month, setMonth] = useState(currentMonthKey());
  const [value, setValue] = useState("");
  const [consumption, setConsumption] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const bills = [...state.bills].sort((a, b) => b.month.localeCompare(a.month));
  const reference = calibrate(state);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amount = Number(value.replace(",", "."));
    const hasKwh = consumption.trim() !== "";
    const usedKwh = hasKwh ? Number(consumption.replace(",", ".")) : undefined;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(amount) || amount <= 0) {
      setError("Informe um mês válido e um valor de fatura maior que zero.");
      setFeedback("");
      return;
    }
    if (hasKwh && (usedKwh === undefined || !Number.isFinite(usedKwh) || usedKwh <= 0)) {
      setError("O consumo deve ser positivo ou ficar em branco.");
      setFeedback("");
      return;
    }

    setVoltara((previous) => {
      const existing = previous.bills.find((b) => b.month === month);
      const bill = {
        id: existing?.id ?? uid(),
        month,
        value: amount,
        ...(usedKwh === undefined ? {} : { kwh: usedKwh }),
      };
      return {
        ...previous,
        bills: existing
          ? previous.bills.map((b) => b.month === month ? bill : b)
          : [...previous.bills, bill],
      };
    });
    setError("");
    setPendingDelete(null);
    setFeedback("Fatura salva. As previsões foram recalculadas automaticamente.");
    setValue("");
    setConsumption("");
  }

  function edit(id: string) {
    const bill = bills.find((b) => b.id === id);
    if (!bill) return;
    setMonth(bill.month);
    setValue(String(bill.value));
    setConsumption(bill.kwh === undefined ? "" : String(bill.kwh));
    setError("");
    setFeedback("Altere os valores e pressione Salvar fatura.");
    setPendingDelete(null);
  }

  function remove(id: string) {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      return;
    }
    setVoltara((previous) => ({ ...previous, bills: previous.bills.filter((b) => b.id !== id) }));
    setPendingDelete(null);
    setFeedback("Fatura excluída. As previsões foram recalculadas.");
    setError("");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contas"
        subtitle="Cadastre uma conta quando quiser, sem registrar consumo todos os dias."
        action={bills.length ? (
          <Button variant="outline" size="sm" onClick={() => download("voltara-historico.csv", historyCsv(state), "text/csv;charset=utf-8")}>
            <Download className="mr-2 size-4" /> Exportar CSV
          </Button>
        ) : undefined}
      />
      <Notice>
        Não há leitura automática da concessionária. O consumo em kWh é opcional, mas melhora a calibração.
        Seus registros são guardados neste navegador.
      </Notice>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="Registrar uma fatura" className="lg:col-span-2">
          <form className="space-y-4" onSubmit={save}>
            <div className="space-y-1.5">
              <Label htmlFor="bill-month">Mês de referência</Label>
              <Input id="bill-month" type="month" required value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-value">Valor da conta (R$)</Label>
              <Input id="bill-value" type="number" min="0.01" step="0.01" required value={value}
                placeholder="Ex.: 220" onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bill-kwh">Consumo (kWh), opcional</Label>
              <Input id="bill-kwh" type="number" min="0.01" step="0.01" value={consumption}
                placeholder="Ex.: 162" onChange={(e) => setConsumption(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            {feedback && <p role="status" className="text-sm text-success">{feedback}</p>}
            <Button className="w-full" type="submit">Salvar fatura</Button>
          </form>
        </Panel>
        <div className="space-y-4 lg:col-span-3">
          <Panel title="Referência atual" hint="Usada para ajustar a previsão">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-background/60 p-4">
                <p className="text-xs text-muted-foreground">Última referência</p>
                <p className="mt-1 text-2xl font-semibold tabular">{money(reference.billValue)}</p>
                <p className="text-xs capitalize text-muted-foreground">{monthLong(reference.month)}</p>
              </div>
              <div className="rounded-xl border bg-background/60 p-4">
                <p className="text-xs text-muted-foreground">Energia de referência</p>
                <p className="mt-1 text-2xl font-semibold tabular">{kwh(reference.billKwh)}</p>
                <p className="text-xs text-muted-foreground">
                  {reference.kwhFromBill ? "Informada na fatura" : "Calculada pela tarifa estimada"}
                </p>
              </div>
            </div>
            {reference.overshoot && <div className="mt-3">
              <Notice tone="warn">O consumo dos aparelhos é maior que o da fatura de referência. Revise os dados cadastrados.</Notice>
            </div>}
          </Panel>
          <Panel title="Histórico de faturas">
            {!bills.length ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma fatura adicionada. A previsão continua usando a referência inicial de {money(state.settings.referenceValue)}.
              </p>
            ) : (
              <div className="space-y-3">
                {bills.map((bill) => {
                  const comparison = billError(state, bill);
                  return (
                    <div key={bill.id} className="rounded-xl border bg-background/40 p-3">
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold capitalize">{monthLong(bill.month)}</p>
                          <p className="text-lg font-semibold tabular">{money(bill.value)}</p>
                          <p className="text-xs text-muted-foreground">
                            {bill.kwh === undefined ? "Consumo não informado" : kwh(bill.kwh)}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="text-muted-foreground">Estimativa comparativa</p>
                          <p className="text-base font-medium tabular">{money(comparison.predicted)}</p>
                          <p className="text-muted-foreground">Desvio: {pct(comparison.pct)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => edit(bill.id)}>Editar</Button>
                        <Button type="button" size="sm" variant={pendingDelete === bill.id ? "destructive" : "outline"}
                          onClick={() => remove(bill.id)}>
                          <Trash2 className="mr-1 size-3.5" />
                          {pendingDelete === bill.id ? "Confirmar exclusão" : "Excluir"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
