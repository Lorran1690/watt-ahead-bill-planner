# Prioridade P0 — notificações em segundo plano
Estado: código em desenvolvimento; função, tabelas e credenciais ainda não ativadas em produção.

## Comportamento esperado
- Mensagem cifrada armazenada e confirmada pelo servidor; entrega push independente da visualização da conversa pelo destinatário.
- O sistema operacional pode exibir uma notificação quando a aba/app está minimizado ou fechado, se o navegador/sistema tiver suporte e autorização.
- Payload genérico, sem texto, foto, áudio, nome ou valor financeiro. Clique abre /connect; usuário desbloqueia a conversa.
- Ativação por aparelho. O cliente consulta a chave pública no servidor e verifica a inscrição com o vínculo atual; não requer VITE_VOLTARA_VAPID_PUBLIC_KEY no Lovable.
- TTL de até 24 horas, sujeito ao serviço de push. Não prometer entrega quando o navegador foi encerrado à força, a permissão revogada ou o sistema bloqueia execução em segundo plano.
- iOS/iPadOS: instalar na tela inicial em sistema compatível; Android: conceder permissões e conferir restrições de bateria; Windows: testar PWA e o executável separadamente.

## Ativação segura
1. Gerar chaves VAPID P-256 localmente com scripts/generate-connect-vapid.mjs. Nunca enviar chave privada ao GitHub, chat ou frontend.
2. Em Supabase > Edge Functions > Secrets, configurar VOLTARA_VAPID_PUBLIC_KEY, VOLTARA_VAPID_PRIVATE_KEY e VOLTARA_VAPID_SUBJECT (contato real autorizado). A ferramenta de publicação disponível não administra esses segredos.
3. Aplicar a migração de inscrição e entrega em ambiente de teste, publicar a função voltara-connect-push com verificação de JWT, confirmar proteção por RLS e autorização por conta/par. Testar inscrição, status e cancelamento. Nenhuma alteração no banco financeiro.
4. Tornar despacho resiliente: evento após INSERT no banco, fila persistente e reenvio com limite/backoff por dispositivo. A tentativa atual parte do remetente após confirmação e é best effort; um erro ou fechamento abrupto pode impedir o aviso. Não classificar como produção confiável antes da implementação e verificação desse fluxo. Não enviar texto da mensagem no webhook.
5. Testar com os dois aparelhos reais e o destinatário: conversa aberta, outra aba, minimizado, tela bloqueada, app fechado, reconexão, opt-out e troca de conta. Verificar que conta externa não recebe aviso e que duplicatas não geram alertas adicionais.
6. Publicar somente após passar os testes e autorização. Não remover a criptografia para exibir prévias.

Critérios: alertas sem conteúdo, inscrição real por aparelho, clique para conversa, mensagem salva independentemente da notificação, falhas rastreáveis/repetíveis e nenhum envio para membro revogado.
