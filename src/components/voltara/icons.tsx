import { Bike, CircleHelp, CookingPot, Fan, Lightbulb, Microwave, Monitor, Plug, Refrigerator, ShowerHead, Tv, WashingMachine, Wifi, type LucideIcon } from "lucide-react";

const MAP: Record<string, LucideIcon> = { monitor: Monitor, fan: Fan, refrigerator: Refrigerator, bike: Bike, tv: Tv, wifi: Wifi, "shower-head": ShowerHead, "cooking-pot": CookingPot, microwave: Microwave, "washing-machine": WashingMachine, lightbulb: Lightbulb, "circle-help": CircleHelp };
export function ApplianceIcon({ name, className }: { name: string; className?: string }) {
  const I = MAP[name] ?? Plug;
  return <I className={className} aria-hidden />;
}
export const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
