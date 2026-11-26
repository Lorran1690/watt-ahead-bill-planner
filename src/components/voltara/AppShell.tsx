import { Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cloudConfigured, getCloudClient } from "@/lib/voltara/cloud-client";
import { disconnectAfterAuthLoss, findMyHousehold, startHouseholdSync, getCloudStatus, useCloudStatus } from "@/lib/voltara/cloud-sync";
import { useHydrated } from "@tanstack/react-router";
import { startVoltaraPwa } from "@/lib/voltara/pwa";
import { clearConnectPushOnSignOut } from "@/lib/voltara/connect-push";
import { useConnectUnread } from "@/lib/voltara/connect-unread";
import { startFamilyPresence } from "@/lib/voltara/presence";
import { CalendarClock, Download, FlaskConical, Droplets, Gauge, House, Menu, Plug, Receipt, Settings, Users, Wallet, ChartPie, MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Início", icon: Gauge },
  { to: "/gastos", label: "Gastos", icon: Wallet },
  { to: "/financas", label: "Finanças da casa", icon: ChartPie },
  { to: "/casa-3d", label: "Casa 3D", icon: House },
  { to: "/aparelhos", label: "Aparelhos", icon: Plug },
  { to: "/habitos", label: "Hábitos", icon: CalendarClock },
  { to: "/contas", label: "Conta de Luz", icon: Receipt },
  { to: "/agua", label: "Conta de Água", icon: Droplets },
  { to: "/simulador", label: "Simular", icon: FlaskConical },
  { to: "/configuracoes", label: "Ajustes", icon: Settings },
  { to: "/compartilhar", label: "Compartilhar", icon: Users },
  { to: "/instalar", label: "Instalar app", icon: Download },
  { to: "/connect", label: "Connect", icon: MessageCircle },
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
    let previousUser: string | null = null;
    const restore = async () => {
      if (connecting || !active) return;
      connecting = true;
      try {
        const { data: { user }, error } = await client.auth.getUser();
        if (!active) return;
        if (error || !user) {
          if (!error || error.name === "AuthSessionMissingError") disconnectAfterAuthLoss();
          return;
        }
        if (previousUser && previousUser !== user.id) { void clearConnectPushOnSignOut().catch(() => {}); disconnectAfterAuthLoss(); }
        previousUser = user.id;
        const membership = await findMyHousehold();
        if (!active) return;
        if (!membership) { disconnectAfterAuthLoss(); return; }
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
      if (event === "SIGNED_OUT") {
        void clearConnectPushOnSignOut().catch(() => {});
        setTimeout(() => { if (active) { previousUser = null; disconnectAfterAuthLoss(); } }, 0);
      }
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        setTimeout(() => { if (active) void restore(); }, 0);
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
    <img
      src="/voltara-mark.svg"
      alt="Voltara"
      width={44}
      height={44}
      className="size-11 shrink-0 object-contain"
    />
  );
}

export function AppShell() {
  const hydrated = useHydrated();
  const sync = useCloudStatus();
  useEffect(() => {
    if (!hydrated) return;
    return startFamilyPresence(sync.householdId);
  }, [hydrated, sync.householdId]);
  const unread = useConnectUnread(sync.householdId, hydrated);
  const unreadBadge = (to: string) => to === "/connect" && unread > 0 ? <span aria-label={unread+" mensagens não lidas"} className="absolute -right-2 -top-1 rounded-full bg-primary px-1 min-w-4 text-center text-[10px] font-bold text-primary-foreground">{unread > 99 ? "99+" : unread}</span> : null;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const MOBILE_NAV = [NAV[0], NAV[1], NAV[NAV.length - 1]!];
  useEffect(() => {
    if (hydrated) startVoltaraPwa();
  }, [hydrated]);
  return (
    <div className="min-h-screen min-w-0 bg-background">
      <FamilyAutoConnect />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 flex-col items-center gap-2 overflow-y-auto border-r border-sidebar-border bg-sidebar py-5 md:flex lg:w-56 lg:items-stretch lg:px-3">
        <Link to="/" aria-label="Voltar ao início do Voltara" className="mb-6 flex items-center gap-2 lg:px-1">
          <Logo />
          <img src="/voltara-wordmark.svg" alt="" aria-hidden="true" width={142} height={36}
            className="hidden h-9 w-[142px] object-contain lg:block" />
        </Link>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
              className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground data-[status=active]:bg-sidebar-accent data-[status=active]:text-sidebar-foreground"
              title={label}>
              <span className="relative shrink-0"><Icon className="size-5 group-data-[status=active]:text-primary" aria-hidden />{unreadBadge(to)}</span>
              <span className="hidden lg:inline">{label}</span>
            </Link>
          ))}
        </nav>
        <p className="mt-auto hidden px-2 text-[11px] leading-snug text-muted-foreground lg:block">{sync.phase === "online" ? "Casa compartilhada: sincronização ativa." : sync.phase === "error" ? "Sincronização interrompida. Abra Compartilhar." : "Modo local. Entre em Compartilhar para sincronizar."}</p>
      </aside>

      <header className="sticky top-0 z-20 flex min-w-0 items-center justify-between gap-2 border-b bg-background/90 px-3 py-2 backdrop-blur sm:px-4 md:hidden">
        <Link to="/" aria-label="Voltar ao início do Voltara" className="flex min-w-0 shrink items-center gap-1.5 sm:gap-2">
          <Logo />
          <img src="/voltara-wordmark.svg" alt="" aria-hidden="true" width={130} height={33}
            className="h-8 min-w-0 w-[min(35vw,130px)] object-contain" />
        </Link>
        <div className="flex shrink-0 items-center gap-0.5">
          <Link to="/compartilhar" aria-label="Compartilhar com a família" className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground data-[status=active]:text-primary">
            <Users className="size-5" />
          </Link>
          <Link to="/configuracoes" aria-label="Configurações" className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground data-[status=active]:text-primary">
            <Settings className="size-5" />
          </Link>
        </div>
      </header>

      <main id="voltara-main" className="min-w-0 px-3 pb-[calc(6.75rem+env(safe-area-inset-bottom))] pt-4 sm:px-4 sm:pt-5 md:ml-20 md:px-8 md:pb-12 md:pt-8 lg:ml-56">
        <div className="mx-auto min-w-0 max-w-6xl">
          {hydrated ? <Outlet /> : <div className="h-64 animate-pulse rounded-2xl bg-card" aria-label="Carregando" />}
        </div>
      </main>

      <nav aria-label="Navegação principal no celular"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-sidebar-border bg-sidebar/95 px-1 pt-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_rgba(0,0,0,0.20)] backdrop-blur md:hidden">
        {MOBILE_NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
            className={cn("flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center text-[12px] font-medium text-muted-foreground transition-colors data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary")}>
            <span className="relative shrink-0"><Icon className="size-5" aria-hidden />{unreadBadge(to)}</span>
            <span className="max-w-full truncate">{label}</span>
          </Link>
        ))}
        <button type="button" aria-label="Abrir menu completo" aria-haspopup="dialog"
          aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)}
          className="flex min-h-[62px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[12px] font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground">
          <Menu className="size-5" aria-hidden />
          <span>Menu</span>
        </button>
      </nav>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="bottom" className="max-h-[min(88dvh,720px)] overflow-y-auto rounded-t-3xl px-4 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:hidden">
          <SheetHeader className="mb-5 pr-7 text-left">
            <SheetTitle>Explorar Voltara</SheetTitle>
            <SheetDescription>Todos os recursos da casa em um só lugar.</SheetDescription>
          </SheetHeader>
          <nav aria-label="Todas as páginas do Voltara" className="grid grid-cols-2 gap-2">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
                onClick={() => setMobileMenuOpen(false)}
                className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm font-medium text-foreground hover:bg-accent data-[status=active]:border-primary/60 data-[status=active]:bg-primary/15 data-[status=active]:text-primary">
                <span className="relative shrink-0"><Icon className="size-5" aria-hidden />{unreadBadge(to)}</span>
                <span className="min-w-0 break-words">{label}</span>
              </Link>
            ))}
          </nav>
          <p className="mt-5 break-words rounded-xl border border-border/80 bg-background/70 p-3 text-xs text-muted-foreground">
            {sync.phase === "online"
              ? "Casa compartilhada: sincronização ativa."
              : sync.phase === "error"
                ? "Sincronização interrompida. Abra Compartilhar para reconectar."
                : "Os dados deste aparelho permanecem locais até você ativar o compartilhamento."}
          </p>
        </SheetContent>
      </Sheet>
    </div>
  );
}
