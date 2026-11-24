import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Notice } from "@/components/voltara/ui";

export const Route = createFileRoute("/aparelhos")({
  head: () => ({ meta: [
    { title: "Aparelhos — Voltara" },
    { name: "description", content: "Aparelhos do Voltara, previsão da conta de luz." },
    { property: "og:title", content: "Aparelhos — Voltara" },
    { property: "og:description", content: "Aparelhos do Voltara, previsão da conta de luz." },
  ] }),
  component: Paparelhos,
});

function Paparelhos() {
  return (<div><PageHeader title="Aparelhos" /><Notice>Esta página ainda está em construção.</Notice></div>);
}
