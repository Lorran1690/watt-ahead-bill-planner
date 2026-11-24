import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Notice } from "@/components/voltara/ui";

export const Route = createFileRoute("/simulador")({
  head: () => ({ meta: [
    { title: "Simulador — Voltara" },
    { name: "description", content: "Simulador do Voltara, previsão da conta de luz." },
    { property: "og:title", content: "Simulador — Voltara" },
    { property: "og:description", content: "Simulador do Voltara, previsão da conta de luz." },
  ] }),
  component: Psimulador,
});

function Psimulador() {
  return (<div><PageHeader title="Simulador" /><Notice>Esta página ainda está em construção.</Notice></div>);
}
