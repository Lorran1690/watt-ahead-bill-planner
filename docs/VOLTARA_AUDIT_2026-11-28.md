# Voltara — auditoria de 28/11/2026
Base main: 80c350366cfde3cffcb6109062192734d17f4153. Correções no PR #4, draft, sem deploy ou alteração de banco.

## Evidências e correções
- CI anterior: qualidade, finanças e segurança Connect aprovadas; auditoria geral falhou no histórico de gastos (locator exato com cômodo aninhado). Separar anotação e cômodo; verificar hidratação e persistência, sem ignorar falhas.
- Connect: cursor composto timestamp + ID evita pular mensagens simultâneas; ordenação cronológica considera offsets e microssegundos; reutiliza mergeTimeline; evita concorrência no carregamento de anteriores e resultados de fotos/consulta após bloqueio; remove polling de digitação redundante; consultas de recibos em lotes de 100.
- Datas: reutilizar validação de gastos no backup e finanças, mantendo restrição de ano 20xx em finanças.
- OCR: normalizar valores em centavos e deduplicar representações do mesmo total.
- Persistência: propagar falha de gravação, aviso global e impedir atualização enquanto gravação estiver falhando. Dados continuam em memória para exportação. Recuperação de backup corrompido permanece ponto separado.
- Testes de regressão e inclusão de Connect/Finanças no teste de rotas.

## Validação pendente
Executar CI do HEAD, auditoria em seis larguras, Android/iOS reais, Connect autenticado (incluindo cursor composto no Supabase real), simular desconexão, concorrência, revogação, troca de conta, cotas e mensagens/mídias. Não equivale a certificação integral de segurança. Não alterar banco de produção sem revisão. Lovable sem créditos, publicação não realizada.

## Upgrades priorizados
P0: ativar push real com VAPID, fila/cron e testes de app fechado; revisar RLS, grants, Storage, Realtime em staging; proteção contra perda de dados e cache de casa compartilhada antes da reautenticação; consistência de operações financeiras multirregistro (compra -> gasto -> categoria), conflitos entre abas e aparelhos; recuperação não destrutiva de backup corrompido.
P1: CI obrigatório e hospedagem independente, versionamento/reversão; otimizar consulta de recibos/presença (somente IDs novos ou não confirmados), lazy loading de 3D/OCR, perfil de consumo de bateria, limites e descarte de mídia; testar navegação e teclado mobile; documentar escopo atual.
P2: histórico cifrado offline e app shell público seguro, sem cache de tokens/HTML privado; transporte híbrido local por Capacitor/Nearby após autorização e projeto de identidade de dispositivos; sem promessa de alcance ou background; auditoria independente de criptografia e recuperação/rotação de chaves.
P3: melhorias de produto: metas financeiras compartilhadas, despesas recorrentes, comparação de preços da lista de compras, lembretes de vencimentos, filtros e relatório mensal, paridade do desktop WPF, acessibilidade e pesquisa global.
