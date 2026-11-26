import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Cloud, CloudOff, Copy, ExternalLink, KeyRound, Link2, LogOut, RefreshCcw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cloudConfigured, getCloudClient } from "@/lib/voltara/cloud-client";
import {
  createHousehold, discardPendingChanges, findMyHousehold, importLocalToHousehold,
  issueHouseholdInvite, joinHousehold, retryHouseholdSync, sendSignInEmail,
  signInWithCopiedEmailLink, signOutFamily, startHouseholdSync, useCloudStatus,
} from "@/lib/voltara/cloud-sync";
import { Notice, PageHeader, Panel } from "@/components/voltara/ui";
import { FamilyMembers } from "@/components/voltara/FamilyMembers";
import { PasswordAccount } from "@/components/voltara/PasswordAccount";
import { PUBLIC_APP_ORIGIN, PUBLIC_SHARING_URL } from "@/lib/voltara/public-url";
import { buildHouseholdInviteLink, clearPendingHouseholdInvite, getPendingHouseholdInvite, readHouseholdInviteHash, rememberHouseholdInvite } from "@/lib/voltara/invite-link";

export const Route = createFileRoute("/compartilhar")({
  head: () => ({ meta: [
    { title: "Compartilhar — Voltara" },
    { name: "description", content: "Compartilhe gastos e previsões com outra pessoa, em tempo real e com acesso privado." },
  ] }),
  component: SharePage,
});

type Member = { id: string; role: "owner" | "member" } | null;

function SharePage() {
  const status = useCloudStatus();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [household, setHousehold] = useState<Member>(null);
  const [houseName, setHouseName] = useState("Nossa casa");
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmJoin, setConfirmJoin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedInviteLink, setCopiedInviteLink] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [showEmailRecovery, setShowEmailRecovery] = useState(false);
  const [pastedAuthLink, setPastedAuthLink] = useState("");

  useEffect(() => {
    const preview = window.location.origin !== PUBLIC_APP_ORIGIN && !import.meta.env.DEV;
    setIsPreview(preview);
    if (preview) return;
    const fromHash = readHouseholdInviteHash(window.location.hash);
    if (fromHash) {
      try { rememberHouseholdInvite(window.localStorage, fromHash); } catch { /* sem armazenamento persistente */ }
      setJoinCode(fromHash);
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      setMessage("Convite recebido! Entre com seu e-mail e confirme a entrada na casa.");
    } else {
      const saved = getPendingHouseholdInvite(window.localStorage);
      if (saved) setJoinCode(saved);
    }
  }, []);

  useEffect(() => {
    const client = getCloudClient();
    if (!client) { setChecking(false); return; }
    let alive = true;
    async function refresh() {
      try {
        const e = await client!.auth.getUser();
        if (!alive) return;
        const signedEmail = e.data.user?.email ?? null;
        setMyEmail(signedEmail);
        if (!signedEmail) {
          setHousehold(null);
          return;
        }
        const member = await findMyHousehold();
        if (!alive) return;
        setHousehold(member);
        if (member && status.householdId !== member.id) {
          await startHouseholdSync(member.id);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Erro ao conectar à casa.");
      } finally {
        if (alive) setChecking(false);
      }
    }
    void refresh();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event) => {
      // Não chamar uma API de Auth sincronamente dentro do callback.
      setTimeout(() => { if (alive) void refresh(); }, 0);
    });
    return () => { alive = false; subscription.unsubscribe(); };
    // Conferir a sessão ao entrar na página, não reiniciar o canal em cada status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(operation: () => Promise<void>) {
    setLoading(true);
    setMessage("");
    setError("");
    try { await operation(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível concluir a operação."); }
    finally { setLoading(false); }
  }

  function sendLogin(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await sendSignInEmail(email);
      setMessage("E-mail enviado! Abra o link no Voltara público. Se ele continuar levando ao Lovable, use a opção \"Confirmar sem redirecionamento\" logo abaixo.");
    });
  }

  function confirmPastedEmail(event: FormEvent) {
    event.preventDefault();
    const link = pastedAuthLink;
    setPastedAuthLink("");
    void run(async () => {
      await signInWithCopiedEmailLink(link);
      setMessage("E-mail confirmado! Sua sessão foi aberta diretamente no Voltara público.");
    });
  }

  function create() {
    void run(async () => {
      const id = await createHousehold(houseName);
      setHousehold({ id, role: "owner" });
      // O próprio clique do usuário confirma que deseja levar o perfil deste dispositivo à casa.
      await importLocalToHousehold(id);
      setMessage("Casa criada. Os dados deste dispositivo foram compartilhados. Agora gere o convite.");
    });
  }

  function join() {
    if (!confirmJoin) {
      setError("Confirme antes de substituir a visualização local pelos dados da casa.");
      return;
    }
    void run(async () => {
      const id = await joinHousehold(joinCode.trim().toLowerCase());
      setHousehold({ id, role: "member" });
      await startHouseholdSync(id);
      try { clearPendingHouseholdInvite(window.localStorage); } catch { /* armazenamento pode estar bloqueado */ }
      setJoinCode("");
      setMessage("Você entrou na casa! Os lançamentos passam a ser compartilhados.");
      setConfirmJoin(false);
    });
  }

  function generateCode() {
    if (!household) return;
    void run(async () => {
      const code = await issueHouseholdInvite(household.id);
      setInviteCode(code);
      setCopied(false);
      setCopiedInviteLink(false);
      setMessage("Convite gerado. Copie o link público e envie diretamente à sua esposa. Ele vale por 7 dias e só pode ser usado uma vez.");
    });
  }

  function copyCode() {
    if (!inviteCode) return;
    void run(async () => {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setMessage("Código copiado. Envie somente para a pessoa com quem deseja compartilhar.");
    });
  }

  function copyInviteLink() {
    if (!inviteCode) return;
    void run(async () => {
      await navigator.clipboard.writeText(buildHouseholdInviteLink(inviteCode));
      setCopiedInviteLink(true);
      setMessage("Link do site público copiado. Envie em particular para sua esposa.");
    });
  }

  function signOut() {
    void run(async () => {
      await signOutFamily();
      setMyEmail(null);
      setHousehold(null);
      setInviteCode("");
      try { clearPendingHouseholdInvite(window.localStorage); } catch { /* armazenamento pode estar bloqueado */ }
      setMessage("Sessão encerrada. O perfil pessoal deste navegador foi restaurado.");
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Compartilhar" subtitle="Uma casa, dois acessos. Quando um salva um gasto, o outro recebe a atualização." />

      {isPreview && (
        <Notice tone="warn">
          Você está na <strong>prévia do Lovable</strong>, que pode exigir acesso ao editor e não deve ser enviada como convite.
          Entre pelo <a href={PUBLIC_SHARING_URL} className="font-semibold text-primary underline">Voltara público <ExternalLink className="inline size-3" /></a>.
          Antes de trocar de endereço, <Link to="/configuracoes" className="underline">exporte seu backup</Link> se tiver gastos salvos somente neste navegador.
          Os dados locais da prévia não são transferidos automaticamente para o domínio público.
        </Notice>
      )}

      {cloudConfigured && !checking && <PasswordAccount email={myEmail} disabled={isPreview}/>}
      {!cloudConfigured ? (
        <Panel title="Ativação pendente">
          <div className="flex items-start gap-3">
            <CloudOff className="mt-1 size-6 shrink-0 text-primary" />
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>O compartilhamento precisa de um banco Supabase <strong className="text-foreground">exclusivo do Voltara</strong>. Ainda não há um backend conectado a este projeto.</p>
              <p>Enquanto isso, seus dados continuam salvos apenas neste navegador. Nada foi enviado para a nuvem.</p>
              <p>Depois de criar a infraestrutura, configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> nas variáveis do app. Não use chaves secretas.</p>
            </div>
          </div>
        </Panel>
      ) : checking ? (
        <Panel title="Verificando sessão"><p className="text-sm text-muted-foreground">Conferindo seu acesso...</p></Panel>
      ) : (
        <>
          <Panel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {status.phase === "online" ? <Cloud className="size-6 text-success" /> : <CloudOff className="size-6 text-muted-foreground" />}
                <div className="min-w-0">
                  <p className="break-words font-semibold">{status.phase === "online" ? "Sincronização conectada" :
                    status.phase === "connecting" ? "Conectando..." :
                    status.phase === "error" ? "Sincronização interrompida" :
                    status.phase === "empty" ? "Casa sem dados" : "Aguardando compartilhamento"}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {status.pending > 0 ? status.pending + " alteração(ões) aguardando envio. " : ""}
                    {status.message || (myEmail ? "Conta: " + myEmail : "Sem sessão iniciada")}
                  </p>
                </div>
              </div>
              {myEmail && (
                <div className="flex gap-2">
                  {status.phase === "error" && <Button type="button" variant="outline" size="sm"
                    onClick={() => void run(retryHouseholdSync)}>
                    <RefreshCcw className="mr-1 size-4" /> Tentar novamente
                  </Button>}
                  <Button type="button" variant="outline" size="sm" onClick={signOut}>
                    <LogOut className="mr-1 size-4" /> Sair
                  </Button>
                </div>
              )}
            </div>
          </Panel>

          {!myEmail ? (
            <Panel title="Entrar com seu e-mail" hint="Cada pessoa entra na própria conta, sem compartilhar senhas.">
              <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={sendLogin}>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="cloud-email">E-mail</Label>
                  <Input id="cloud-email" type="email" required autoComplete="email"
                    placeholder="voce@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
                <Button type="submit" disabled={loading || isPreview}><KeyRound className="mr-2 size-4" /> Enviar link de acesso</Button>
              </form>
              <p className="mt-3 text-xs text-muted-foreground">
                Você receberá um link de uso único. Use sempre o endereço público do Voltara, nunca a prévia do Lovable.
              </p>
              <div className="mt-4 border-t pt-4">
                <button type="button" className="min-h-11 text-left text-sm font-semibold text-primary underline"
                  aria-expanded={showEmailRecovery} aria-controls="voltara-login-recovery"
                  onClick={() => setShowEmailRecovery((value) => !value)}>
                  O e-mail abriu o Lovable? Confirmar sem redirecionamento
                </button>
                {showEmailRecovery && (
                  <div id="voltara-login-recovery" className="mt-3 space-y-3">
                    <Notice tone="warn">
                      No e-mail novo, <strong>não clique</strong> no botão de confirmação. Pressione-o por alguns segundos
                      no celular, ou clique com o botão direito no computador, e escolha <strong>Copiar endereço do link</strong>.
                      Cole abaixo dentro do Voltara público. Links já utilizados podem ter expirado.
                    </Notice>
                    <form onSubmit={confirmPastedEmail} className="space-y-2">
                      <Label htmlFor="voltara-copied-email-link">Endereço do link de confirmação do Supabase</Label>
                      <Input id="voltara-copied-email-link" type="password" value={pastedAuthLink}
                        onChange={(event) => setPastedAuthLink(event.target.value)}
                        maxLength={4096} autoComplete="off" placeholder="Cole o endereço completo aqui" required />
                      <Button type="submit" disabled={loading || isPreview} className="min-h-11 w-full sm:w-auto">
                        <KeyRound className="mr-2 size-4" /> Confirmar meu acesso aqui
                      </Button>
                    </form>
                    <p className="text-xs text-muted-foreground">
                      O endereço é usado somente para verificar sua identidade com o Supabase. Não o envie para outras pessoas nem para este chat.
                    </p>
                  </div>
                )}
              </div>
            </Panel>
          ) : !household ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Criar uma casa" hint="Use em seu aparelho principal para compartilhar os dados que você já cadastrou.">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="house-name">Nome da casa</Label>
                    <Input id="house-name" maxLength={80} value={houseName} onChange={(event) => setHouseName(event.target.value)} />
                  </div>
                  <Notice>Ao criar, os gastos, aparelhos, faturas e ajustes deste navegador serão enviados para a casa compartilhada.</Notice>
                  <Button disabled={loading} onClick={create} className="w-full">
                    <Users className="mr-2 size-4" /> Criar e compartilhar meus dados
                  </Button>
                </div>
              </Panel>
              <Panel title="Entrar com um convite" hint="Ideal para o segundo celular">
                <div className="space-y-3">
                  {joinCode && (
                    <Notice>Convite identificado. Confira os dados e confirme abaixo para entrar nesta casa.</Notice>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-entry">Código recebido</Label>
                    <Input id="invite-entry" className="min-w-0" value={joinCode} onChange={(event) => setJoinCode(event.target.value)}
                      placeholder="Cole aqui o convite recebido" autoComplete="off" />
                  </div>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" checked={confirmJoin} onChange={(event) => setConfirmJoin(event.target.checked)}
                      className="mt-0.5" />
                    Entendo que os dados da casa substituirão a visualização local neste navegador.
                    Posso exportar um backup antes.
                  </label>
                  <Button variant="outline" className="w-full" disabled={loading || !confirmJoin}
                    onClick={join}>Entrar na casa</Button>
                </div>
              </Panel>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Sua casa compartilhada">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="size-6 text-success" />
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold">{household.role === "owner" ? "Titular da casa" : "Membro convidado"}</p>
                    <p className="text-muted-foreground">
                      Os dois membros autenticados podem adicionar, editar e excluir gastos, aparelhos e faturas. As atualizações são sincronizadas entre os dispositivos conectados.
                    </p>
                    <Link to="/gastos" className="inline-block text-primary underline">Abrir controle de gastos</Link>
                  </div>
                </div>
                {status.phase === "empty" && (
                  <div className="mt-3 space-y-2">
                    <Notice tone="warn">Nenhum registro está salvo na casa. Caso seja o titular, importe o perfil deste dispositivo.</Notice>
                    {household.role === "owner" && (
                      <Button variant="outline" disabled={loading}
                        onClick={() => void run(async () => {
                          await importLocalToHousehold(household.id);
                          setMessage("Dados compartilhados!");
                        })}>Enviar dados deste dispositivo</Button>
                    )}
                  </div>
                )}
              </Panel>
              {household.role === "owner" && (
                <Panel title="Convidar a segunda pessoa" hint="Código secreto, expira em 7 dias e funciona uma única vez.">
                  <Button disabled={loading} type="button" onClick={generateCode}>
                    <KeyRound className="mr-2 size-4" /> Gerar convite
                  </Button>
                  {inviteCode && (
                    <div className="mt-3 space-y-2">
                      <p className="break-all rounded-xl border bg-background/60 p-3 font-mono text-xs" aria-label="Código de convite">{inviteCode}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={copyInviteLink} type="button" disabled={loading} className="min-h-11">
                          {copiedInviteLink ? <Check className="mr-2 size-4" /> : <Link2 className="mr-2 size-4" />}
                          {copiedInviteLink ? "Link copiado" : "Copiar convite com link direto"}
                        </Button>
                        <Button variant="outline" onClick={copyCode} type="button" disabled={loading} className="min-h-11">
                          {copied ? <Check className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}
                          {copied ? "Código copiado" : "Copiar só o código"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        O link abre <strong>{PUBLIC_APP_ORIGIN}</strong>, não o editor Lovable. Sua esposa faz login com o próprio e-mail
                        e confirma a entrada na casa. Envie o convite somente em particular.
                      </p>
                    </div>
                  )}
                </Panel>
              )}
            </div>
          )}
        </>
      )}

      {myEmail && household && status.pending > 0 && status.phase === "error" && (
        <Panel title="Recuperar alterações pendentes">
          <Notice tone="warn">Se o envio não concluir, exporte o backup JSON em Ajustes. A recuperação abaixo preserva uma cópia local e restaura os dados já sincronizados da casa. Ela descarta somente alterações pendentes neste aparelho.</Notice>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/configuracoes" className="text-sm text-primary underline">Exportar backup antes</Link>
            <Button variant="outline" disabled={loading} onClick={() => {
              if (window.confirm("Restaurar os dados da nuvem e descartar as alterações pendentes deste aparelho? Exporte um backup antes.")) {
                void run(discardPendingChanges);
              }
            }}>Recuperar histórico da nuvem</Button>
          </div>
        </Panel>
      )}
      {myEmail && household && <FamilyMembers />}
      {message && <p role="status" className="text-sm text-success">{message}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Notice>
        O compartilhamento é separado da previsão de energia. Uma alteração feita na nuvem só é
        confirmada como sincronizada depois que o servidor recebe os dados. Se estiver offline,
        o Voltara continuará salvando localmente, mas não mostrará a alteração no outro aparelho até reconectar.
      </Notice>
    </div>
  );
}
