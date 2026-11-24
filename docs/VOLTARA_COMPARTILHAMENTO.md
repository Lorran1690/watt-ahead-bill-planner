# Compartilhamento do Voltara com 2 pessoas

## Infraestrutura criada
- Supabase: projeto **Voltara**, São Paulo (`sa-east-1`), ID `okbqictunqsiqmoygbjs`.
- Endpoint público: `https://okbqictunqsiqmoygbjs.supabase.co`.
- Migração aplicada: `voltara_shared_household_schema`, a partir de `docs/VOLTARA_SUPABASE_SETUP.sql`.
- A chave **publicável** fica no cliente Web. Nunca adicionar `service_role`, secret key ou senha no GitHub.
- Tabelas: `voltara_households`, `voltara_members`, `voltara_records` com RLS ativado. Convites ficam no schema privado.
- Realtime habilitado para `voltara_records`.

## Configuração de autenticação (necessária uma vez)

Na conta proprietária do Supabase, abra o [projeto Voltara](https://supabase.com/dashboard/project/okbqictunqsiqmoygbjs) e depois **Authentication → URL Configuration**.

1. Use como **Site URL**, para os primeiros testes em preview:
   `https://id-preview--da09f771-7183-488c-b2d5-3ca493f7c866.lovable.app`
2. Adicione à lista de **Redirect URLs**:
   `https://id-preview--da09f771-7183-488c-b2d5-3ca493f7c866.lovable.app/compartilhar`
3. Quando houver publicação aprovada, adicione também `https://SEU-DOMINIO-PUBLICADO/compartilhar` e configure a Site URL conforme o domínio definitivo.
4. Confirme que o provedor **Email** esteja habilitado. O link de login é enviado via `signInWithOtp`. O Supabase pode limitar o volume de e-mails até configurar um SMTP próprio.

## Fluxo de uso

1. No dispositivo principal, faça backup em **Ajustes** e abra `/compartilhar`.
2. Digite seu e-mail pessoal e abra o link de confirmação recebido nele.
3. Clique em **Criar uma casa**: isso importa o perfil local deste dispositivo.
4. Clique em **Gerar convite**, copie o código aleatório de uso único e envie em privado para a segunda pessoa.
5. No segundo aparelho, abra o mesmo `/compartilhar`, entre com o e-mail próprio e cole o código.
6. Gastos e faturas podem ser alterados em qualquer dispositivo. Os registros são sincronizados individualmente para reduzir perdas em lançamentos simultâneos.

## Notas de segurança e recuperação

- Convites expiram em sete dias, só podem ser usados uma vez, e a casa permite no máximo dois membros.
- RLS restringe leitura/escrita aos membros autenticados. As funções `SECURITY DEFINER` para criação/convites/remover membro existem intencionalmente; todas checam `auth.uid()` e vínculos de autorização. Elas geram avisos de lint no Supabase e devem ser reavaliadas ao ampliar funções.
- O Supabase no projeto Hangar One não é utilizado.
- Ao entrar na casa pela primeira vez, o navegador preserva uma cópia local anterior para recuperação; também é recomendado exportar um backup manual.
- Quando não há sessão, o Voltara segue em modo local e NÃO promete enviar registros. A confirmação aparece em **Compartilhar** e na lateral quando sincronizado.
- Offline: alterações permanecem locais, a atualização remota depende de reconexão. Não existe sincronização garantida durante uma falha de rede.
- Conflitos sobre **o mesmo** lançamento editado simultaneamente exigem resolução futura (última gravação pode vencer). Gastos com IDs diferentes são armazenados em linhas independentes.
- A interface e as rotas passam por testes automatizados e build no GitHub; o fluxo completo de dois e-mails reais deve ser testado em dois dispositivos antes da publicação.
