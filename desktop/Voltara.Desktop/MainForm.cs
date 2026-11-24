using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Voltara.Desktop;

/// <summary>
/// Aplicativo Windows: abre APENAS o Voltara público em um perfil WebView2 próprio.
/// O perfil fica em %LOCALAPPDATA%\Voltara\WebView2; a sessão não é compartilhada
/// com o Chrome Visitante. URLs de confirmação devem ser abertas dentro desta janela.
/// Não existe token administrativo, telemetria nem servidor local.
/// </summary>
public sealed class MainForm : Form
{
    private static readonly Uri AppHome = new("https://watt-ahead-bill-planner.lovable.app/");
    private static readonly string AppHost = AppHome.Host;
    private const string SupabaseHost = "okbqictunqsiqmoygbjs.supabase.co";
    private const string EdgeRuntimeDownload = "https://developer.microsoft.com/microsoft-edge/webview2/";

    private readonly WebView2 web = new() { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(16, 17, 30) };
    private readonly Label status = new() {
        Text = "Inicializando Voltara...", AutoEllipsis = true,
        ForeColor = Color.FromArgb(190, 183, 214), Dock = DockStyle.Fill,
        TextAlign = ContentAlignment.MiddleLeft, Padding = new Padding(12, 0, 0, 0)
    };
    private readonly Button homeButton;
    private readonly Button refreshButton;
    private readonly Button loginLinkButton;
    private bool initialized;

    public MainForm()
    {
        Text = "Voltara • Controle da Casa";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1120, 780);
        MinimumSize = new Size(540, 480);
        BackColor = Color.FromArgb(16, 17, 30);
        ForeColor = Color.White;
        Font = new Font("Segoe UI", 10F, FontStyle.Regular, GraphicsUnit.Point);
        AutoScaleMode = AutoScaleMode.Dpi;

        var layout = new TableLayoutPanel {
            Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 3,
            Margin = Padding.Empty, Padding = Padding.Empty
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 59));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        Controls.Add(layout);

        var toolbar = new FlowLayoutPanel {
            Dock = DockStyle.Fill, WrapContents = false,
            BackColor = Color.FromArgb(27, 22, 43), FlowDirection = FlowDirection.LeftToRight,
            Padding = new Padding(9, 8, 0, 4), Margin = Padding.Empty,
            AutoScroll = true
        };

        var title = new Label {
            AutoSize = true, Text = "⚡ Voltara", Font = new Font("Segoe UI Semibold", 13F, FontStyle.Bold),
            ForeColor = Color.FromArgb(192, 133, 255), Padding = new Padding(8, 5, 20, 0)
        };
        toolbar.Controls.Add(title);

        homeButton = CreateButton("Início", 75);
        refreshButton = CreateButton("Atualizar", 86);
        loginLinkButton = CreateButton("Colar link do e-mail", 178);
        var browserButton = CreateButton("Abrir no navegador", 175);

        homeButton.Click += (_, _) => { if (initialized) web.CoreWebView2.Navigate(AppHome.ToString()); };
        refreshButton.Click += (_, _) => { if (initialized) web.CoreWebView2.Reload(); };
        loginLinkButton.Click += (_, _) => OpenClipboardLogin();
        browserButton.Click += (_, _) => OpenSystemBrowser(AppHome.ToString());

        toolbar.Controls.AddRange(new Control[] { homeButton, refreshButton, loginLinkButton, browserButton });
        layout.Controls.Add(toolbar, 0, 0);
        layout.Controls.Add(web, 0, 1);
        layout.Controls.Add(status, 0, 2);

        Shown += async (_, _) => await InitializeBrowserAsync();
    }

    private Button CreateButton(string text, int width)
    {
        var button = new Button {
            Text = text, Size = new Size(width, 39),
            Margin = new Padding(3, 0, 3, 0),
            BackColor = Color.FromArgb(57, 43, 82),
            ForeColor = Color.White, FlatStyle = FlatStyle.Flat,
            Cursor = Cursors.Hand, UseVisualStyleBackColor = false
        };
        button.FlatAppearance.BorderColor = Color.FromArgb(100, 67, 150);
        button.FlatAppearance.MouseOverBackColor = Color.FromArgb(100, 65, 155);
        return button;
    }

    private async Task InitializeBrowserAsync()
    {
        try
        {
            // O runtime Evergreen WebView2 costuma vir com Windows/Edge, mas pode estar ausente.
            _ = CoreWebView2Environment.GetAvailableBrowserVersionString();
            var profile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Voltara", "WebView2");
            Directory.CreateDirectory(profile);
            var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: profile);
            if (IsDisposed) return;
            await web.EnsureCoreWebView2Async(environment);
            if (IsDisposed) return;

            initialized = true;
            var core = web.CoreWebView2;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = false;
            core.Settings.AreDevToolsEnabled = false;

            core.NavigationStarting += (_, e) =>
            {
                if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var target))
                {
                    e.Cancel = true;
                    return;
                }
                if (IsAllowedEmbeddedNavigation(target)) return;
                e.Cancel = true;
                if (target.Scheme == Uri.UriSchemeHttps) OpenSystemBrowser(target.ToString());
            };
            core.NewWindowRequested += (_, e) =>
            {
                e.Handled = true;
                if (!Uri.TryCreate(e.Uri, UriKind.Absolute, out var target)) return;
                if (IsAllowedEmbeddedNavigation(target)) core.Navigate(target.ToString());
                else if (target.Scheme == Uri.UriSchemeHttps) OpenSystemBrowser(target.ToString());
            };
            core.NavigationCompleted += (_, e) =>
            {
                status.Text = e.IsSuccess
                    ? "Voltara conectado • login e gastos permanecem neste aplicativo."
                    : "Falha ao abrir a página. Confira sua internet e clique em Atualizar.";
            };
            core.ProcessFailed += (_, _) =>
            {
                status.Text = "O navegador interno parou. Feche e abra o Voltara novamente.";
            };
            core.Navigate(AppHome.ToString());
        }
        catch (Exception ex)
        {
            status.Text = "Não foi possível iniciar o WebView2.";
            var message = "O Voltara para Windows precisa do Microsoft Edge WebView2 Runtime.\n\n"
                + "Ele é gratuito e geralmente já está instalado no Windows 10/11.\n\n"
                + "Deseja abrir a página oficial da Microsoft para instalá-lo?\n\n"
                + "Detalhe: " + ex.GetType().Name;
            if (MessageBox.Show(this, message, "Instalar componente do Windows",
                    MessageBoxButtons.YesNo, MessageBoxIcon.Information) == DialogResult.Yes)
                OpenSystemBrowser(EdgeRuntimeDownload);
        }
    }

    private static bool IsAllowedEmbeddedNavigation(Uri uri)
    {
        if (uri.Scheme != Uri.UriSchemeHttps || !uri.IsDefaultPort) return false;
        if (uri.Host.Equals(AppHost, StringComparison.OrdinalIgnoreCase)) return true;
        // Exceção limitada à verificação de OTP na instância Supabase do próprio Voltara.
        return uri.Host.Equals(SupabaseHost, StringComparison.OrdinalIgnoreCase)
            && uri.AbsolutePath.StartsWith("/auth/v1/verify", StringComparison.OrdinalIgnoreCase);
    }

    private void OpenClipboardLogin()
    {
        if (!initialized)
        {
            MessageBox.Show(this, "Aguarde o Voltara iniciar.", "Voltara",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        string pasted;
        try { pasted = Clipboard.ContainsText() ? Clipboard.GetText().Trim() : ""; }
        catch { pasted = ""; }

        if (!Uri.TryCreate(pasted, UriKind.Absolute, out var url) || !IsAllowedEmbeddedNavigation(url)
            || !IsValidAuthLink(url))
        {
            MessageBox.Show(this,
                "Copie o ENDEREÇO COMPLETO do botão de confirmação no e-mail (clique com o botão direito"
                + " sobre o botão e escolha 'Copiar endereço do link').\n\n"
                + "Depois volte ao Voltara e clique em 'Colar link do e-mail'.\n\n"
                + "Por segurança, o programa aceita apenas links de autenticação do Voltara e do Supabase próprio.",
                "Cole um link de login válido", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        // Segredos de autenticação não são gravados em arquivo, log ou caixa de diálogo.
        web.CoreWebView2.Navigate(url.ToString());
        status.Text = "Confirmando o acesso dentro do Voltara...";
    }

    private static bool IsValidAuthLink(Uri url)
    {
        if (url.Host.Equals(SupabaseHost, StringComparison.OrdinalIgnoreCase))
            return url.AbsolutePath.StartsWith("/auth/v1/verify", StringComparison.OrdinalIgnoreCase)
                   && url.Query.Contains("token", StringComparison.OrdinalIgnoreCase);

        if (!url.Host.Equals(AppHost, StringComparison.OrdinalIgnoreCase))
            return false;

        return url.Fragment.Contains("access_token=", StringComparison.OrdinalIgnoreCase)
               || url.Query.Contains("token_hash=", StringComparison.OrdinalIgnoreCase)
               || url.Query.Contains("code=", StringComparison.OrdinalIgnoreCase);
    }

    private static void OpenSystemBrowser(string url)
    {
        try
        {
            var uri = new Uri(url);
            if (uri.Scheme != Uri.UriSchemeHttps) return;
            Process.Start(new ProcessStartInfo(uri.ToString()) { UseShellExecute = true });
        }
        catch
        {
            // Abrir conteúdo externo é opcional. Não encerrar o app se a associação falhar.
        }
    }
}
