import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Notice } from "@/components/voltara/ui";

export const Route = createFileRoute("/contas")({
  head: () => ({ meta: [
    { title: "Contas — Voltara" },
    { name: "description", content: "Contas do Voltara, previsão da conta de luz." },
    { property: "og:title", content: "Contas — Voltara" },
    { property: "og:description", content: "Contas do Voltara, previsão da conta de luz." },
  ] }),
  component: Pcontas,
});

function Pcontas() {
  return (<div><PageHeader title="Contas" /><Notice>Esta página ainda está em construção.</Notice></div>);
}
