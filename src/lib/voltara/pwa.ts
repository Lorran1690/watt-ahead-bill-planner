import { useSyncExternalStore } from "react";

/** O navegador dispara beforeinstallprompt somente quando há suporte e elegibilidade. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

interface PwaStatus {
  canInstall: boolean;
  isInstalled: boolean;
  registered: boolean;
  lastError: string | null;
}

const SERVER_STATUS: PwaStatus = {
  canInstall: false, isInstalled: false, registered: false, lastError: null,
};

let status: PwaStatus = SERVER_STATUS;
let deferredPrompt: InstallPromptEvent | null = null;
let started = false;
const listeners = new Set<() => void>();

function publish(change: Partial<PwaStatus>) {
  status = { ...status, ...change };
  for (const listener of listeners) listener();
}

export const getPwaStatus = () => status;
export const subscribePwaStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function usePwaStatus() {
  return useSyncExternalStore(subscribePwaStatus, getPwaStatus, () => SERVER_STATUS);
}

function displayStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const safariStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return safariStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

export function startVoltaraPwa() {
  if (typeof window === "undefined" || started) return;
  started = true;
  publish({ isInstalled: displayStandalone() });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    publish({ canInstall: true, lastError: null });
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    publish({ isInstalled: true, canInstall: false, lastError: null });
  });

  // Em modos instalados, a transição acontece sem recarregar em alguns navegadores.
  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", () => {
    publish({ isInstalled: displayStandalone(), canInstall: !displayStandalone() && deferredPrompt !== null });
  });

  if (!("serviceWorker" in navigator) || !window.isSecureContext) {
    return; // Desenvolvimento sem HTTPS, HTTP remoto e browsers antigos.
  }

  // Registrar apenas o worker estático. HTML autenticado e dados privados nunca são cacheados.
  void navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" })
    .then(() => publish({ registered: true }))
    .catch((err: unknown) => {
      console.warn("Voltara PWA: service worker não disponível", err);
      publish({ lastError: "Não foi possível preparar o acesso instalado neste navegador." });
    });
}

/** Precisa ser invocado diretamente dentro do clique, para conservar a ativação do usuário. */
export async function requestVoltaraInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt || displayStandalone()) return "unavailable";
  const event = deferredPrompt;
  deferredPrompt = null;
  publish({ canInstall: false, lastError: null });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") publish({ lastError: null });
    return choice.outcome;
  } catch (error) {
    console.warn("Voltara PWA: falha ao abrir o diálogo de instalação", error);
    publish({ lastError: "A instalação automática não está disponível. Use o menu do navegador." });
    return "unavailable";
  }
}
