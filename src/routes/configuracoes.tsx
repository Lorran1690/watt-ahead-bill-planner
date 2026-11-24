import { useState, type ChangeEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Download, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Notice, NumField, PageHeader, Panel } from "@/components/voltara/ui";
import { defaultState } from "@/lib/voltara/defaults";
import { download, historyCsv, projectionCsv } from "@/lib/voltara/export";
import { currentMonthKey } from "@/lib/voltara/format";
import { parseBackup } from "@/lib/voltara/storage";
import { setVoltara, useVoltara } from "@/lib/voltara/store";
import type { Settings } from "@/lib/voltara/types";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [
    { title: "Configurações — Voltara" },
    { name: "description", content: "Tarifa, referência, personalização e backup das previsões de energia." },
  ] }),
  component: SettingsPage,
});

function SettingsPage() {
  const state = useVoltara();
  const settings = state.settings;
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [resetPending, setResetPending] = useState(false);

  function update(patch: Partial<Settings>) {
    setVoltara((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
    setFeedback("");
    setError("");
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("Arquivo muito grande. O backup deve ter no máximo 2 MB.");
      setFeedback("");
      return;
    }
    try {
      const parsed = parseBackup(await file.text());
      setVoltara(parsed);
      setResetPending(false);
      setError("");
      setFeedback("Backup importado. As previsões foram atualizadas.");
    } catch {
      setFeedback("");
      setError("Backup inválido ou incompatível. Seus dados atuais foram preservados.");
    }
  }

  function reset() {
    if (!resetPending) {
      setResetPending(true);
      return;
    }
    setVoltara(defaultState());
    setResetPending(false);
    setError("");
    setFeedback("Configurações e dados locais restaurados para os valores iniciais.");
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Configurações" subtitle="Ajuste apenas quando sua tarifa, aparelhos ou hábitos mudarem." />
      <Notice>
        O Voltara não lê sua fatura da Enel nem mede energia em tempo real.
        A tarifa é uma estimativa editável; impostos e bandeiras podem variar.
      </Notice>
      {feedback && <p role="status" className="text-sm text-success">{feedback}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Energia e encargos" hint="Valores usados em todas as previsões">
          <div className="space-y-4">
            <NumField label="Tarifa estimada total" unit="R$/kWh" min={0.01} max={20} step={0.01}
              value={settings.tariff} onChange={(tariff) => update({ tariff: Math.max(0.01, tariff) })}
              hint="Se a tarifa já incluir impostos e bandeiras, não os adicione novamente." />
            <NumField label="Encargos fixos adicionais" unit="R$/mês" min={0} max={5000} step={1}
              value={settings.fixedCharges} onChange={(fixedCharges) => update({ fixedCharges })}
              hint="Ex.: iluminação pública; informe apenas o que não estiver dentro da tarifa." />
            <div className="space-y-1.5">
              <Label htmlFor="region">Localidade (informativa)</Label>
              <Input id="region" value={settings.region} maxLength={50}
                onChange={(e) => update({ region: e.target.value })} />
              <p className="text-xs text-muted-foreground">Não altera a tarifa automaticamente, evitando valores inventados.</p>
            </div>
            <NumField label="Dia habitual de vencimento (opcional)" min={0} max={31} step={1}
              value={settings.billingDay ?? 0}
              onChange={(n) => update({ billingDay: n > 0 ? Math.round(n) : null })}
              hint="Zero significa não informado. As projeções ainda usam meses civis completos." />
          </div>
        </Panel>

        <Panel title="Conta de referência" hint="Base inicial para estimar os gastos não cadastrados">
          <div className="space-y-4">
            <NumField label="Valor da conta de referência" unit="R$" min={0} max={100000} step={0.01}
              value={settings.referenceValue}
              onChange={(referenceValue) => update({ referenceValue })}
              hint="O valor informado inicialmente foi R$ 220,00." />
            <div className="space-y-1.5">
              <Label htmlFor="reference-month">Mês da referência</Label>
              <Input id="reference-month" type="month" value={settings.referenceMonth}
                onChange={(e) => {
                  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) update({ referenceMonth: e.target.value });
                }} />
            </div>
            <NumField label="Incerteza da parcela desconhecida" unit="%" min={0} max={100} step={5}
              value={Math.round(state.residualUncertainty * 100)}
              onChange={(v) => setVoltara((prev) => ({ ...prev, residualUncertainty: v / 100 }))}
              hint="Uma faixa maior reconhece a incerteza de aparelhos e taxas não identificados." />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Se você cadastrar uma conta posterior em Contas, ela será usada para recalibrar
              a previsão. A diferença para os aparelhos conhecidos continua identificada como desconhecida.
            </p>
          </div>
        </Panel>

        <Panel title="Gráficos">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="chart-type">Tipo de gráfico</Label>
              <select id="chart-type" value={settings.chartType}
                onChange={(e) => update({ chartType: e.target.value === "area" ? "area" : "bar" })}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="bar">Barras</option>
                <option value="area">Área</option>
              </select>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="show-range">Exibir faixa mínimo/máximo</Label>
              <Switch id="show-range" checked={settings.showRange} onCheckedChange={(showRange) => update({ showRange })} />
            </div>
          </div>
        </Panel>

        <Panel title="Backup e exportação" hint="Seus dados ficam salvos neste navegador, sem login nem nuvem">
          <div className="space-y-3">
            <Button type="button" variant="outline" className="w-full justify-start"
              onClick={() => download("voltara-backup.json", JSON.stringify(state, null, 2), "application/json;charset=utf-8")}>
              <Download className="mr-2 size-4" /> Exportar backup completo (JSON)
            </Button>
            <Button type="button" variant="outline" className="w-full justify-start"
              onClick={() => download("voltara-previsao.csv", projectionCsv(state, currentMonthKey()), "text/csv;charset=utf-8")}>
              <Download className="mr-2 size-4" /> Exportar previsão (CSV)
            </Button>
            <Button type="button" variant="outline" className="w-full justify-start"
              onClick={() => download("voltara-historico.csv", historyCsv(state), "text/csv;charset=utf-8")}>
              <Download className="mr-2 size-4" /> Exportar histórico (CSV)
            </Button>
            <div className="space-y-1.5 border-t pt-3">
              <Label htmlFor="import-backup"><Upload className="mr-1 inline size-4" /> Importar backup JSON</Label>
              <Input id="import-backup" type="file" accept=".json,application/json" onChange={importJson}
                className="cursor-pointer file:cursor-pointer" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Importar substitui o perfil e o histórico atuais. Exporte um backup antes.
              </p>
            </div>
            <Notice tone="warn">
              Limpar os dados do navegador ou mudar de aparelho pode apagar o perfil salvo.
              Guarde um backup JSON para restaurá-lo depois.
            </Notice>
          </div>
        </Panel>
      </div>

      <Panel title="Restaurar configurações iniciais" hint="Ação permanente para os dados deste navegador">
        <p className="mb-3 text-sm text-muted-foreground">
          Isso também apagará as contas e aparelhos personalizados. Faça backup antes.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={resetPending ? "destructive" : "outline"} onClick={reset}>
            <RotateCcw className="mr-2 size-4" />{resetPending ? "Confirmar limpeza de todos os dados" : "Restaurar padrão"}
          </Button>
          {resetPending && <Button type="button" variant="ghost" onClick={() => setResetPending(false)}>Cancelar</Button>}
        </div>
      </Panel>
    </div>
  );
}
