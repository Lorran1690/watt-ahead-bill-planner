import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Copy, Download, ExternalLink, MonitorDown, Smartphone, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader, Panel } from "@/components/voltara/ui";
import { requestVoltaraInstall, startVoltaraPwa, usePwaStatus } from "@/lib/voltara/pwa";
import { PUBLIC_INSTALL_URL } from "@/lib/voltara/public-url";

export const Route = createFileRoute("/instalar")({
  head: () => ({
    meta: [
      { title: "Instalar o Voltara no celular e no computador" },
      { name: "description", content: "Adicione o Voltara à tela inicial do Android, iPhone ou computador." },
    ],
  }),
  component: InstallPage,
});

type Platform = "android" | "ios" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const agent = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(agent)) return "android";
  return "desktop";
}

function InstallPage() {
  const status = usePwaStatus();
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [feedback, setFeedback] = useState("");
  const [installing, setInstalling] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [showDesktopGuide, setShowDesktopGuide] = useState(false);
  const [areaFeedback, setAreaFeedback] = useState<Partial<Record<"android" | "ios" | "desktop", string>>>({});

  useEffect(() => {
    startVoltaraPwa();
    setPlatform(detectPlatform());
    // Prévia dentro do editor não é o endereço definitivo para instalar.
    setIsPreview(window.location.origin !== new URL(PUBLIC_INSTALL_URL).origin);
  }, []);

  type Target = "android" | "ios" | "desktop";

  async function copyLink(target: Target) {
    const url = PUBLIC_INSTALL_URL;
    try {
      await navigator.clipboard.writeText(url);
      const destination = target === "ios" ? "Safari do iPhone" : target === "android" ? "Chrome do Android" : "Chrome ou Edge do computador";
      setAreaFeedback((previous) => ({
        ...previous,
        [target]: "Link copiado! Abra o endereço no " + destination + " para instalar o Voltara.",
      }));
    } catch {
      setAreaFeedback((previous) => ({
        ...previous,
        [target]: "Não foi possível copiar automaticamente. Abra este endereço no aparelho: " + url,
      }));
    }
  }

  function beginInstall(target?: "android" | "desktop") {
    // Evita oferecer uma instalação para o aparelho errado quando o link é aberto no PC/celular.
    if (target && platform !== "unknown" && target !== platform) {
      void copyLink(target);
      return;
    }
    if (installing) return;
    setInstalling(true);
    setFeedback("");
    if (target) setAreaFeedback((previous) => ({ ...previous, [target]: "" }));
    // Chamado a partir do clique, sem await antes do prompt do navegador.
    void requestVoltaraInstall().then((result) => {
      const message = result === "accepted"
        ? "Instalação iniciada. Procure o ícone do Voltara nos seus aplicativos."
        : result === "dismissed"
          ? "Instalação cancelada. Você pode tentar novamente pelo menu do navegador."
          : target === "android"
            ? "No Chrome do Android, toque em ⋮ → Instalar app ou Adicionar à tela inicial. Abra o site diretamente no Chrome, fora da prévia incorporada."
            : "No Chrome ou Edge do computador, use o menu → Instalar como aplicativo. Abra o site diretamente em uma guia do navegador.";
      if (target) setAreaFeedback((previous) => ({ ...previous, [target]: message }));
      else setFeedback(message);
      setInstalling(false);
    });
  }


  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Instalar Voltara" subtitle="Tenha o controle da casa na tela inicial do celular ou em uma janela própria no computador." />

      <Panel>
        <div className="flex min-w-0 flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <img src="/voltara-icon-192.png" alt="Ícone do Voltara" width={94} height={94}
            className="size-24 shrink-0 rounded-3xl border border-primary/15" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Voltara no seu aparelho</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              É um aplicativo web instalável (PWA). Ele pode ser aberto diretamente pelo ícone,
              sem procurar o site sempre que quiser registrar um gasto.
            </p>
          </div>
          {status.isInstalled ? (
            <div className="flex items-center gap-2 text-sm font-semibold text-success">
              <CheckCircle2 className="size-5" /> Já instalado
            </div>
          ) : isPreview ? (
            <Button asChild size="lg" className="min-h-12 w-full sm:w-auto">
              <a href={PUBLIC_INSTALL_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 size-4" /> Abrir site oficial
              </a>
            </Button>
          ) : status.canInstall ? (
            <Button size="lg" type="button" onClick={() => beginInstall()} disabled={installing}
              className="min-h-12 w-full sm:w-auto">
              <Download className="mr-2 size-4" /> {installing ? "Preparando..." : "Instalar agora"}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Use as instruções abaixo</span>
          )}
        </div>
        {feedback && <p role="status" className="mt-3 text-sm text-primary">{feedback}</p>}
        {status.lastError && <p role="alert" className="mt-3 break-words text-sm text-destructive">{status.lastError}</p>}
      </Panel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="No celular" hint="Android ou iPhone">
          <div className="flex items-start gap-3">
            <Smartphone className="size-7 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 space-y-4 text-sm leading-relaxed">
              <div>
                <p className="font-semibold">Android (Chrome)</p>
                <p className="mt-1 text-muted-foreground">
                  Abra o endereço do Voltara no Chrome. Toque nos três pontos (⋮) e escolha
                  <strong className="text-foreground"> Instalar app</strong> ou <strong className="text-foreground">Adicionar à tela inicial</strong>.
                  Confirme para ver o ícone do Voltara na tela inicial.
                </p>
                {isPreview && platform === "android" ? (
                  <Button asChild size="sm" className="mt-3 min-h-11 w-full justify-center sm:w-auto">
                    <a href={PUBLIC_INSTALL_URL} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 size-4" /> Abrir Voltara público no Chrome
                    </a>
                  </Button>
                ) : (
                <Button type="button" size="sm" className="mt-3 min-h-11 w-full justify-center sm:w-auto"
                  disabled={installing || (platform === "android" && status.isInstalled)}
                  onClick={() => beginInstall("android")}>
                  {platform === "desktop" || platform === "ios" ? <Copy className="mr-2 size-4" /> : <Download className="mr-2 size-4" />}
                  {platform === "android" && status.isInstalled ? "Já instalado" :
                    platform === "desktop" || platform === "ios" ? "Copiar link para Android" : "Instalar no Android"}
                </Button>
                )}
                {areaFeedback.android && <p role="status" className="mt-2 break-words text-xs text-primary">{areaFeedback.android}</p>}
              </div>
              <div>
                <p className="font-semibold">iPhone (Safari)</p>
                <p className="mt-1 text-muted-foreground">
                  Abra o endereço no Safari, toque em <strong className="text-foreground">Compartilhar</strong> e
                  escolha <strong className="text-foreground">Adicionar à Tela de Início</strong>.
                  O botão automático de instalação não aparece no Safari.
                </p>
                <Button type="button" variant="outline" size="sm" className="mt-3 min-h-11 w-full justify-center sm:w-auto"
                  onClick={() => void copyLink("ios")}>
                  <Copy className="mr-2 size-4" /> Copiar link para o Safari
                </Button>
                {areaFeedback.ios && <p role="status" className="mt-2 break-words text-xs text-primary">{areaFeedback.ios}</p>}
              </div>
              {platform === "android" && <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">Você está no Android. Prefira abrir o endereço diretamente no Chrome, fora de um navegador incorporado.</p>}
              {platform === "ios" && <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">Você está no iPhone ou iPad. Faça a instalação pelo botão Compartilhar do Safari.</p>}
            </div>
          </div>
        </Panel>

        <Panel title="No computador" hint="Windows, macOS ou Linux">
          <div className="flex items-start gap-3">
            <MonitorDown className="size-7 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 space-y-4 text-sm leading-relaxed">
              <div>
                <p className="font-semibold">Google Chrome</p>
                <p className="mt-1 text-muted-foreground">
                  Abra o Voltara em uma guia do Chrome e clique no ícone de instalação na barra de endereço,
                  quando aparecer. Se não aparecer, procure <strong className="text-foreground">Instalar página como app</strong> no menu do navegador.
                </p>
                {platform === "android" || platform === "ios" ? (
                  <Button type="button" size="sm" className="mt-3 min-h-11 w-full justify-center sm:w-auto"
                    onClick={() => void copyLink("desktop")}>
                    <Copy className="mr-2 size-4" /> Copiar link para PC
                  </Button>
                ) : status.isInstalled ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-success">
                    <CheckCircle2 className="size-4" /> Voltara já instalado neste navegador
                  </p>
                ) : isPreview ? (
                  <Button asChild size="sm" className="mt-3 min-h-11 w-full justify-center sm:w-auto">
                    <a href={PUBLIC_INSTALL_URL} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 size-4" /> Abrir Voltara público para instalar
                    </a>
                  </Button>
                ) : status.canInstall ? (
                  <Button type="button" size="sm" className="mt-3 min-h-11 w-full justify-center sm:w-auto"
                    disabled={installing} onClick={() => beginInstall("desktop")}>
                    <Download className="mr-2 size-4" /> {installing ? "Abrindo..." : "Instalar no computador"}
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline"
                    className="mt-3 min-h-11 w-full justify-center sm:w-auto"
                    onClick={() => setShowDesktopGuide((value) => !value)}
                    aria-expanded={showDesktopGuide} aria-controls="voltara-desktop-guide">
                    <MonitorDown className="mr-2 size-4" />
                    {showDesktopGuide ? "Ocultar instruções" : "Como instalar no computador"}
                  </Button>
                )}
                {areaFeedback.desktop && <p role="status" className="mt-2 break-words text-xs text-primary">{areaFeedback.desktop}</p>}
                {!isPreview && showDesktopGuide && platform === "desktop" && (
                  <div id="voltara-desktop-guide" role="region" aria-label="Passos para instalar no computador"
                    className="mt-3 space-y-2 rounded-xl border border-primary/30 bg-primary/10 p-3 text-xs leading-relaxed text-foreground">
                    <p className="font-semibold">O Chrome não ofereceu o botão automático neste momento.</p>
                    <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                      <li>Abra o Voltara em uma guia normal do Chrome ou Edge, não dentro da prévia do Lovable.</li>
                      <li>No <strong className="text-foreground">Chrome</strong>, clique em ⋮ e procure <strong className="text-foreground">Transmitir, salvar e compartilhar → Instalar página como app</strong>. O nome pode variar.</li>
                      <li>No <strong className="text-foreground">Edge</strong>, clique em ⋯ → Aplicativos → Instalar este site como aplicativo.</li>
                      <li>Confirme a instalação para abrir o Voltara em janela própria.</li>
                    </ol>
                    <Button asChild variant="outline" size="sm" className="min-h-11 w-full whitespace-normal">
                      <a href={PUBLIC_INSTALL_URL} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 size-4" /> Abrir site público em outra guia
                      </a>
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <p className="font-semibold">Microsoft Edge</p>
                <p className="mt-1 text-muted-foreground">
                  Abra o Voltara, vá em <strong className="text-foreground">⋯ → Aplicativos → Instalar este site como aplicativo</strong>.
                  Depois poderá fixá-lo no menu Iniciar ou na barra de tarefas.
                </p>
              </div>
              {platform === "desktop" && <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">Você está usando um computador. Chrome e Edge permitem abrir o Voltara em uma janela separada.</p>}
            </div>
          </div>
        </Panel>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <ExternalLink className="size-4 shrink-0" aria-hidden />
        <a href={PUBLIC_INSTALL_URL} target="_blank" rel="noopener noreferrer"
          className="min-h-11 inline-flex items-center text-primary underline underline-offset-4">
          Abrir o Voltara em uma nova guia para instalar
        </a>
      </div>

      <Panel title="Seus dados e a sincronização">
        <div className="grid gap-3 text-sm leading-relaxed text-muted-foreground sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <Wifi className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
            <p>Com internet e a <Link to="/compartilhar" className="text-primary underline">casa compartilhada</Link> conectada,
              os dados podem sincronizar entre o aplicativo do celular e o do PC.</p>
          </div>
          <div className="flex items-start gap-2">
            <WifiOff className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <p>Sem internet, uma tela explicativa poderá aparecer. O acesso completo offline
              e a sincronização offline ainda não estão disponíveis.</p>
          </div>
        </div>
      </Panel>

      <Notice>
        A instalação usa o próprio navegador, sem arquivo APK ou EXE. Para uma experiência estável,
        instale usando o domínio final publicado e com HTTPS. Uma prévia aberta dentro do editor
        pode impedir a instalação automática.
      </Notice>
    </div>
  );
}
