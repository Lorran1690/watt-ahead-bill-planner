import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Notice } from "@/components/voltara/ui";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [
    { title: "Configurações — Voltara" },
    { name: "description", content: "Configurações do Voltara, previsão da conta de luz." },
    { property: "og:title", content: "Configurações — Voltara" },
    { property: "og:description", content: "Configurações do Voltara, previsão da conta de luz." },
  ] }),
  component: Pconfiguracoes,
});

function Pconfiguracoes() {
  return (<div><PageHeader title="Configurações" /><Notice>Esta página ainda está em construção.</Notice></div>);
}
