import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Home, Info, Layers, Wallet } from "lucide-react";
import { House3DScene } from "@/components/voltara/House3DScene";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice, PageHeader, Panel } from "@/components/voltara/ui";
import { currentMonthKey, money, monthLong } from "@/lib/voltara/format";
import { HOUSE_ROOMS, spendByRoom, type HouseRoomId } from "@/lib/voltara/rooms";
import { useVoltara } from "@/lib/voltara/store";

export const Route = createFileRoute("/casa-3d")({
  head: () => ({ meta: [
    { title: "Casa 3D — Voltara" },
    { name: "description", content: "Explore uma planta interativa e acompanhe o gasto em cada cômodo." },
  ] }),
  component: House3DPage,
});

function House3DPage() {
  const state = useVoltara();
  const [month, setMonth] = useState(() => currentMonthKey());
  const [selected, setSelected] = useState<HouseRoomId | null>("cozinha");
  const summary = useMemo(() => spendByRoom(state.expenses, month), [state.expenses, month]);
  const totals = useMemo(
    () => Object.fromEntries(summary.rooms.map((room) => [room.room, room.total])) as Partial<Record<HouseRoomId, number>>,
    [summary],
  );
  const monthRecords = state.expenses.filter((item) => item.date.startsWith(month + "-"));
  const activeRecords = selected
    ? monthRecords.filter((item) => item.room === selected).sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const activeRoom = HOUSE_ROOMS.find((item) => item.id === selected);
  const activeStat = summary.rooms.find((item) => item.room === selected);
  const withRoom = summary.rooms.reduce((sum, room) => sum + room.count, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Casa 3D"
        subtitle="Explore os ambientes e descubra quanto foi gasto em cada cômodo da casa."
        action={<Link to="/gastos">
          <Button size="sm"><Wallet className="mr-2 size-4" /> Registrar gasto</Button>
        </Link>}
      />

      <Notice>
        Planta 3D <strong>ilustrativa</strong>, não é uma medição da sua residência.
        A copa e a cozinha americana estão no mesmo espaço aberto, sem parede divisória.
        Os tamanhos, portas e móveis serão ajustados com suas fotos, vídeos e medidas.
      </Notice>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Home className="size-4 text-primary" /> Gastos na casa neste mês</p>
          <p className="mt-2 text-2xl font-semibold tabular">{money(summary.total)}</p>
          <p className="mt-1 text-xs capitalize text-muted-foreground">{monthLong(month)}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Layers className="size-4 text-primary" /> Gastos associados a cômodos</p>
          <p className="mt-2 text-2xl font-semibold tabular">{withRoom}</p>
          <p className="mt-1 text-xs text-muted-foreground">De {monthRecords.length} lançamentos neste mês</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><Info className="size-4 text-primary" /> Gastos gerais / sem cômodo</p>
          <p className="mt-2 text-2xl font-semibold tabular">{money(summary.unassigned)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{summary.unassignedCount} lançamento(s) fora da planta</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="house-month">Mês que deseja visualizar</Label>
          <Input id="house-month" type="month" value={month}
            onChange={(event) => {
              if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value);
            }} className="max-w-xs bg-card" />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setMonth(currentMonthKey())}>
          Mês atual
        </Button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-5">
        <div className="space-y-3 xl:col-span-3">
          <House3DScene selected={selected} totals={totals} onSelect={setSelected} />
          <div className="flex flex-wrap gap-2">
            {HOUSE_ROOMS.map((room) => (
              <button type="button" key={room.id}
                className={"rounded-lg border px-3 py-2 text-xs transition-colors " +
                  (selected === room.id ? "border-primary bg-primary/20 text-foreground" : "bg-card text-muted-foreground hover:text-foreground")}
                onClick={() => setSelected(room.id)}
                aria-pressed={selected === room.id}>
                <span className="mr-1.5 inline-block size-2 rounded-full" style={{ backgroundColor: room.color }} />
                {room.short}
                <span className="ml-2 font-semibold text-foreground">{money(totals[room.id] ?? 0)}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A planta representa <strong>sete áreas financeiras</strong> e seis ambientes físicos,
            porque copa e cozinha americana são integradas. Arraste para girar e toque num ambiente para selecionar.
          </p>
        </div>

        <div className="space-y-4 xl:col-span-2">
          <Panel title={activeRoom?.name ?? "Selecione um cômodo"}
            hint={activeRoom?.description ?? "Clique num ambiente no modelo 3D ou nos botões abaixo"}>
            {activeRoom ? (
              <>
                <div className="rounded-xl border p-4" style={{ borderColor: activeRoom.color + "70" }}>
                  <p className="text-xs text-muted-foreground">Total de {activeRoom.name.toLowerCase()} em {monthLong(month)}</p>
                  <p className="mt-1 text-3xl font-semibold tabular">{money(activeStat?.total ?? 0)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{activeStat?.count ?? 0} gasto(s) vinculado(s)</p>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Anotações do cômodo</h3>
                  <Link to="/gastos" search={{ room: selected! }} className="text-xs text-primary hover:underline">
                    Registrar aqui <ArrowRight className="ml-0.5 inline size-3" />
                  </Link>
                </div>
                {activeRecords.length ? (
                  <div className="mt-2 max-h-[340px] space-y-2 overflow-y-auto">
                    {activeRecords.map((expense) => (
                      <div key={expense.id} className="rounded-xl border bg-background/60 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="break-words text-sm">{expense.note.trim() || "Gasto sem anotação"}</span>
                          <strong className="shrink-0 text-sm tabular">{money(expense.amount)}</strong>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {expense.date.split("-").reverse().join("/")}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed p-5 text-center">
                    <p className="text-sm text-muted-foreground">Ainda não há gastos associados a este cômodo no mês selecionado.</p>
                    <Link to="/gastos" search={{ room: selected! }} className="mt-3 inline-block text-sm text-primary underline">
                      Adicionar o primeiro gasto
                    </Link>
                  </div>
                )}
              </>
            ) : <p className="text-sm text-muted-foreground">Selecione um ambiente para ver suas anotações e totais.</p>}
          </Panel>
          <Panel title="Como os valores chegam aqui">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ao registrar uma despesa em <Link to="/gastos" className="text-primary underline">Gastos</Link>,
              selecione o cômodo correspondente. O valor aparecerá nesta planta e também na versão
              compartilhada com sua esposa, quando a sincronização estiver ativa.
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Gastos gerais, como combustível ou supermercado, permanecem sem cômodo até serem classificados manualmente.
              O Voltara não inventa a localização dos gastos.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
