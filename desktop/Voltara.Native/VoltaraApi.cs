using System.Globalization;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Voltara.Native;

/// <summary>
/// REST client for the EXISTING Voltara Supabase project, using only the
/// publishable key and authenticated RLS. No browser, secrets or local web server.
/// Native preview: token stays in memory, sign in again after restarting.
/// </summary>
public sealed class VoltaraApi
{
    private const string ApiOrigin = "https://okbqictunqsiqmoygbjs.supabase.co";
    private const string PublishableKey = "sb_publishable_3KLmnwy17viytpY9Ka3xkQ_7KXON0v9";
    private const string PublicOrigin = "https://watt-ahead-bill-planner.lovable.app";
    private static readonly HttpClient Client = new() { Timeout = TimeSpan.FromSeconds(20) };
    private string? accessToken;
    private string? refreshToken;
    public string? Email { get; private set; }
    public string? HouseholdId { get; private set; }
    public string? Role { get; private set; }
    public bool SignedIn => !string.IsNullOrEmpty(accessToken);

    private HttpRequestMessage Request(HttpMethod method, string path, object? payload = null, bool authenticated = true)
    {
        var request = new HttpRequestMessage(method, ApiOrigin + path);
        request.Headers.TryAddWithoutValidation("apikey", PublishableKey);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authenticated && SignedIn ? accessToken : PublishableKey);
        if (payload != null)
            request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        return request;
    }

    private async Task<JsonElement> ExecuteAsync(HttpRequestMessage request, CancellationToken cancel = default)
    {
        using (request)
        using (var response = await Client.SendAsync(request, cancel))
        {
            var raw = await response.Content.ReadAsStringAsync(cancel);
            if (!response.IsSuccessStatusCode)
            {
                string message;
                try
                {
                    using var error = JsonDocument.Parse(raw);
                    var root = error.RootElement;
                    message = root.TryGetProperty("msg", out var msg) ? msg.ToString()
                        : root.TryGetProperty("message", out var m) ? m.ToString()
                        : root.TryGetProperty("error_description", out var desc) ? desc.ToString()
                        : "Falha na comunicação com a nuvem.";
                }
                catch { message = "Falha ao comunicar com o Supabase."; }
                throw new InvalidOperationException(message + " (HTTP " + (int)response.StatusCode + ")");
            }
            if (string.IsNullOrWhiteSpace(raw)) return default;
            using var doc = JsonDocument.Parse(raw);
            return doc.RootElement.Clone();
        }
    }

    public async Task SendAccessEmailAsync(string email)
    {
        email = email.Trim();
        if (email.Length > 250 || !email.Contains('@')) throw new InvalidOperationException("Informe um e-mail válido.");
        using var request = Request(HttpMethod.Post, "/auth/v1/otp?redirect_to=" + Uri.EscapeDataString(PublicOrigin + "/compartilhar"),
            new { email, create_user = true }, authenticated: false);
        await ExecuteAsync(request);
    }

    private static string? GetPart(string input, string key)
    {
        foreach (var part in input.TrimStart('?', '#').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = part.IndexOf('=');
            if (separator < 1) continue;
            if (!part[..separator].Equals(key, StringComparison.OrdinalIgnoreCase)) continue;
            return Uri.UnescapeDataString(part[(separator + 1)..].Replace("+", " "));
        }
        return null;
    }

    public async Task SignInWithCopiedLinkAsync(string pasted)
    {
        pasted = pasted.Trim();
        if (!Uri.TryCreate(pasted, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            throw new InvalidOperationException("Copie o endereço completo do link recebido por e-mail.");

        var isPublic = uri.Host.Equals("watt-ahead-bill-planner.lovable.app", StringComparison.OrdinalIgnoreCase);
        var isAuth = uri.Host.Equals("okbqictunqsiqmoygbjs.supabase.co", StringComparison.OrdinalIgnoreCase)
                     && uri.AbsolutePath.StartsWith("/auth/v1/verify", StringComparison.OrdinalIgnoreCase);
        if (!isPublic && !isAuth) throw new InvalidOperationException("O link não é do projeto Voltara.");

        var fragmentAccess = GetPart(uri.Fragment, "access_token");
        var fragmentRefresh = GetPart(uri.Fragment, "refresh_token");
        if (isPublic && fragmentAccess is not null && fragmentRefresh is not null)
        {
            accessToken = fragmentAccess;
            refreshToken = fragmentRefresh;
            await LoadUserAsync();
            return;
        }

        var token = GetPart(uri.Query, "token_hash") ?? GetPart(uri.Query, "token");
        var kind = GetPart(uri.Query, "type") ?? "magiclink";
        if (token is null || !new[] { "email", "magiclink", "signup", "invite" }.Contains(kind))
            throw new InvalidOperationException("Link inválido. Copie a URL do botão do e-mail antes de abri-lo no navegador.");
        // Exchange hash directly with Supabase Auth. Never follow a verification redirect.
        var result = await ExecuteAsync(Request(HttpMethod.Post, "/auth/v1/verify",
            new { token_hash = token, type = kind }, authenticated: false));
        await SaveSessionAsync(result);
    }

    private async Task SaveSessionAsync(JsonElement response)
    {
        var access = response.TryGetProperty("access_token", out var a) ? a.GetString() : null;
        var refresh = response.TryGetProperty("refresh_token", out var r) ? r.GetString() : null;
        if (string.IsNullOrWhiteSpace(access))
            throw new InvalidOperationException("O servidor não retornou a sessão de acesso.");
        accessToken = access;
        refreshToken = refresh;
        await LoadUserAsync();
    }

    public async Task RefreshAsync()
    {
        if (string.IsNullOrEmpty(refreshToken)) return;
        var body = new { refresh_token = refreshToken };
        var result = await ExecuteAsync(Request(HttpMethod.Post, "/auth/v1/token?grant_type=refresh_token", body, authenticated: false));
        await SaveSessionAsync(result);
    }

    private async Task LoadUserAsync()
    {
        var user = await ExecuteAsync(Request(HttpMethod.Get, "/auth/v1/user"));
        Email = user.TryGetProperty("email", out var mail) ? mail.GetString() : null;
        await LoadHouseholdAsync();
    }

    public async Task LoadHouseholdAsync()
    {
        HouseholdId = null;
        Role = null;
        if (!SignedIn) return;
        var members = await ExecuteAsync(Request(HttpMethod.Get, "/rest/v1/voltara_members?select=household_id,role&limit=1"));
        if (members.ValueKind == JsonValueKind.Array && members.GetArrayLength() > 0)
        {
            var first = members[0];
            HouseholdId = first.GetProperty("household_id").GetString();
            Role = first.GetProperty("role").GetString();
        }
    }

    public async Task CreateHouseholdAsync()
    {
        var output = await ExecuteAsync(Request(HttpMethod.Post, "/rest/v1/rpc/voltara_create_household", new { p_name = "Nossa casa" }));
        HouseholdId = output.GetString();
        Role = "owner";
    }

    public async Task<string> CreateInviteAsync()
    {
        if (HouseholdId == null) throw new InvalidOperationException("Entre em uma casa antes de convidar.");
        var output = await ExecuteAsync(Request(HttpMethod.Post, "/rest/v1/rpc/voltara_issue_invite", new { p_household = HouseholdId }));
        return output.GetString() ?? "";
    }

    public async Task JoinAsync(string code)
    {
        code = code.Trim();
        if (code.Length != 64 || code.Any(c => !Uri.IsHexDigit(c)))
            throw new InvalidOperationException("Código de convite inválido.");
        await ExecuteAsync(Request(HttpMethod.Post, "/rest/v1/rpc/voltara_join_household", new { p_code = code }));
        await LoadHouseholdAsync();
    }

    public async Task<List<CloudRecord>> RecordsAsync()
    {
        if (!SignedIn || HouseholdId == null) return [];
        var query = "/rest/v1/voltara_records?select=kind,record_key,document"
            + "&household_id=eq." + Uri.EscapeDataString(HouseholdId)
            + "&kind=in.(expense,bill,water_bill)&order=updated_at.desc&limit=1000";
        var output = await ExecuteAsync(Request(HttpMethod.Get, query));
        var result = new List<CloudRecord>();
        if (output.ValueKind != JsonValueKind.Array) return result;
        foreach (var item in output.EnumerateArray())
        {
            result.Add(new CloudRecord(
                item.GetProperty("kind").GetString() ?? "",
                item.GetProperty("record_key").GetString() ?? "",
                item.GetProperty("document").Clone()));
        }
        return result;
    }

    public async Task SaveRecordAsync(string kind, string id, object document)
    {
        if (HouseholdId == null) throw new InvalidOperationException("Você ainda não entrou em uma casa compartilhada.");
        if (kind is not ("expense" or "bill" or "water_bill"))
            throw new InvalidOperationException("Tipo de lançamento inválido.");

        var payload = new[] { new {
            household_id = HouseholdId,
            kind,
            record_key = id,
            document
        } };
        using var request = Request(HttpMethod.Post,
            "/rest/v1/voltara_records?on_conflict=household_id,kind,record_key", payload);
        request.Headers.TryAddWithoutValidation("Prefer", "resolution=merge-duplicates,return=minimal");
        await ExecuteAsync(request);
    }

    public async Task DeleteRecordAsync(string kind, string id)
    {
        if (HouseholdId == null) throw new InvalidOperationException("Não há uma casa conectada.");
        using var request = Request(HttpMethod.Delete,
            "/rest/v1/voltara_records?household_id=eq." + Uri.EscapeDataString(HouseholdId)
            + "&kind=eq." + Uri.EscapeDataString(kind)
            + "&record_key=eq." + Uri.EscapeDataString(id));
        await ExecuteAsync(request);
    }

    public void SignOut()
    {
        accessToken = null;
        refreshToken = null;
        Email = null;
        HouseholdId = null;
        Role = null;
    }
}

public record CloudRecord(string Kind, string Key, JsonElement Document)
{
    public string Text(string property)
    {
        if (!Document.TryGetProperty(property, out var field)) return "";
        return field.ValueKind == JsonValueKind.String ? field.GetString() ?? "" : field.ToString();
    }
    public decimal Number(string property) =>
        decimal.TryParse(Text(property), NumberStyles.Number, CultureInfo.InvariantCulture, out var number) ? number : 0m;

    public string KindName => Kind == "water_bill" ? "Água" : Kind == "bill" ? "Luz" : Kind == "expense" ? "Gasto" : Kind;
    public string AmountFormatted => Number("amount") != 0 ? Number("amount").ToString("C", new CultureInfo("pt-BR"))
        : Number("value").ToString("C", new CultureInfo("pt-BR"));
    public string Label => Kind == "expense" ? Text("note") : KindName + " • " + Text("month");
    public string Detail => (Kind == "expense" ? Text("date") : Text("month")) +
        (Kind == "expense" && Text("room") != "" ? " · " + Text("room") : "");
}
