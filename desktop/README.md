# Voltara Desktop para Windows (.exe)

Versão Windows independente da instalação PWA/Chrome, feita em .NET 8 WinForms e Microsoft WebView2.

- Executável: \`Voltara.exe\` (Windows 10/11 64-bit).
- Site carregado: \`https://watt-ahead-bill-planner.lovable.app/\` (HTTPS).
- Perfil próprio: \`%LOCALAPPDATA%\Voltara\WebView2\`.
- NÃO usa Chrome Visitante, NEM instala extensão, NEM coleta dados, NEM contém senhas/chaves secretas.
- A UI e o serviço permanecem hospedados no Voltara. É necessário acesso à internet.
- O login é via Supabase do próprio site, mas os links clicados no e-mail abrem no navegador externo.
  Para concluir o login **dentro do .exe**, clique com o botão direito no botão do e-mail recebido,
  escolha **Copiar endereço do link** e depois **Colar link do e-mail** no topo do Voltara.
  Links de autenticação são validados para evitar URLs de terceiros.
- O aplicativo Windows tem armazenamento e sessão separados do Chrome e da PWA. A conta compartilhada no Supabase
  é a forma de acessar os mesmos dados nos demais dispositivos.
- Este executável não é assinado digitalmente: Windows SmartScreen/antivírus pode solicitar cautela.
  Verifique se o download veio do repositório oficial antes de executá-lo.
- WebView2 Runtime é gratuito. A maioria dos Windows 10/11 com Edge já tem o componente.
  Caso esteja ausente, o programa oferece o endereço de instalação oficial da Microsoft.
- O código do .exe está em \`desktop/Voltara.Desktop\`; não inclui nem altera o banco de dados.

## Como gerar o executável

A action **Voltara Windows .exe** compila em \`windows-latest\` sem executar o programa:
1. Gera \`voltara.ico\` a partir da logo do projeto.
2. Executa \`dotnet publish -r win-x64 -c Release\` em modo single-file + self-contained.
3. Confere que o PE \`Voltara.exe\` foi criado.
4. Publica um artefato **Voltara-Windows-x64** na execução do GitHub Actions.

O arquivo pode ser baixado no artefato da ação, que é um ZIP com \`Voltara.exe\`.
Extraia o ZIP antes de abrir o executável. O GitHub pode pedir que você esteja logado para baixar artefatos.

Este build NÃO publica o site e NÃO edita o Supabase. Nunca baixar EXE por endereços não verificados.

## Compilar no próprio Windows (opcional)

Instale o .NET 8 SDK, abra PowerShell na raiz do projeto e execute:

\`\`\`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/Voltara.Desktop/create-icon.ps1
dotnet publish desktop/Voltara.Desktop/Voltara.Desktop.csproj -c Release -r win-x64 -o dist/Voltara-Windows
\`\`\`

O executável fica em \`dist/Voltara-Windows/Voltara.exe\`.
