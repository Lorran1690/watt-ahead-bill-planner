import { Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { cloudConfigured, getCloudClient } from "@/lib/voltara/cloud-client";
import { findMyHousehold, startHouseholdSync, getCloudStatus, useCloudStatus } from "@/lib/voltara/cloud-sync";
import { useHydrated } from "@tanstack/react-router";
import { CalendarClock, FlaskConical, Gauge, Plug, Receipt, Settings, Users, Wallet, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Início", icon: Gauge },
  { to: "/gastos", label: "Gastos", icon: Wallet },
  { to: "/aparelhos", label: "Aparelhos", icon: Plug },
  { to: "/habitos", label: "Hábitos", icon: CalendarClock },
  { to: "/contas", label: "Contas", icon: Receipt },
  { to: "/simulador", label: "Simular", icon: FlaskConical },
  { to: "/configuracoes", label: "Ajustes", icon: Settings },
  { to: "/compartilhar", label: "Compartilhar", icon: Users },
] as const;

/** Reconecta à casa em qualquer tela, inclusive ao abrir /gastos diretamente. */
function FamilyAutoConnect() {
  const hydrated = useHydrated();
  useEffect(() => {
    if (!hydrated || !cloudConfigured) return;
    const client = getCloudClient();
    if (!client) return;
    let active = true;
    let connecting = false;
    const restore = async () => {
      if (connecting || !active) return;
      connecting = true;
      try {
        const { data: { user }, error } = await client.auth.getUser();
        if (error || !user || !active) return;
        const membership = await findMyHousehold();
        if (membership && active && getCloudStatus().householdId !== membership.id) {
          await startHouseholdSync(membership.id);
        }
      } catch (error) {
        console.error("Erro ao restaurar compartilhamento:", error);
      } finally {
        connecting = false;
      }
    };
    void restore();
    const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        void Promise.resolve().then(restore);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [hydrated]);
  return null;
}

function Logo() {
  return (
    <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
      <Zap className="size-4.5" aria-hidden />
    </span>
  );
}

export function AppShell() {
  const hydrated = useHydrated();
  const sync = useCloudStatus();
  return (
    <div className="min-h-screen bg-background">
      <FamilyAutoConnect />
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
        <p className="mt-auto hidden px-2 text-[11px] leading-snug text-muted-foreground lg:block">{sync.phase === "online" ? "Casa compartilhada: sincronização ativa." : sync.phase === "error" ? "Sincronização interrompida. Abra Compartilhar." : "Modo local. Entre em Compartilhar para sincronizar."}</p>
      </aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/85 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2"><Logo /><span className="font-display text-lg font-semibold">Voltara</span></div>
        <div className="flex items-center gap-1">
          <Link to="/compartilhar" aria-label="Compartilhar com a família" className="rounded-lg p-2 text-muted-foreground hover:text-foreground data-[status=active]:text-primary">
            <Users className="size-5" />
          </Link>
          <Link to="/configuracoes" aria-label="Configurações" className="rounded-lg p-2 text-muted-foreground hover:text-foreground data-[status=active]:text-primary">
            <Settings className="size-5" />
          </Link>
        </div>
      </header>

      <main className="px-4 pb-28 pt-5 md:ml-20 md:px-8 md:pb-12 md:pt-8 lg:ml-56">
        <div className="mx-auto max-w-6xl">
          {hydrated ? <Outlet /> : <div className="h-64 animate-pulse rounded-2xl bg-card" aria-label="Carregando" />}
        </div>
      </main>

      <nav aria-label="Navegação inferior" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {NAV.slice(0, 6).map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
            className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted-foreground transition-colors data-[status=active]:text-primary")}>
            <Icon className="size-5" aria-hidden />{label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
