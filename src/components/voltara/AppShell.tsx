import { Link, Outlet } from "@tanstack/react-router";
import { useHydrated } from "@tanstack/react-router";
import { CalendarClock, FlaskConical, Gauge, Plug, Receipt, Settings, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Início", icon: Gauge },
  { to: "/aparelhos", label: "Aparelhos", icon: Plug },
  { to: "/habitos", label: "Hábitos", icon: CalendarClock },
  { to: "/contas", label: "Contas", icon: Receipt },
  { to: "/simulador", label: "Simular", icon: FlaskConical },
  { to: "/configuracoes", label: "Ajustes", icon: Settings },
] as const;

function Logo() {
  return (
    <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
      <Zap className="size-4.5" aria-hidden />
    </span>
  );
}

export function AppShell() {
  const hydrated = useHydrated();
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center gap-2 border-r border-sidebar-border bg-sidebar py-5 md:flex lg:w-56 lg:items-stretch lg:px-3">
        <div className="mb-6 flex items-center gap-2.5 lg:px-2">
          <Logo />
          <span className="hidden font-display text-lg font-semibold lg:inline">Voltara</span>
        </div>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-foreground"
              title={label}>
              <Icon className="size-5 shrink-0 group-data-[status=active]:text-primary" aria-hidden />
              <span className="hidden lg:inline">{label}</span>
            </Link>
          ))}
        </nav>
        <p className="mt-auto hidden px-2 text-[11px] leading-snug text-muted-foreground lg:block">Dados salvos só neste navegador.</p>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/85 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2"><Logo /><span className="font-display text-lg font-semibold">Voltara</span></div>
        <Link to="/configuracoes" aria-label="Configurações" className="rounded-lg p-2 text-muted-foreground hover:text-foreground data-[status=active]:text-primary">
          <Settings className="size-5" />
        </Link>
      </header>

      <main className="px-4 pb-28 pt-5 md:ml-20 md:px-8 md:pb-12 md:pt-8 lg:ml-56">
        <div className="mx-auto max-w-6xl">
          {hydrated ? <Outlet /> : <div className="h-64 animate-pulse rounded-2xl bg-card" aria-label="Carregando" />}
        </div>
      </main>

      <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
            className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground transition-colors data-[status=active]:text-primary")}>
            <Icon className="size-5" aria-hidden />{label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
