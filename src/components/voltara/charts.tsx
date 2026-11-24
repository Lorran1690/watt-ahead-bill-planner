import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Forecast, ForecastItem } from "@/lib/voltara/calc";
import { kwh, money, monthLong, monthShort } from "@/lib/voltara/format";
import { CHART_COLORS } from "./icons";

export const itemColor = (it: ForecastItem, i: number) => (it.residual ? "var(--chart-residual)" : CHART_COLORS[i % CHART_COLORS.length]!);

export function DistributionDonut({ items, total }: { items: ForecastItem[]; total: number }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[220px]">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={items} dataKey="kwh" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive>
            {items.map((it, i) => <Cell key={it.id} fill={itemColor(it, i)} />)}
          </Pie>
          <Tooltip content={({ active, payload }) => active && payload?.[0] ? (
            <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
              <p className="font-medium">{payload[0].name}</p>
              <p className="text-muted-foreground">{kwh(Number(payload[0].value))}</p>
            </div>) : null} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-semibold tabular">{Math.round(total)}</span>
        <span className="text-xs text-muted-foreground">kWh/mês</span>
      </div>
    </div>
  );
}

export function ProjectionChart({ data, type, showRange, reference }: { data: Forecast[]; type: "bar" | "area"; showRange: boolean; reference?: number }) {
  const rows = data.map((f) => ({ k: f.month, label: monthShort(f.month), cost: Math.round(f.cost * 100) / 100, min: f.costMin, max: f.costMax, band: [f.costMin, f.costMax], days: f.days, kwh: f.kwh }));
  return (
    <div role="region" aria-label="Gráfico dos próximos 12 meses; deslize para os lados no celular" tabIndex={0}
      className="w-full max-w-full overflow-x-auto overscroll-x-contain pb-2" >
      <div className="h-64 w-full min-w-[600px] md:h-72 md:min-w-0">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="vg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.55} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} interval="preserveStartEnd" minTickGap={6} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(v: number) => `R$${Math.round(v)}`} domain={[0, "auto"]} />
          <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.3 }} content={({ active, payload }) => {
            const p = active && payload?.[0]?.payload as (typeof rows)[number] | undefined;
            if (!p) return null;
            return (
              <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
                <p className="font-medium capitalize">{monthLong(p.k)} · {p.days} dias</p>
                <p className="mt-1 font-display text-sm text-primary">{money(p.cost)}</p>
                <p className="text-muted-foreground">faixa {money(p.min)} – {money(p.max)}</p>
                <p className="text-muted-foreground">{kwh(p.kwh)}</p>
              </div>
            );
          }} />
          {showRange && <Area dataKey="band" stroke="none" fill="var(--primary)" fillOpacity={0.12} isAnimationActive={false} />}
          {type === "bar"
            ? <Bar dataKey="cost" fill="url(#vg)" stroke="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={28} />
            : <Area dataKey="cost" stroke="var(--primary)" strokeWidth={2} fill="url(#vg)" />}
          {reference != null && <Line dataKey={() => reference} stroke="var(--chart-2)" strokeDasharray="4 4" dot={false} strokeOpacity={0.5} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
