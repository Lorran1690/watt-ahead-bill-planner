import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { applianceKwh, forecastMonth } from "@/lib/voltara/calc";
import { defaultAppliances, PRESETS } from "@/lib/voltara/defaults";
import { currentMonthKey, kwh, money, uid } from "@/lib/voltara/format";
import { setVoltara, useVoltara } from "@/lib/voltara/store";
import type { Appliance } from "@/lib/voltara/types";
import { ApplianceIcon } from "@/components/voltara/icons";
import { Notice, NumField, PageHeader, Panel } from "@/components/voltara/ui";

export const Route = createFileRoute("/aparelhos")({
  head: () => ({ meta: [
    { title: "Aparelhos — Voltara" },
    { name: "description", content: "Configure os aparelhos da casa uma vez, sem anotação diária." },
  ] }),
  component: AppliancesPage,
});

function AppliancesPage() {
  const state = useVoltara();
  const [preset, setPreset] = useState("0");
  const [customName, setCustomName] = useState("");
  const [customKind, setCustomKind] = useState<"power" | "monthly" | "perUse">("power");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const month = currentMonthKey();

  function edit(id: string, update: (appliance: Appliance) => Appliance) {
    setVoltara((prev) => ({
      ...prev,
      appliances: prev.appliances.map((a) => a.id === id ? update(a) : a),
    }));
    setFeedback("");
  }

  function addPreset() {
    if (state.appliances.length >= 100) { setFeedback("Limite de 100 aparelhos atingido."); return; }
    const source = PRESETS[Number(preset)];
    if (!source) return;
    const newAppliance = { ...source, id: uid() } as Appliance;
    setVoltara((prev) => ({ ...prev, appliances: [...prev.appliances, newAppliance] }));
    setFeedback(source.name + " adicionado. Ajuste seu uso no cartão abaixo.");
  }

  function addCustom() {
    if (state.appliances.length >= 100) { setFeedback("Limite de 100 aparelhos atingido."); return; }
    const name = customName.trim();
    if (!name || name.length > 80) {
      setFeedback("Informe um nome de aparelho com até 80 caracteres.");
      return;
    }
    const base = { id: uid(), name, icon: "plug", enabled: true, uncertainty: 0.25 };
    const newAppliance: Appliance = customKind === "monthly"
      ? { ...base, kind: "monthly", kwhPerMonth: 30 }
      : customKind === "perUse"
        ? { ...base, kind: "perUse", kwhPerUse: 0.5, usesPerWeek: 3 }
        : { ...base, kind: "power", watts: 100, hoursPerDay: 3, daysPerWeek: 7 };
    setVoltara((prev) => ({ ...prev, appliances: [...prev.appliances, newAppliance] }));
    setCustomName("");
    setFeedback("Aparelho adicionado. Os valores iniciais são exemplos: ajuste-os.");
  }

  function remove(id: string) {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      return;
    }
    setVoltara((prev) => ({ ...prev, appliances: prev.appliances.filter((a) => a.id !== id) }));
    setPendingDelete(null);
    setFeedback("Aparelho removido.");
  }

  const forecast = forecastMonth(state, month);
  return (
    <div className="space-y-4">
      <PageHeader title="Aparelhos" subtitle="Configure uma vez. As previsões usam seus hábitos nos próximos meses automaticamente." />
      <Notice>
        A categoria "Outros" é a parcela desconhecida que calibra sua conta anterior. Alterar um aparelho
        pode compensar essa parcela na mesma fatura de referência; para comparar economia real, use o
        {" "}<Link to="/simulador" className="underline">Simulador</Link>.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Aparelhos ativos</p>
          <p className="mt-1 text-2xl font-semibold tabular">{state.appliances.filter((a) => a.enabled).length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Aparelhos conhecidos</p>
          <p className="mt-1 text-2xl font-semibold tabular">
            {kwh(state.appliances.reduce((sum, a) => sum + applianceKwh(a, month), 0))}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Previsão total</p>
          <p className="mt-1 text-2xl font-semibold tabular">{money(forecast.cost)}</p>
        </div>
      </div>

      {feedback && <p role="status" className="text-sm text-muted-foreground">{feedback}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {state.appliances.map((a) => (
          <Panel key={a.id}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent">
                  <ApplianceIcon name={a.icon} className="size-5 text-primary" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{a.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {kwh(applianceKwh(a, month))} neste mês • {money(applianceKwh(a, month) * state.settings.tariff)}
                  </p>
                </div>
              </div>
              <Switch checked={a.enabled} onCheckedChange={(enabled) => edit(a.id, (current) => ({ ...current, enabled }))} aria-label={a.enabled ? "Desativar " + a.name : "Ativar " + a.name} />
            </div>

            <div className={a.enabled ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 opacity-60 sm:grid-cols-2"}>
              {a.kind === "power" && (
                <>
                  <NumField label="Potência média" unit="W" value={a.watts} min={0} max={20000} step={5}
                    onChange={(watts) => edit(a.id, (current) => current.kind === "power" ? { ...current, watts } : current)} />
                  {a.detailed ? (
                    <div className="flex items-center">
                      <Link to="/habitos" className="text-sm text-primary underline">
                        Ajustar horas por tipo de dia em Hábitos
                      </Link>
                    </div>
                  ) : (
                    <>
                      <NumField label="Horas por dia" unit="h" value={a.hoursPerDay} min={0} max={24} step={0.5}
                        onChange={(hoursPerDay) => edit(a.id, (current) => current.kind === "power" ? { ...current, hoursPerDay } : current)} />
                      <NumField label="Dias por semana" value={a.daysPerWeek} min={0} max={7} step={1}
                        onChange={(daysPerWeek) => edit(a.id, (current) => current.kind === "power" ? { ...current, daysPerWeek } : current)} />
                    </>
                  )}
                  {a.heavy && (
                    <>
                      <NumField label="Potência no uso intenso" unit="W" value={a.heavy.watts} min={0} max={20000} step={5}
                        onChange={(watts) => edit(a.id, (current) => current.kind === "power" && current.heavy ? { ...current, heavy: { ...current.heavy, watts } } : current)} />
                      <NumField label="% do tempo em uso intenso" unit="%" value={Math.round(a.heavy.share * 100)} min={0} max={100}
                        onChange={(v) => edit(a.id, (current) => current.kind === "power" && current.heavy ? { ...current, heavy: { ...current.heavy, share: v / 100 } } : current)} />
                    </>
                  )}
                </>
              )}
              {a.kind === "monthly" && (
                <NumField label="Consumo de etiqueta (30 dias)" unit="kWh" value={a.kwhPerMonth} min={0} max={5000} step={1}
                  onChange={(kwhPerMonth) => edit(a.id, (current) => current.kind === "monthly" ? { ...current, kwhPerMonth } : current)} />
              )}
              {a.kind === "perUse" && (
                <>
                  <NumField label="Energia por uso/recarga" unit="kWh" value={a.kwhPerUse} min={0} max={5000} step={0.1}
                    onChange={(kwhPerUse) => edit(a.id, (current) => current.kind === "perUse" ? { ...current, kwhPerUse } : current)} />
                  <NumField label="Usos por semana" value={a.usesPerWeek} min={0} max={70} step={1}
                    onChange={(usesPerWeek) => edit(a.id, (current) => current.kind === "perUse" ? { ...current, usesPerWeek } : current)} />
                </>
              )}
              <NumField label="Incerteza estimada" unit="%" value={Math.round(a.uncertainty * 100)} min={0} max={100} step={5}
                onChange={(v) => edit(a.id, (current) => ({ ...current, uncertainty: v / 100 }))} />
            </div>
            {a.note && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{a.note}</p>}
            <div className="mt-4 flex justify-end gap-2 border-t pt-3">
              {pendingDelete === a.id && <Button type="button" size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>Cancelar</Button>}
              <Button type="button" size="sm" variant={pendingDelete === a.id ? "destructive" : "outline"} onClick={() => remove(a.id)}>
                <Trash2 className="mr-1 size-4" />
                {pendingDelete === a.id ? "Confirmar exclusão" : "Excluir"}
              </Button>
            </div>
          </Panel>
        ))}
      </div>

      <Panel title="Adicionar aparelho" hint="Escolha um exemplo ou crie um aparelho personalizado">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="preset">Modelos prontos</Label>
            <select id="preset" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={preset} onChange={(e) => setPreset(e.target.value)}>
              {PRESETS.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
            </select>
            <Button type="button" variant="outline" className="w-full" onClick={addPreset}><Plus className="mr-2 size-4" /> Adicionar modelo</Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-name">Outro aparelho</Label>
            <Input id="custom-name" maxLength={80} placeholder="Nome do aparelho" value={customName}
              onChange={(e) => setCustomName(e.target.value)} />
            <Label htmlFor="custom-kind">Como medir o consumo?</Label>
            <select id="custom-kind" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={customKind} onChange={(e) => setCustomKind(e.target.value as "power" | "monthly" | "perUse")}>
              <option value="power">Potência (W) e horas por dia</option>
              <option value="monthly">kWh por mês, como geladeiras</option>
              <option value="perUse">kWh por utilização ou recarga</option>
            </select>
            <Button type="button" variant="outline" className="w-full" onClick={addCustom}><Plus className="mr-2 size-4" /> Criar personalizado</Button>
          </div>
        </div>
      </Panel>

      {state.appliances.length === 0 && (
        <Button variant="outline" onClick={() => setVoltara((prev) => ({ ...prev, appliances: defaultAppliances() }))}>
          Restaurar aparelhos iniciais
        </Button>
      )}
    </div>
  );
}
