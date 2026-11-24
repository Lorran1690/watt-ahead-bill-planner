import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Notice } from "@/components/voltara/ui";

export const Route = createFileRoute("/habitos")({
  head: () => ({ meta: [
    { title: "Hábitos — Voltara" },
    { name: "description", content: "Hábitos do Voltara, previsão da conta de luz." },
    { property: "og:title", content: "Hábitos — Voltara" },
    { property: "og:description", content: "Hábitos do Voltara, previsão da conta de luz." },
  ] }),
  component: Phabitos,
});

function Phabitos() {
  return (<div><PageHeader title="Hábitos" /><Notice>Esta página ainda está em construção.</Notice></div>);
}
