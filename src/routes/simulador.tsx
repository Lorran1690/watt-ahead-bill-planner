import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Notice, NumField, PageHeader, Panel } from "@/components/voltara/ui";
import { calibrate, forecastMonth } from "@/lib/voltara/calc";
import { currentMonthKey, kwh, money, pct } from "@/lib/voltara/format";
import { useVoltara } from "@/lib/voltara/store";
import type { Appliance } from "@/lib/voltara/types";

export const Route = createFileRoute("/simulador")({
  head: () => ({ meta: [
    { title: "Simulador — Voltara" },
    { name: "description", content: "Compare cenários de economia de energia sem alterar os hábitos cadastrados." },
  ] }),
  component: Simulator,
});

function Simulator() {
  const state = useVoltara();
  const fan = state.appliances.find((a) => a.id === "ventilador");
  const scooter = state.appliances.find((a) => a.id === "scooter");
  const fridge = state.appliances.find((a) => a.id === "geladeira");
  const initialFan = fan?.kind === "power" ? fan.hoursPerDay : 8;
  const initialScooter = scooter?.kind === "perUse" ? scooter.usesPerWeek : 7;
  const initialFridge = fridge?.kind === "monthly" ? fridge.kwhPerMonth : 40;

  const [fanHours, setFanHours] = useState(initialFan);
  const [scooterUses, setScooterUses] = useState(initialScooter);
  const [fridgeKwh, setFridgeKwh] = useState(initialFridge);
  const [tariffPercent, setTariffPercent] = useState(0);
  const [newDevice, setNewDevice] = useState(false);
  const [newWatts, setNewWatts] = useState(100);
  const [newHours, setNewHours] = useState(3);

  const month = currentMonthKey();
  const calibration = calibrate(state);
  const baseline = forecastMonth(state, month, { residualPerDay: calibration.residualPerDay });
  const appliances: Appliance[] = state.appliances.map((a) => {
    if (a.id === "ventilador" && a.kind === "power") return { ...a, hoursPerDay: fanHours };
    if (a.id === "scooter" && a.kind === "perUse") return { ...a, usesPerWeek: scooterUses };
    if (a.id === "geladeira" && a.kind === "monthly") return { ...a, kwhPerMonth: fridgeKwh };
    return a;
  });
  if (newDevice) {
    appliances.push({
      id: "simulation-only", name: "Aparelho hipotético", icon: "plug", kind: "power",
      watts: newWatts, hoursPerDay: newHours, daysPerWeek: 7, enabled: true, uncertainty: 0.25,
    });
  }
  const futureState = {
    ...state,
    appliances,
    settings: { ...state.settings, tariff: Math.max(0.01, state.settings.tariff * (1 + tariffPercent / 100)) },
  };
  // Hold the unmeasured calibrated residual constant: recalibrating the simulated profile
  // would otherwise absorb apparent savings and invalidate the comparison.
  const scenario = forecastMonth(futureState, month, { residualPerDay: calibration.residualPerDay });
  const difference = scenario.cost - baseline.cost;
  const change = baseline.cost ? difference / baseline.cost : 0;

  function reset() {
    setFanHours(initialFan);
    setScooterUses(initialScooter);
    setFridgeKwh(initialFridge);
    setTariffPercent(0);
    setNewDevice(false);
    setNewWatts(100);
    setNewHours(3);
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Simulador" subtitle="Explore alternativas sem modificar os aparelhos ou os hábitos salvos." action={
        <Button variant="outline" onClick={reset}><RotateCcw className="mr-2 size-4" /> Restaurar cenário</Button>
      } />
      <Notice>
        A parcela desconhecida de "Outros aparelhos e encargos" fica fixa ao comparar os cenários,
        para não esconder possíveis economias. Os resultados são estimativas, não medição.
      </Notice>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Previsão atual</p>
          <p className="mt-1 text-2xl font-semibold tabular">{money(baseline.cost)}</p>
          <p className="text-xs text-muted-foreground">{kwh(baseline.kwh)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Novo cenário</p>
          <p className="mt-1 text-2xl font-semibold tabular">{money(scenario.cost)}</p>
          <p className="text-xs text-muted-foreground">{kwh(scenario.kwh)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{difference <= 0 ? "Economia estimada" : "Aumento estimado"}</p>
          <p className={"mt-1 flex items-center gap-1 text-2xl font-semibold tabular " + (difference <= 0 ? "text-success" : "text-destructive")}>
            {difference <= 0 ? <TrendingDown className="size-5" /> : <TrendingUp className="size-5" />}
            {money(Math.abs(difference))}
          </p>
          <p className="text-xs text-muted-foreground">{pct(change)} na conta • {money(Math.abs(difference) * 12)} ao ano se mantido</p>
        </div>
      </div>

      <Panel title="Cenários rápidos" hint="Escolha uma mudança e refine abaixo">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={fan?.kind !== "power" || !fan.enabled}
            onClick={() => setFanHours(Math.max(0, initialFan - 1))}>Ventilador: -1 h/noite</Button>
          <Button variant="outline" size="sm" disabled={scooter?.kind !== "perUse" || !scooter.enabled}
            onClick={() => setScooterUses(3.5)}>Scooter: a cada 2 dias</Button>
          <Button variant="outline" size="sm" disabled={fridge?.kind !== "monthly" || !fridge.enabled}
            onClick={() => setFridgeKwh(Math.max(0, initialFridge - 10))}>Geladeira: -10 kWh/mês</Button>
          <Button variant="outline" size="sm" onClick={() => setTariffPercent(15)}>Tarifa: +15%</Button>
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Ajustar uso dos aparelhos">
          <div className="space-y-4">
            {fan?.kind === "power" && (
              <NumField label="Ventilador: horas por noite" unit="h" value={fanHours} min={0} max={24} step={0.5}
                onChange={setFanHours} hint="Simula a potência e a frequência do ventilador já cadastrado." />
            )}
            {scooter?.kind === "perUse" && (
              <NumField label="Scooter: recargas por semana" value={scooterUses} min={0} max={7} step={0.5}
                onChange={setScooterUses} hint="Não confunda tempo conectado à tomada com energia efetivamente carregada." />
            )}
            {fridge?.kind === "monthly" && (
              <NumField label="Geladeira: consumo de etiqueta" unit="kWh" value={fridgeKwh} min={0} max={500} step={1}
                onChange={setFridgeKwh} />
            )}
            <NumField label="Variação da tarifa" unit="%" value={tariffPercent} min={-50} max={100} step={5}
              onChange={setTariffPercent} hint="Simule impostos, bandeiras e reajustes, sem alterar sua tarifa salva." />
          </div>
        </Panel>
        <Panel title="Adicionar aparelho hipotético">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Label htmlFor="new-appliance">Incluir na simulação</Label>
            <Switch id="new-appliance" checked={newDevice} onCheckedChange={setNewDevice} />
          </div>
          <div className={newDevice ? "space-y-4" : "pointer-events-none space-y-4 opacity-50"}>
            <NumField label="Potência do aparelho" unit="W" min={0} max={20000} step={5} value={newWatts} onChange={setNewWatts} />
            <NumField label="Horas ligadas por dia" unit="h" min={0} max={24} step={0.5} value={newHours} onChange={setNewHours} />
            <p className="text-xs text-muted-foreground">
              Considerado ligado todos os dias. O aparelho não será salvo no seu perfil.
            </p>
          </div>
        </Panel>
      </div>
      <Notice>
        Cenário baseado no mesmo mês e hábitos da previsão atual. Uma economia simulada não altera a
        conta de referência nem comprova que o consumo real cairá nesse valor.
      </Notice>
    </div>
  );
}
