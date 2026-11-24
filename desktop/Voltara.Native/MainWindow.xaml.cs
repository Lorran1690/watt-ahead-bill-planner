using System.Collections.ObjectModel;
using System.Globalization;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;

namespace Voltara.Native;

public partial class MainWindow : Window
{
    private readonly VoltaraApi api = new();
    private readonly ObservableCollection<CloudRecord> recent = [], expenses = [], water = [], energy = [];
    private readonly CultureInfo brazil = CultureInfo.GetCultureInfo("pt-BR");
    private readonly DispatcherTimer refreshTimer, tokenTimer;
    private bool busy, refreshing;

    public MainWindow()
    {
        InitializeComponent();
        ExpenseDate.SelectedDate = DateTime.Today;
        WaterMonth.Text = EnergyMonth.Text = DateTime.Today.ToString("yyyy-MM", CultureInfo.InvariantCulture);
        RecentList.ItemsSource = recent;
        ExpenseList.ItemsSource = expenses;
        WaterList.ItemsSource = water;
        EnergyList.ItemsSource = energy;
        refreshTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(15) };
        refreshTimer.Tick += async (_, _) =>
        {
            if (!busy && !refreshing && api.HouseholdId is not null)
                await LoadRecordsAsync(false);
        };
        refreshTimer.Start();
        tokenTimer = new DispatcherTimer { Interval = TimeSpan.FromMinutes(40) };
        tokenTimer.Tick += async (_, _) =>
        {
            if (!api.SignedIn || busy) return;
            try { await api.RefreshAsync(); }
            catch { FooterState.Text = "Sessão expirada. Solicite um novo link em Compartilhar."; }
        };
        tokenTimer.Start();
        ShowPage("dashboard");
        UpdateSession();
    }

    private async Task RunAsync(Func<Task> action, string success = "")
    {
        if (busy) return;
        busy = true;
        try
        {
            FooterState.Text = "Comunicando com o Supabase...";
            await action();
            if (success.Length > 0) FooterState.Text = success;
        }
        catch (Exception error)
        {
            // Não incluir links de autenticação em logs.
            FooterState.Text = "Falha. Confira sua conexão e seu acesso à casa.";
            MessageBox.Show(this, error.Message, "Voltara Nativo", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
        finally { busy = false; UpdateSession(false); }
    }

    private void ShowPage(string page)
    {
        DashboardPage.Visibility = page == "dashboard" ? Visibility.Visible : Visibility.Collapsed;
        ExpensesPage.Visibility = page == "expenses" ? Visibility.Visible : Visibility.Collapsed;
        WaterPage.Visibility = page == "water" ? Visibility.Visible : Visibility.Collapsed;
        EnergyPage.Visibility = page == "energy" ? Visibility.Visible : Visibility.Collapsed;
        HomePage.Visibility = page == "home" ? Visibility.Visible : Visibility.Collapsed;
        FamilyPage.Visibility = page == "family" ? Visibility.Visible : Visibility.Collapsed;
        HeaderState.Text = page switch
        {
            "expenses" => "Gastos diários", "water" => "Água", "energy" => "Energia",
            "home" => "Casa", "family" => "Família", _ => "Visão geral"
        };
    }

    private void Navigate_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button { Tag: string page }) ShowPage(page);
    }

    private void UpdateSession(bool footer = true)
    {
        SidebarSession.Text = api.SignedIn
            ? (api.Email ?? "Conectado") + "\n" + (api.HouseholdId is null ? "Sem casa" : "Casa compartilhada")
            : "Acesse Compartilhar para entrar";
        FamilyState.Text = api.SignedIn
            ? "Conta: " + api.Email + "\n" +
              (api.HouseholdId is null ? "Sem casa. Crie ou use um convite."
                : "Casa conectada • " + (api.Role ?? "membro"))
            : "Ainda não existe uma sessão neste programa.";
        if (footer) FooterState.Text = api.HouseholdId is null
            ? "Voltara Nativo • Faça login para sincronizar"
            : "Voltara Nativo • Sincronização por atualização a cada 15 segundos";
    }

    private async Task LoadRecordsAsync(bool showErrors)
    {
        if (refreshing || api.HouseholdId is null) return;
        refreshing = true;
        try
        {
            var records = await api.RecordsAsync();
            expenses.Clear(); water.Clear(); energy.Clear(); recent.Clear();
            foreach (var record in records)
            {
                switch (record.Kind)
                {
                    case "expense": expenses.Add(record); break;
                    case "water_bill": water.Add(record); break;
                    case "bill": energy.Add(record); break;
                }
            }
            foreach (var record in records.Take(12)) recent.Add(record);
            var thisMonth = DateTime.Today.ToString("yyyy-MM", CultureInfo.InvariantCulture);
            ExpenseTotal.Text = expenses.Where(x => x.Text("date").StartsWith(thisMonth))
                .Sum(x => x.Number("amount")).ToString("C", brazil);
            WaterTotal.Text = (water.OrderByDescending(x => x.Text("month"), StringComparer.Ordinal)
                .FirstOrDefault()?.Number("value") ?? 0m).ToString("C", brazil);
            EnergyTotal.Text = (energy.OrderByDescending(x => x.Text("month"), StringComparer.Ordinal)
                .FirstOrDefault()?.Number("value") ?? 0m).ToString("C", brazil);
            FooterState.Text = "Supabase sincronizado • " + records.Count + " registro(s) • " + DateTime.Now.ToString("HH:mm:ss");
        }
        catch (Exception error)
        {
            FooterState.Text = "Sem conexão. Os valores na tela podem estar desatualizados.";
            if (showErrors) MessageBox.Show(this, error.Message, "Falha de atualização",
                MessageBoxButton.OK, MessageBoxImage.Warning);
        }
        finally { refreshing = false; }
    }

    private async void Refresh_Click(object sender, RoutedEventArgs e)
    {
        if (!api.SignedIn) { ShowPage("family"); return; }
        await RunAsync(async () => { await api.LoadHouseholdAsync(); await LoadRecordsAsync(true); });
    }

    private void RequireHouse()
    {
        if (!api.SignedIn || api.HouseholdId is null)
            throw new InvalidOperationException("Faça login e entre na casa em Compartilhar.");
    }

    private static decimal Money(string raw)
    {
        if (!decimal.TryParse(raw.Trim(), NumberStyles.Number, CultureInfo.GetCultureInfo("pt-BR"), out var sum)
            || sum <= 0 || sum > 1000000 || decimal.Round(sum, 2) != sum)
            throw new InvalidOperationException("Valor inválido. Use, por exemplo, 45,90.");
        return sum;
    }

    private static decimal? OptionalVolume(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        if (!decimal.TryParse(raw, NumberStyles.Number, CultureInfo.GetCultureInfo("pt-BR"), out var value)
            || value <= 0 || value > 1000000)
            throw new InvalidOperationException("Consumo inválido.");
        return value;
    }

    private static string Month(string raw)
    {
        var month = raw.Trim();
        if (!Regex.IsMatch(month, @"^\d{4}-(0[1-9]|1[0-2])$"))
            throw new InvalidOperationException("Informe o mês AAAA-MM, por exemplo, 2026-11.");
        return month;
    }

    private async void AddExpense_Click(object sender, RoutedEventArgs e)
    {
        await RunAsync(async () =>
        {
            RequireHouse();
            var value = Money(ExpenseAmount.Text);
            var date = (ExpenseDate.SelectedDate ?? DateTime.Today).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
            var note = ExpenseNote.Text.Trim();
            var room = (ExpenseRoom.SelectedItem as ComboBoxItem)?.Tag as string;
            var id = Guid.NewGuid().ToString("N");
            var document = new Dictionary<string, object?> {
                ["id"] = id, ["date"] = date, ["note"] = note, ["amount"] = value
            };
            if (!string.IsNullOrWhiteSpace(room)) document["room"] = room;
            await api.SaveRecordAsync("expense", id, document);
            ExpenseAmount.Clear(); ExpenseNote.Clear(); ExpenseRoom.SelectedIndex = 0;
            await LoadRecordsAsync(true);
        }, "Gasto registrado na casa.");
    }

    private async Task SaveBillAsync(string kind, TextBox monthBox, TextBox valueBox, TextBox volumeBox, string volumeKey)
    {
        RequireHouse();
        var month = Month(monthBox.Text);
        var value = Money(valueBox.Text);
        var volume = OptionalVolume(volumeBox.Text);
        var collection = kind == "bill" ? energy : water;
        var existing = collection.FirstOrDefault(r => r.Text("month") == month);
        var id = existing?.Key ?? Guid.NewGuid().ToString("N");
        var document = new Dictionary<string, object?> {
            ["id"] = id, ["month"] = month, ["value"] = value
        };
        if (volume is not null) document[volumeKey] = volume.Value;
        await api.SaveRecordAsync(kind, id, document);
        valueBox.Clear(); volumeBox.Clear();
        await LoadRecordsAsync(true);
    }

    private async void AddWater_Click(object sender, RoutedEventArgs e)
    {
        await RunAsync(() => SaveBillAsync("water_bill", WaterMonth, WaterAmount, WaterVolume, "m3"),
            "Conta de água registrada.");
    }

    private async void AddEnergy_Click(object sender, RoutedEventArgs e)
    {
        await RunAsync(() => SaveBillAsync("bill", EnergyMonth, EnergyAmount, EnergyKwh, "kwh"),
            "Conta de luz registrada.");
    }

    private async void DeleteRecord_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: CloudRecord record }) return;
        if (MessageBox.Show(this,
            "Deseja excluir " + record.Label + "?\nA exclusão também será enviada para sua casa compartilhada.",
            "Excluir registro", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        await RunAsync(async () =>
        {
            RequireHouse();
            await api.DeleteRecordAsync(record.Kind, record.Key);
            await LoadRecordsAsync(true);
        }, "Registro excluído.");
    }

    private async void SendAccess_Click(object sender, RoutedEventArgs e)
    {
        await RunAsync(async () =>
        {
            await api.SendAccessEmailAsync(EmailInput.Text);
            MessageBox.Show(this,
                "Confira seu e-mail. Clique com o botão DIREITO sobre o botão de acesso e escolha "
                + "'Copiar endereço do link'.\n\nVolte ao Voltara Nativo e cole no campo 2, "
                + "sem abrir o link no navegador.",
                "Acesso enviado", MessageBoxButton.OK, MessageBoxImage.Information);
        }, "Link de acesso solicitado.");
    }

    private async void ConfirmLink_Click(object sender, RoutedEventArgs e)
    {
        var link = LoginLinkInput.Text;
        LoginLinkInput.Clear();
        await RunAsync(async () =>
        {
            await api.SignInWithCopiedLinkAsync(link);
            await LoadRecordsAsync(true);
        }, "Sessão autenticada no Voltara Nativo.");
    }

    private async void CreateHouse_Click(object sender, RoutedEventArgs e)
    {
        await RunAsync(async () =>
        {
            if (!api.SignedIn) throw new InvalidOperationException("Entre na sua conta primeiro.");
            if (api.HouseholdId is not null) throw new InvalidOperationException("Você já possui uma casa.");
            await api.CreateHouseholdAsync();
            await LoadRecordsAsync(true);
        }, "Casa criada. Agora você pode convidar outra pessoa.");
    }

    private async void Invite_Click(object sender, RoutedEventArgs e)
    {
        await RunAsync(async () =>
        {
            RequireHouse();
            InviteInput.Text = await api.CreateInviteAsync();
            MessageBox.Show(this, "Código de convite criado. Envie apenas para quem deseja incluir na casa.",
                "Convite privado", MessageBoxButton.OK, MessageBoxImage.Information);
        }, "Convite disponível para copiar.");
    }

    private async void JoinHouse_Click(object sender, RoutedEventArgs e)
    {
        await RunAsync(async () =>
        {
            if (!api.SignedIn) throw new InvalidOperationException("Entre na sua conta primeiro.");
            if (api.HouseholdId is not null) throw new InvalidOperationException("Você já possui uma casa.");
            await api.JoinAsync(InviteInput.Text);
            InviteInput.Clear();
            await LoadRecordsAsync(true);
        }, "Você entrou na casa compartilhada.");
    }

    private void SignOut_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show(this, "Sair da conta neste PC?", "Voltara",
            MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes) return;
        api.SignOut();
        foreach (var records in new[] { recent, expenses, water, energy }) records.Clear();
        ExpenseTotal.Text = WaterTotal.Text = EnergyTotal.Text = "R$ 0,00";
        InviteInput.Clear(); LoginLinkInput.Clear();
        UpdateSession();
    }
}
