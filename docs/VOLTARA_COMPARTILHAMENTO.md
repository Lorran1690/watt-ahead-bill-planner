# Compartilhamento do Voltara com 2 pessoas

## Infraestrutura criada
- Supabase: projeto **Voltara**, São Paulo (`sa-east-1`), ID `okbqictunqsiqmoygbjs`.
- Endpoint público: `https://okbqictunqsiqmoygbjs.supabase.co`.
- Migração aplicada: `voltara_shared_household_schema`, a partir de `docs/VOLTARA_SUPABASE_SETUP.sql`.
- A chave **publicável** fica no cliente Web. Nunca adicionar `service_role`, secret key ou senha no GitHub.
- Tabelas: `voltara_households`, `voltara_members`, `voltara_records` com RLS ativado. Convites ficam no schema privado.
- Realtime habilitado para `voltara_records`.

## Configuração de autenticação (necessária uma vez)

No [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/okbqictunqsiqmoygbjs/auth/url-configuration):

- **Site URL**: `https://watt-ahead-bill-planner.lovable.app`
- **Redirect URLs**, adicionar EXATAMENTE:
  `https://watt-ahead-bill-planner.lovable.app/compartilhar`
- Pode manter a URL de prévia `https://id-preview--da09f771-7183-488c-b2d5-3ca493f7c866.lovable.app/compartilhar` para testes.
- O cliente Supabase agora solicita explicitamente o retorno ao site público usando `PUBLIC_SHARING_URL` em `src/lib/voltara/public-url.ts`. **Não usar `window.location.origin`** para e-mails de acesso: esse valor muda quando alguém está no editor ou na prévia do Lovable.
- Depois de alterar a configuração, solicite **um novo e-mail de login**, pois links antigos podem manter o destino anterior.
- O login Supabase por e-mail deve estar habilitado em **Authentication → Providers → Email**. O ambiente pode precisar de SMTP se o volume ultrapassar a cota padrão.
- Estas alterações de código no GitHub **não publicam automaticamente** a última versão. Não acione deploy sem autorização do proprietário.

## Fluxo de uso seguro: marido e esposa

1. Entre em **https://watt-ahead-bill-planner.lovable.app/compartilhar** no endereço público, e não no preview/editor.
2. No dispositivo principal, exporte o backup em **Ajustes** caso os dados ainda estejam salvos em uma prévia do Lovable. Dados locais de origens diferentes não se transferem automaticamente.
3. Solicite um **e-mail de acesso** e confirme-o. Se o botão do e-mail mandar ao Lovable, abra a opção **"O e-mail abriu o Lovable? Confirmar sem redirecionamento"** no site público. Copie o endereço do botão do e-mail **sem clicar nele**, cole no Voltara e confirme dentro do site, sem compartilhar esse endereço com ninguém.
4. Somente depois de autenticado, clique em **Criar uma casa**. O primeiro usuário importa seus dados locais dessa origem para o banco.
5. Clique em **Gerar convite** → **Copiar convite com link direto**. O link será `https://watt-ahead-bill-planner.lovable.app/compartilhar#convite=...` com um código secreto no fragmento (não no query string).
6. Envie o link somente à segunda pessoa. Ela abre o site público, faz login usando **o e-mail próprio**, e confirma a entrada na casa. O convite será recuperado depois da autenticação, mesmo quando o link de login abrir outra aba do mesmo navegador.
7. Verifique em **Compartilhar** se as duas contas pertencem à mesma casa. Gastos individuais, faturas, etc. são sincronizados separadamente.
8. Se a versão pública ainda não mostrar os novos botões, atualize a versão publicada em **Lovable → Publish → Update**, apenas com autorização do proprietário. Um commit GitHub não comprova que o domínio publicado já foi atualizado.

## Configuração dos e-mails no Supabase

Nas configurações de autenticação do projeto Voltara:

- `Site URL`: `https://watt-ahead-bill-planner.lovable.app`
- Redirect URL autorizada: `https://watt-ahead-bill-planner.lovable.app/compartilhar`
- Em **Authentication → Email Templates → Confirm Signup** e **Magic Link**, confira se o botão usa `{{ .ConfirmationURL }}` (ou um fluxo próprio de `token_hash`) e não possui endereço fixo `localhost`, `id-preview--...` ou `lovable.dev/projects/...`. Esta configuração do template só pode ser alterada no painel/admin autorizado.
- O retorno `emailRedirectTo` é enviado pelo frontend usando `PUBLIC_SHARING_URL` e não a URL atual do navegador.
- Se a confirmação antiga já tiver sido clicada, solicite outro e-mail. Não repita envios a cada segundo: o Supabase pode bloquear temporariamente com HTTP 429 (limite de envio).
- Não compartilhe URLs de confirmação nem tokens de sessão com suporte, terceiros ou em screenshots.

## Notas de segurança e recuperação

- Convites expiram em sete dias, só podem ser usados uma vez, e a casa permite no máximo dois membros.
- RLS restringe leitura/escrita aos membros autenticados. As funções `SECURITY DEFINER` para criação/convites/remover membro existem intencionalmente; todas checam `auth.uid()` e vínculos de autorização. Elas geram avisos de lint no Supabase e devem ser reavaliadas ao ampliar funções.
- O Supabase no projeto Hangar One não é utilizado.
- Ao entrar na casa pela primeira vez, o navegador preserva uma cópia local anterior para recuperação; também é recomendado exportar um backup manual.
- Quando não há sessão, o Voltara segue em modo local e NÃO promete enviar registros. A confirmação aparece em **Compartilhar** e na lateral quando sincronizado.
- Offline: alterações permanecem locais, a atualização remota depende de reconexão. Não existe sincronização garantida durante uma falha de rede.
- Conflitos sobre **o mesmo** lançamento editado simultaneamente exigem resolução futura (última gravação pode vencer). Gastos com IDs diferentes são armazenados em linhas independentes.
- A interface e as rotas passam por testes automatizados e build no GitHub; o fluxo completo de dois e-mails reais deve ser testado em dois dispositivos antes da publicação.
