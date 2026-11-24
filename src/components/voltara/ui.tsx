import { useId, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3 fade-up">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Panel({ children, className, title, hint }: { children: ReactNode; className?: string; title?: string; hint?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card p-4 md:p-5 fade-up", className)}>
      {title && (
        <div className="mb-3">
          <h2 className="text-base font-semibold">{title}</h2>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function NumField({ label, value, onChange, unit, step = 1, min = 0, max, hint, className }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; step?: number; min?: number; max?: number; hint?: string; className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          id={id} type="number" inputMode="decimal" step={step} min={min} max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => { const v = parseFloat(e.target.value); onChange(Number.isFinite(v) ? Math.max(min, max != null ? Math.min(max, v) : v) : 0); }}
          className={cn("h-10 bg-background/60", unit && "pr-16")}
        />
        {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{unit}</span>}
      </div>
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div role="note" className={cn("flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-relaxed", tone === "warn" ? "border-warning/30 bg-warning/10 text-foreground" : "border-primary/25 bg-accent/40 text-accent-foreground")}>
      <Info className={cn("mt-0.5 size-3.5 shrink-0", tone === "warn" ? "text-warning" : "text-primary")} aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-semibold tabular">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
