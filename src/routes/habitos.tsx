import { createFileRoute, Link } from "@tanstack/react-router";
import { Notice, NumField, PageHeader, Panel } from "@/components/voltara/ui";
import { useVoltara, setVoltara } from "@/lib/voltara/store";
import { currentMonthKey, kwh } from "@/lib/voltara/format";
import { applianceKwh } from "@/lib/voltara/calc";
import type { Appliance } from "@/lib/voltara/types";
import { ApplianceIcon } from "@/components/voltara/icons";

export const Route = createFileRoute("/habitos")({
  head: () => ({ meta: [
    { title: "Hábitos — Voltara" },
    { name: "description", content: "Configure a rotina uma vez para prever o consumo mensal sem registros diários." },
  ] }),
  component: Habits,
});

function Habits() {
  const state = useVoltara();
  const month = currentMonthKey();

  function edit(id: string, transform: (appliance: Appliance) => Appliance) {
    setVoltara((prev) => ({
      ...prev,
      appliances: prev.appliances.map((a) => a.id === id ? transform(a) : a),
    }));
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Hábitos" subtitle="Ajuste uma vez a média de uso. Não é necessário anotar cada dia." />
      <Notice>
        As horas aqui são médias, não horários rígidos. Se você dormir mais cedo ou jogar LoL ocasionalmente,
        o Voltara usa o padrão que você configurou. Ajuste as potências em{" "}
        <Link to="/aparelhos" className="underline">Aparelhos</Link>.
      </Notice>
      {state.appliances.filter((a) => a.kind === "power" && a.detailed).map((a) => {
        if (a.kind !== "power" || !a.detailed) return null;
        const detailed = a.detailed;
        return (
          <Panel key={a.id} title={a.name} hint="Horas médias em cada tipo de dia; fins de semana são contados pelo calendário real.">
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <ApplianceIcon name={a.icon} className="size-4 text-primary" />
              <span>{kwh(applianceKwh(a, month))} previstos neste mês</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <NumField label="Segunda a sexta" unit="h/dia" min={0} max={24} step={0.25}
                value={detailed.weekdayHours}
                onChange={(weekdayHours) => edit(a.id, (current) => current.kind === "power" && current.detailed
                  ? { ...current, detailed: { ...current.detailed, weekdayHours } } : current)} />
              <NumField label="Sábado" unit="h/dia" min={0} max={24} step={0.25}
                value={detailed.saturdayHours}
                onChange={(saturdayHours) => edit(a.id, (current) => current.kind === "power" && current.detailed
                  ? { ...current, detailed: { ...current.detailed, saturdayHours } } : current)} />
              <NumField label="Domingo" unit="h/dia" min={0} max={24} step={0.25}
                value={detailed.sundayHours}
                onChange={(sundayHours) => edit(a.id, (current) => current.kind === "power" && current.detailed
                  ? { ...current, detailed: { ...current.detailed, sundayHours } } : current)} />
            </div>
            {a.heavy && (
              <div className="mt-3 rounded-xl border bg-background/40 p-3">
                <p className="mb-2 text-sm font-medium">Uso leve e uso intenso</p>
                <NumField label="Tempo em jogos ou tarefas pesadas" unit="%" min={0} max={100}
                  value={Math.round(a.heavy.share * 100)}
                  onChange={(v) => edit(a.id, (current) => current.kind === "power" && current.heavy
                    ? { ...current, heavy: { ...current.heavy, share: v / 100 } } : current)} />
                <p className="mt-2 text-xs text-muted-foreground">O restante é considerado uso leve, como séries e navegação.</p>
              </div>
            )}
          </Panel>
        );
      })}

      <div className="grid gap-4 lg:grid-cols-2">
        {state.appliances.filter((a) => a.kind === "power" && !a.detailed).map((a) => {
          if (a.kind !== "power") return null;
          return (
            <Panel key={a.id} title={a.name} hint="Média simples de utilização">
              <div className="grid gap-3 sm:grid-cols-2">
                <NumField label="Horas por dia" unit="h/dia" min={0} max={24} step={0.25}
                  value={a.hoursPerDay}
                  onChange={(hoursPerDay) => edit(a.id, (current) => current.kind === "power" ? { ...current, hoursPerDay } : current)} />
                <NumField label="Dias por semana" min={0} max={7} step={1}
                  value={a.daysPerWeek}
                  onChange={(daysPerWeek) => edit(a.id, (current) => current.kind === "power" ? { ...current, daysPerWeek } : current)} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{kwh(applianceKwh(a, month))} previstos no mês atual.</p>
            </Panel>
          );
        })}

        {state.appliances.filter((a) => a.kind === "perUse").map((a) => {
          if (a.kind !== "perUse") return null;
          return (
            <Panel key={a.id} title={a.name} hint="Não é preciso registrar cada recarga ou utilização">
              <div className="grid gap-3 sm:grid-cols-2">
                <NumField label="Usos/recargas por semana" min={0} max={70} step={1}
                  value={a.usesPerWeek}
                  onChange={(usesPerWeek) => edit(a.id, (current) => current.kind === "perUse" ? { ...current, usesPerWeek } : current)} />
                <NumField label="Energia por uso" unit="kWh" min={0} max={5000} step={0.1}
                  value={a.kwhPerUse}
                  onChange={(kwhPerUse) => edit(a.id, (current) => current.kind === "perUse" ? { ...current, kwhPerUse } : current)} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{kwh(applianceKwh(a, month))} previstos no mês atual.</p>
            </Panel>
          );
        })}
      </div>

      <Panel title="Como a previsão funciona">
        <p className="text-sm leading-relaxed text-muted-foreground">
          O Voltara considera os dias reais de cada mês, inclusive quantos sábados e domingos ele tem,
          e usa suas médias cadastradas. Para a geladeira, usamos o consumo mensal em kWh da etiqueta;
          para a scooter, a energia estimada de cada recarga. Esses valores podem ser ajustados em
          {" "}<Link to="/aparelhos" className="underline">Aparelhos</Link>.
        </p>
      </Panel>
    </div>
  );
}
