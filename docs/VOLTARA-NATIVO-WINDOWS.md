# Voltara Nativo (Windows)

**Status: primeira versão nativa para testes (0.1), NÃO é a substituição completa da versão web.**

Aplicativo novo em WPF (.NET 8), com interface desenhada pelos componentes Windows.
**Não utiliza WebView2, navegador, HTML, JavaScript, Tauri ou Electron como interface.**

## O que já funciona no código

- Interface nativa com menu lateral e tema escuro/violeta.
- Supabase do projeto Voltara, usando somente a chave PUBLICÁVEL e a sessão do usuário, com RLS.
- Login por link de confirmação enviado por e-mail. Copie a URL do botão ANTES de abri-lo no navegador, cole no campo de acesso e confirme.
- Casa compartilhada: entrar, criar casa e gerar convite privado.
- Listar, incluir e excluir gastos diários, indicando o cômodo quando desejado.
- Contas de água e luz: listar e adicionar por mês. É possível atualizar um mês existente, sem misturar as séries.
- Visão geral e atualização a cada 15 segundos enquanto está aberto.

## Limitações deliberadas desta primeira versão

- A visualização 3D real da casa, os gráficos avançados, a simulação de energia,
  aparelhos, hábitos, exportações e o backup local ainda não estão migrados para WPF.
- A sincronização utiliza consulta periódica a cada 15 segundos, não Supabase Realtime websocket.
- **A sessão fica apenas na memória por segurança**. É necessário solicitar novo link de
  acesso depois de fechar e abrir o programa. O refresh token é mantido apenas em RAM.
- Sem dados locais e sem acesso offline: o conteúdo financeiro é carregado diretamente do banco.
- Não foram realizados testes interativos na máquina Windows do usuário, somente
  compilação self-contained e verificação de cabeçalho PE no GitHub Actions.
- Não existe instalador MSI/MSIX, assinatura Authenticode ou Microsoft Store nesta etapa.

## Como baixar

Abra a execução mais recente da ação:
https://github.com/Lorran1690/watt-ahead-bill-planner/actions/workflows/native-windows.yml

Entre no GitHub e procure o artefato **Voltara-Nativo-Windows-x64** ao final da execução
que aparece como successful. Extraia o ZIP e abra **Voltara.Nativo.exe**.
Suporte: Windows 10/11 64-bit.

## Por que o Windows ainda pode mostrar "Protegido pelo Windows"

O SmartScreen usa assinatura, reputação e origem de distribuição. Um executável
novo e não assinado pode gerar aviso independentemente de ser WPF, WinUI, C++,
Electron ou um aplicativo web.
A solução de distribuição de produção será optar por:
1. Microsoft Store (assinatura da distribuição através da loja); ou
2. Certificado de assinatura de código reconhecido e reputação ao longo do tempo.

Não desative o SmartScreen para solucionar esse problema. O arquivo precisa ser
validado, assinado e distribuído por fonte confiável.

Referência Microsoft: https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation
