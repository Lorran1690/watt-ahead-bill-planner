import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Download, MonitorDown, Smartphone, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, PageHeader, Panel } from "@/components/voltara/ui";
import { requestVoltaraInstall, startVoltaraPwa, usePwaStatus } from "@/lib/voltara/pwa";

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

  useEffect(() => {
    startVoltaraPwa();
    setPlatform(detectPlatform());
  }, []);

  function beginInstall() {
    if (installing) return;
    setInstalling(true);
    setFeedback("");
    void requestVoltaraInstall().then((result) => {
      if (result === "accepted") setFeedback("Pedido de instalação aceito. Confira os aplicativos do aparelho.");
      else if (result === "dismissed") setFeedback("Instalação cancelada. Você pode tentar depois.");
      else setFeedback("Abra o menu do navegador e use a opção Instalar aplicativo ou Adicionar à tela inicial.");
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
          ) : status.canInstall ? (
            <Button size="lg" type="button" onClick={beginInstall} disabled={installing}
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
              </div>
              <div>
                <p className="font-semibold">iPhone (Safari)</p>
                <p className="mt-1 text-muted-foreground">
                  Abra o endereço no Safari, toque em <strong className="text-foreground">Compartilhar</strong> e
                  escolha <strong className="text-foreground">Adicionar à Tela de Início</strong>.
                  O botão automático de instalação não aparece no Safari.
                </p>
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
