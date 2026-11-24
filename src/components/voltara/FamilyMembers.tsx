import { Users, UserRound, UserPlus } from "lucide-react";
import { Panel } from "@/components/voltara/ui";
import { presenceLabel, setPresenceEnabled, useFamilyPresence } from "@/lib/voltara/presence";

const labels = {
  online: { text: "Online no Voltara", color: "bg-emerald-400" },
  unstable: { text: "Sinal recente / instável", color: "bg-amber-400" },
  offline: { text: "Offline / sem sinal recente", color: "bg-slate-400" },
  unknown: { text: "Presença indisponível", color: "bg-slate-400" },
};
export function FamilyMembers() {
  const presence = useFamilyPresence();
  return (
    <Panel title="Membros da casa" hint="Veja quem aceitou o convite e a presença compartilhada no aplicativo.">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4 shrink-0" aria-hidden />
          {presence.error ? "Consulta indisponível" : presence.ready ? presence.members.length + " de 2 membros vinculados" : "Consultando membros..."}
        </div>
        {presence.error && <p role="status" className="text-sm text-muted-foreground">{presence.error}</p>}
        {!presence.error && presence.members.map((member) => {
          const status = labels[presenceLabel(member)];
          return (
            <div key={member.role} className="flex min-w-0 items-start gap-3 rounded-xl border bg-background/50 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm">{member.is_self ? "Você" : member.role === "owner" ? "Titular da casa" : "Membro convidado"}</p>
                <p className="text-xs text-muted-foreground">Vinculado à casa</p>
                <p className="mt-2 flex items-center gap-2 text-xs"><span className={"size-2 shrink-0 rounded-full " + status.color} />{status.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {member.last_seen_at ? "Último sinal: " + new Date(member.last_seen_at).toLocaleString("pt-BR") : "Nenhum sinal de presença compartilhado."}
                </p>
              </div>
            </div>
          );
        })}
        {!presence.error && presence.ready && presence.members.length === 1 && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
            <UserPlus className="size-5 shrink-0" /> Aguardando a entrada da segunda pessoa na casa.
          </div>
        )}
        <label className="flex items-start gap-3 rounded-xl border p-3 text-sm">
          <input type="checkbox" checked={presence.enabled} disabled={!presence.ready}
            onChange={(e) => setPresenceEnabled(e.target.checked)} className="mt-1 size-4 shrink-0" />
          <span><strong>Compartilhar minha presença neste aparelho</strong>
            <span className="mt-1 block text-xs text-muted-foreground">Somente os membros da sua casa verão seu último sinal enquanto o Voltara estiver visível. Desative quando quiser. Não monitora outras atividades nem localização.</span>
          </span>
        </label>
        <p className="text-xs text-muted-foreground">Atualização a cada 15 segundos. Sem sinal por mais de 90 segundos, o aplicativo indica offline. O estado é estimado e depende da conexão e da opção de presença.</p>
      </div>
    </Panel>
  );
}
