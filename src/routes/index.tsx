import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, ShieldCheck } from "lucide-react";
import { addMonths, confidence, dayTypeCounts, forecastMonth, projection } from "@/lib/voltara/calc";
import { currentMonthKey, kwh, money, monthLong, num, pct } from "@/lib/voltara/format";
import { useVoltara } from "@/lib/voltara/store";
import { DistributionDonut, itemColor, ProjectionChart } from "@/components/voltara/charts";
import { ApplianceIcon } from "@/components/voltara/icons";
import { Notice, Panel, Stat } from "@/components/voltara/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel — Voltara" },
      { name: "description", content: "Previsão da conta de luz do mês e dos próximos 12 meses, com faixa provável." },
      { property: "og:title", content: "Painel — Voltara" },
      { property: "og:description", content: "Previsão da conta de luz do mês e dos próximos 12 meses, com faixa provável." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const state = useVoltara();
  const now = currentMonthKey();
  const conf = confidence(state, now);
  const f = forecastMonth(state, now, { calibration: conf.calibration, extraUncertainty: conf.extra });
  const proj = projection(state, addMonths(now, 1), 12);
  const ref = state.settings.referenceValue;
  const delta = ref > 0 ? (f.cost - ref) / ref : null;
  const counts = dayTypeCounts(now);
  const items = [...f.items].sort((a, b) => Number(!!a.residual) - Number(!!b.residual) || b.kwh - a.kwh);
  const cal = conf.calibration;
  const residual = f.items.find((i) => i.residual);

  return (
    <div className="space-y-4">
      <Notice>Estimativa baseada em hábitos, não medição em tempo real.</Notice>

      <section className="surface-hero relative overflow-hidden rounded-3xl border p-5 md:p-7 fade-up">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 w-full sm:w-auto">
            <p className="text-sm capitalize text-muted-foreground">Previsão para {monthLong(now)}</p>
            <p className="mt-1 break-words font-display text-[clamp(2rem,8.7vw,3.75rem)] font-semibold leading-tight tracking-tight tabular">{money(f.cost)}</p>
            <p className="mt-2 break-words text-sm text-muted-foreground">Faixa provável <span className="text-foreground tabular">{money(f.costMin)} – {money(f.costMax)}</span></p>
          </div>
          <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end">
            <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium tabular", delta !== null && delta > 0 ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success")}>
              {delta !== null && delta > 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}{delta === null ? "Sem referência" : pct(delta) + " vs " + money(ref)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" /> Confiança {conf.level}
            </span>
          </div>
        </div>
        <div className="mt-6 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Consumo" value={kwh(f.kwh, 0)} sub={`${num(f.kwhMin, 0)}–${num(f.kwhMax, 0)} kWh`} />
          <Stat label="Dias" value={f.days} sub={`${counts.weekday} úteis · ${counts.saturday} sáb · ${counts.sunday} dom`} />
          <div className="col-span-2 sm:col-span-1"><Stat label="Tarifa" value={money(state.settings.tariff)} sub="por kWh (estimada)" /></div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel title="Para onde vai a energia" hint="Distribuição estimada do mês atual" className="lg:col-span-2">
          <DistributionDonut items={items} total={f.kwh} />
          <ul className="mt-4 space-y-2">
            {items.map((it) => (
              <li key={it.id} className="flex min-w-0 items-center gap-2 text-xs sm:gap-3 sm:text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: itemColor(it, f.items.indexOf(it)) }} />
                <ApplianceIcon name={it.icon} className="size-4 shrink-0 text-muted-foreground" />
                <span className={cn("min-w-0 flex-1 truncate", it.residual && "italic text-muted-foreground")}>{it.name}</span>
                <span className="hidden shrink-0 tabular text-muted-foreground sm:inline">{num(it.kwh, 1)} kWh</span>
                <span className="shrink-0 text-right tabular">{money(it.cost)}</span>
              </li>
            ))}
            {state.settings.fixedCharges > 0 && (
              <li className="flex items-center gap-3 text-sm text-muted-foreground"><span className="size-2.5" /><span className="flex-1">Encargos fixos</span><span className="tabular">{money(state.settings.fixedCharges)}</span></li>
            )}
          </ul>
        </Panel>

        <Panel title="Próximos 12 meses" hint="Valor central, faixa sombreada e linha tracejada da conta de referência" className="lg:col-span-3">
          <ProjectionChart data={proj} type={state.settings.chartType} showRange={state.settings.showRange} reference={ref} />
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 text-xs">
            {proj.map((p) => (
              <div key={p.month} className="shrink-0 rounded-lg border px-2.5 py-1.5 text-center">
                <p className="text-muted-foreground">{p.month.slice(5)}/{p.month.slice(2, 4)} · {p.days}d</p>
                <p className="tabular">{money(p.cost)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Como esta estimativa é feita">
        <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p>Somamos o consumo de cada aparelho com base nos hábitos cadastrados e nos {f.days} dias reais do mês. Aparelhos com etiqueta (geladeira) usam o kWh/mês informado; a scooter usa kWh por recarga na tomada.</p>
          <p>
            A diferença entre essa soma e a {cal.source === "bill" ? "última conta informada" : "conta de referência"} ({money(cal.billValue)}, {monthLong(cal.month)}) vira
            {" "}<strong className="text-foreground">“Outros aparelhos e encargos”</strong>{residual ? ` (≈ ${kwh(residual.kwh, 0)} neste mês)` : ""}: uma parcela desconhecida, não energia medida.
            {!cal.kwhFromBill && " Como a conta não tem kWh informado, convertemos o valor pela tarifa estimada — impostos e bandeiras podem mudar o resultado."}
          </p>
          {cal.overshoot && <Notice tone="warn">Os aparelhos cadastrados somam mais do que a conta de referência. Revise potências ou horas em Aparelhos/Hábitos.</Notice>}
          {conf.level !== "alta" && <Notice tone="warn">Faz {conf.months} meses desde a última conta usada para calibrar; a faixa foi alargada. <Link to="/contas" className="underline">Informar uma conta</Link> melhora a precisão.</Notice>}
        </div>
      </Panel>
    </div>
  );
}
