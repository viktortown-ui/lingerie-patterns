using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("ЛЕКАЛО — Pattern Studio")]
[assembly: AssemblyDescription("Бесплатное локальное приложение для построения выкроек")]
[assembly: AssemblyProduct("ЛЕКАЛО — Pattern Studio")]
[assembly: AssemblyCompany("LEKALO Open Source")]
[assembly: AssemblyCopyright("Copyright © 2026 LEKALO contributors")]
[assembly: AssemblyVersion("1.3.1.0")]
[assembly: AssemblyFileVersion("1.3.1.0")]
[assembly: AssemblyInformationalVersion("1.3.1")]

namespace Lekalo.PatternStudio.Desktop
{
    internal static class Program
    {
        internal const string WindowTitle = "ЛЕКАЛО — Pattern Studio";
        private const string MutexName = @"Local\Lekalo.PatternStudio.Desktop.1";

        [STAThread]
        private static int Main(string[] args)
        {
            DesktopOptions options;
            try
            {
                options = DesktopOptions.Parse(args);
            }
            catch (Exception exception)
            {
                MessageBox.Show(
                    "Не удалось прочитать параметры запуска.\r\n\r\n" + exception.Message,
                    WindowTitle,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return 64;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            DesktopActivation.SetApplicationIdentity();

            if (options.IsSmokeTest)
            {
                return RunApplication(options);
            }

            bool createdNew;
            Mutex instanceMutex = null;
            try
            {
                instanceMutex = new Mutex(true, MutexName, out createdNew);
            }
            catch (Exception exception)
            {
                DesktopDiagnostics.Write("Не удалось создать mutex единственного экземпляра.", exception);
                createdNew = true;
            }

            if (!createdNew)
            {
                DesktopActivation.RequestActivation();
                if (instanceMutex != null)
                {
                    instanceMutex.Dispose();
                }
                return 0;
            }

            try
            {
                return RunApplication(options);
            }
            finally
            {
                if (instanceMutex != null)
                {
                    try
                    {
                        instanceMutex.ReleaseMutex();
                    }
                    catch (ApplicationException)
                    {
                        // The mutex was not acquired. Closing its handle is enough.
                    }
                    instanceMutex.Dispose();
                }
            }
        }

        private static int RunApplication(DesktopOptions options)
        {
            MainWindow window = null;
            Application.ThreadException += delegate(object sender, ThreadExceptionEventArgs eventArgs)
            {
                DesktopDiagnostics.Write("Необработанная ошибка интерфейса.", eventArgs.Exception);
                if (window != null)
                {
                    window.HandleFatalException(eventArgs.Exception);
                }
            };

            try
            {
                window = new MainWindow(options);
                Application.Run(window);
                return window.ProcessExitCode;
            }
            catch (Exception exception)
            {
                DesktopDiagnostics.Write("Не удалось запустить приложение.", exception);
                if (options.IsSmokeTest)
                {
                    SmokeReport.WriteFailure(options.SmokeReportPath, "desktop_start_failed", exception.Message, null);
                }
                else
                {
                    MessageBox.Show(
                        "ЛЕКАЛО не удалось запустить.\r\n\r\n" +
                        "Подробности сохранены в журнале:\r\n" + DesktopDiagnostics.LogPath +
                        "\r\n\r\n" + exception.Message,
                        WindowTitle,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
                return 2;
            }
            finally
            {
                if (window != null)
                {
                    window.Dispose();
                }
            }
        }
    }

    internal sealed class DesktopOptions
    {
        internal string SmokeReportPath { get; private set; }
        internal string UserDataFolderOverride { get; private set; }
        internal bool IsSmokeTest { get { return !String.IsNullOrWhiteSpace(SmokeReportPath); } }

        private DesktopOptions()
        {
        }

        internal static DesktopOptions Parse(string[] args)
        {
            DesktopOptions options = new DesktopOptions();
            for (int index = 0; index < args.Length; index++)
            {
                string argument = args[index] ?? String.Empty;
                if (argument.StartsWith("--smoke-test=", StringComparison.OrdinalIgnoreCase))
                {
                    options.SmokeReportPath = ReadValue(argument, "--smoke-test=");
                }
                else if (String.Equals(argument, "--smoke-test", StringComparison.OrdinalIgnoreCase) && index + 1 < args.Length)
                {
                    options.SmokeReportPath = args[++index];
                }
                else if (argument.StartsWith("--qa-user-data=", StringComparison.OrdinalIgnoreCase))
                {
                    options.UserDataFolderOverride = ReadValue(argument, "--qa-user-data=");
                }
                else if (String.Equals(argument, "--qa-user-data", StringComparison.OrdinalIgnoreCase) && index + 1 < args.Length)
                {
                    options.UserDataFolderOverride = args[++index];
                }
            }

            if (!String.IsNullOrWhiteSpace(options.SmokeReportPath))
            {
                options.SmokeReportPath = Path.GetFullPath(
                    Environment.ExpandEnvironmentVariables(options.SmokeReportPath.Trim().Trim('"')));
            }

            if (!String.IsNullOrWhiteSpace(options.UserDataFolderOverride))
            {
                options.UserDataFolderOverride = Path.GetFullPath(
                    Environment.ExpandEnvironmentVariables(options.UserDataFolderOverride.Trim().Trim('"')));
            }

            return options;
        }

        private static string ReadValue(string argument, string prefix)
        {
            string value = argument.Substring(prefix.Length).Trim().Trim('"');
            if (value.Length == 0)
            {
                throw new ArgumentException("После " + prefix.TrimEnd('=') + " должен быть указан путь.");
            }
            return value;
        }
    }

    internal sealed class MainWindow : Form
    {
        private const string AppHost = "lekalo-app.example";
        private const string AppOrigin = "https://" + AppHost;
        private const string StartAddress = AppOrigin + "/index.html";
        private const int SmokeTimeoutMilliseconds = 45000;

        private readonly DesktopOptions _options;
        private readonly WebView2 _webView;
        private readonly System.Windows.Forms.Timer _smokeTimeoutTimer;
        private readonly HashSet<ulong> _blockedNavigationIds;
        private DateTime _smokeStartedUtc;
        private bool _smokeProbeStarted;
        private bool _smokeCompleted;
        private bool _fatalErrorHandled;
        private bool _isFullScreen;
        private bool _fullScreenRequestedByWebContent;
        private Rectangle _restoreBounds;
        private FormBorderStyle _restoreBorderStyle;
        private FormWindowState _restoreWindowState;
        private bool _restoreTopMost;

        internal int ProcessExitCode { get; private set; }

        internal MainWindow(DesktopOptions options)
        {
            _options = options;
            _blockedNavigationIds = new HashSet<ulong>();
            ProcessExitCode = 0;
            Text = Program.WindowTitle;
            Name = "LekaloPatternStudioMainWindow";
            StartPosition = FormStartPosition.CenterScreen;
            Rectangle workingArea = Screen.PrimaryScreen == null
                ? new Rectangle(0, 0, 1440, 900)
                : Screen.PrimaryScreen.WorkingArea;
            ClientSize = new Size(
                Math.Max(520, Math.Min(1440, workingArea.Width - 80)),
                Math.Max(480, Math.Min(900, workingArea.Height - 80)));
            MinimumSize = new Size(520, 480);
            AutoScaleMode = AutoScaleMode.Dpi;
            KeyPreview = true;

            string iconPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app", "assets", "icons", "app-icon.ico");
            if (File.Exists(iconPath))
            {
                try
                {
                    Icon = new Icon(iconPath);
                }
                catch (Exception exception)
                {
                    DesktopDiagnostics.Write("Не удалось загрузить значок окна.", exception);
                }
            }

            _webView = new WebView2();
            _webView.Name = "LekaloWebView";
            _webView.Dock = DockStyle.Fill;
            _webView.DefaultBackgroundColor = Color.FromArgb(247, 241, 235);
            Controls.Add(_webView);

            _smokeTimeoutTimer = new System.Windows.Forms.Timer();
            _smokeTimeoutTimer.Interval = SmokeTimeoutMilliseconds;
            _smokeTimeoutTimer.Tick += OnSmokeTimeout;

            Shown += OnShown;
            KeyDown += OnWindowKeyDown;
            FormClosed += OnFormClosed;

            if (_options.IsSmokeTest)
            {
                ShowInTaskbar = false;
                FormBorderStyle = FormBorderStyle.FixedToolWindow;
                StartPosition = FormStartPosition.Manual;
                Location = new Point(-30000, -30000);
                ClientSize = new Size(1280, 800);
            }
        }

        protected override void WndProc(ref Message message)
        {
            if ((uint)message.Msg == DesktopActivation.ActivationMessage)
            {
                ActivateFromSecondInstance();
                return;
            }
            base.WndProc(ref message);
        }

        private async void OnShown(object sender, EventArgs eventArgs)
        {
            Shown -= OnShown;
            _smokeStartedUtc = DateTime.UtcNow;
            if (_options.IsSmokeTest)
            {
                _smokeTimeoutTimer.Start();
            }

            string appFolder = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "app");
            string indexPath = Path.Combine(appFolder, "index.html");
            if (!File.Exists(indexPath))
            {
                HandleStartupFailure(
                    "Не найдены файлы приложения. Рядом с LEKALO.exe должна находиться папка app.",
                    new FileNotFoundException("Не найден файл index.html.", indexPath),
                    "app_files_missing");
                return;
            }

            try
            {
                string userDataFolder = ResolveUserDataFolder();
                Directory.CreateDirectory(userDataFolder);

                CoreWebView2Environment environment = await CoreWebView2Environment.CreateAsync(
                    null,
                    userDataFolder,
                    new CoreWebView2EnvironmentOptions());
                await _webView.EnsureCoreWebView2Async(environment);

                ConfigureWebView(appFolder);
                _webView.CoreWebView2.Navigate(StartAddress);
            }
            catch (WebView2RuntimeNotFoundException exception)
            {
                HandleMissingRuntime(exception);
            }
            catch (Exception exception)
            {
                HandleStartupFailure(
                    "Не удалось открыть рабочее окно ЛЕКАЛО.",
                    exception,
                    "webview_initialization_failed");
            }
        }

        private string ResolveUserDataFolder()
        {
            if (!String.IsNullOrWhiteSpace(_options.UserDataFolderOverride))
            {
                return _options.UserDataFolderOverride;
            }

            string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            return Path.Combine(localData, "Lekalo", "WebView2");
        }

        private void ConfigureWebView(string appFolder)
        {
            CoreWebView2 core = _webView.CoreWebView2;
            core.SetVirtualHostNameToFolderMapping(
                AppHost,
                appFolder,
                CoreWebView2HostResourceAccessKind.DenyCors);

            core.Settings.IsScriptEnabled = true;
            core.Settings.AreDefaultScriptDialogsEnabled = true;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.AreHostObjectsAllowed = false;
            core.Settings.IsWebMessageEnabled = false;
            core.Settings.IsStatusBarEnabled = false;

            core.NavigationStarting += OnNavigationStarting;
            core.NavigationCompleted += OnNavigationCompleted;
            core.NewWindowRequested += OnNewWindowRequested;
            core.PermissionRequested += OnPermissionRequested;
            core.DownloadStarting += OnDownloadStarting;
            core.ProcessFailed += OnWebViewProcessFailed;
            core.ContainsFullScreenElementChanged += OnContainsFullScreenElementChanged;

            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);
            core.WebResourceRequested += OnWebResourceRequested;
        }

        private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs eventArgs)
        {
            if (IsAllowedNavigation(eventArgs.Uri))
            {
                return;
            }

            eventArgs.Cancel = true;
            _blockedNavigationIds.Add(eventArgs.NavigationId);
            if (eventArgs.IsUserInitiated)
            {
                OpenExternalHttps(eventArgs.Uri);
            }
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs eventArgs)
        {
            eventArgs.Handled = true;
            if (IsAppPage(eventArgs.Uri))
            {
                _webView.CoreWebView2.Navigate(eventArgs.Uri);
                return;
            }
            if (eventArgs.IsUserInitiated)
            {
                OpenExternalHttps(eventArgs.Uri);
            }
        }

        private void OnPermissionRequested(object sender, CoreWebView2PermissionRequestedEventArgs eventArgs)
        {
            eventArgs.State = CoreWebView2PermissionState.Deny;
        }

        private void OnWebResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs eventArgs)
        {
            if (IsAllowedAppResource(eventArgs.Request.Uri))
            {
                return;
            }

            eventArgs.Response = _webView.CoreWebView2.Environment.CreateWebResourceResponse(
                null,
                403,
                "Blocked by LEKALO desktop security policy",
                "Content-Type: text/plain\r\nCache-Control: no-store");
        }

        private async void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs eventArgs)
        {
            if (_blockedNavigationIds.Remove(eventArgs.NavigationId))
            {
                return;
            }

            if (!eventArgs.IsSuccess)
            {
                string details = "WebView2: " + eventArgs.WebErrorStatus;
                HandleStartupFailure(
                    "Файлы приложения не удалось загрузить.",
                    new InvalidOperationException(details),
                    "app_navigation_failed");
                return;
            }

            if (_options.IsSmokeTest && !_smokeProbeStarted)
            {
                _smokeProbeStarted = true;
                await RunSmokeProbeAsync();
            }
        }

        private async Task RunSmokeProbeAsync()
        {
            IDictionary<string, object> lastProbe = null;
            Exception lastException = null;

            for (int attempt = 0; attempt < 120 && !_smokeCompleted && !IsDisposed; attempt++)
            {
                try
                {
                    string rawResult = await _webView.CoreWebView2.ExecuteScriptAsync(
                        "(function () {" +
                        "var app=document.getElementById('app');" +
                        "return {" +
                        "title:document.title||''," +
                        "readyState:document.readyState||''," +
                        "origin:location.origin||''," +
                        "appChildren:app?app.children.length:0," +
                        "modelCards:document.querySelectorAll('.model-card').length," +
                        "presetCards:document.querySelectorAll('.preset-card').length," +
                        "helpButtons:document.querySelectorAll('[data-help-topic]').length," +
                        "helpDialogOpen:(function(){var dialog=document.querySelector('.help-dialog');var button=document.querySelector('[data-help-topic]');if(dialog&&!dialog.open&&button){button.click();}return !!(dialog&&dialog.open);})()," +
                        "helpTopicButtons:document.querySelectorAll('.help-topic-button').length," +
                        "helpVisibleTextLength:(function(){var dialog=document.querySelector('.help-dialog');return dialog?(dialog.innerText||'').trim().length:0;})()," +
                        "visibleTextLength:document.body?(document.body.innerText||'').trim().length:0" +
                        "};" +
                        "})()");

                    lastProbe = DeserializeScriptObject(rawResult);
                    string title = GetString(lastProbe, "title");
                    string readyState = GetString(lastProbe, "readyState");
                    string origin = GetString(lastProbe, "origin");
                    int appChildren = GetInteger(lastProbe, "appChildren");
                    int modelCards = GetInteger(lastProbe, "modelCards");
                    int presetCards = GetInteger(lastProbe, "presetCards");
                    int helpButtons = GetInteger(lastProbe, "helpButtons");
                    bool helpDialogOpen = GetBoolean(lastProbe, "helpDialogOpen");
                    int helpTopicButtons = GetInteger(lastProbe, "helpTopicButtons");
                    int helpVisibleTextLength = GetInteger(lastProbe, "helpVisibleTextLength");
                    int visibleTextLength = GetInteger(lastProbe, "visibleTextLength");

                    bool ready = String.Equals(readyState, "complete", StringComparison.OrdinalIgnoreCase) ||
                                 String.Equals(readyState, "interactive", StringComparison.OrdinalIgnoreCase);
                    bool success = ready &&
                                   String.Equals(origin, AppOrigin, StringComparison.OrdinalIgnoreCase) &&
                                   title.IndexOf("ЛЕКАЛО", StringComparison.OrdinalIgnoreCase) >= 0 &&
                                   appChildren > 0 &&
                                   modelCards >= 4 &&
                                   presetCards >= 5 &&
                                   helpButtons >= 1 &&
                                   helpDialogOpen &&
                                   helpTopicButtons >= 9 &&
                                   helpVisibleTextLength > 100 &&
                                   visibleTextLength > 200;

                    if (success)
                    {
                        Dictionary<string, object> details = new Dictionary<string, object>(lastProbe);
                        details["webView2Runtime"] = _webView.CoreWebView2.Environment.BrowserVersionString;
                        details["elapsedMilliseconds"] = (int)(DateTime.UtcNow - _smokeStartedUtc).TotalMilliseconds;
                        CompleteSmoke(true, "ok", "Интерфейс ЛЕКАЛО загрузился и прошёл проверку.", details);
                        return;
                    }
                }
                catch (Exception exception)
                {
                    lastException = exception;
                }

                await Task.Delay(250);
            }

            string failureMessage = lastException == null
                ? "Интерфейс не достиг ожидаемого состояния за отведённое время."
                : "Проверка интерфейса завершилась ошибкой: " + lastException.Message;
            CompleteSmoke(false, "ui_not_ready", failureMessage, lastProbe);
        }

        private static IDictionary<string, object> DeserializeScriptObject(string rawResult)
        {
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            object value = serializer.DeserializeObject(rawResult);
            string nested = value as string;
            if (nested != null)
            {
                value = serializer.DeserializeObject(nested);
            }

            IDictionary<string, object> dictionary = value as IDictionary<string, object>;
            if (dictionary == null)
            {
                throw new InvalidDataException("WebView2 вернул неожиданный результат проверки.");
            }
            return dictionary;
        }

        private static string GetString(IDictionary<string, object> dictionary, string key)
        {
            object value;
            return dictionary != null && dictionary.TryGetValue(key, out value) && value != null
                ? Convert.ToString(value, CultureInfo.InvariantCulture)
                : String.Empty;
        }

        private static int GetInteger(IDictionary<string, object> dictionary, string key)
        {
            object value;
            if (dictionary == null || !dictionary.TryGetValue(key, out value) || value == null)
            {
                return 0;
            }
            return Convert.ToInt32(value, CultureInfo.InvariantCulture);
        }

        private static bool GetBoolean(IDictionary<string, object> dictionary, string key)
        {
            object value;
            if (dictionary == null || !dictionary.TryGetValue(key, out value) || value == null)
            {
                return false;
            }
            return Convert.ToBoolean(value, CultureInfo.InvariantCulture);
        }

        private void OnDownloadStarting(object sender, CoreWebView2DownloadStartingEventArgs eventArgs)
        {
            CoreWebView2Deferral deferral = eventArgs.GetDeferral();
            try
            {
                eventArgs.Handled = true;
                string suggestedName = SafeFileName(eventArgs.ResultFilePath);

                using (SaveFileDialog dialog = new SaveFileDialog())
                {
                    dialog.Title = "Сохранить файл из ЛЕКАЛО";
                    dialog.FileName = suggestedName;
                    dialog.Filter = BuildDownloadFilter(suggestedName);
                    dialog.FilterIndex = 1;
                    dialog.AddExtension = true;
                    dialog.CheckPathExists = true;
                    dialog.OverwritePrompt = true;
                    dialog.RestoreDirectory = true;
                    dialog.InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);

                    if (dialog.ShowDialog(this) == DialogResult.OK)
                    {
                        eventArgs.ResultFilePath = dialog.FileName;
                    }
                    else
                    {
                        eventArgs.Cancel = true;
                    }
                }
            }
            catch (Exception exception)
            {
                eventArgs.Cancel = true;
                DesktopDiagnostics.Write("Не удалось выбрать путь для сохранения файла.", exception);
                if (!_options.IsSmokeTest)
                {
                    MessageBox.Show(
                        this,
                        "Не удалось сохранить файл. Выберите другую папку и повторите попытку.\r\n\r\n" + exception.Message,
                        Program.WindowTitle,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                }
            }
            finally
            {
                deferral.Complete();
            }
        }

        private static string SafeFileName(string resultFilePath)
        {
            string fileName = String.Empty;
            try
            {
                fileName = Path.GetFileName(resultFilePath);
            }
            catch (ArgumentException)
            {
                fileName = String.Empty;
            }

            if (String.IsNullOrWhiteSpace(fileName))
            {
                return "lekalo-export.pdf";
            }

            foreach (char invalidCharacter in Path.GetInvalidFileNameChars())
            {
                fileName = fileName.Replace(invalidCharacter, '_');
            }
            return fileName;
        }

        private static string BuildDownloadFilter(string fileName)
        {
            string extension = Path.GetExtension(fileName).ToLowerInvariant();
            if (extension == ".pdf") return "PDF (*.pdf)|*.pdf|Все файлы (*.*)|*.*";
            if (extension == ".svg") return "SVG (*.svg)|*.svg|Все файлы (*.*)|*.*";
            if (extension == ".dxf") return "DXF (*.dxf)|*.dxf|Все файлы (*.*)|*.*";
            if (extension == ".zip") return "ZIP (*.zip)|*.zip|Все файлы (*.*)|*.*";
            if (extension == ".json") return "JSON (*.json)|*.json|Все файлы (*.*)|*.*";
            return "Все файлы (*.*)|*.*";
        }

        private void OnWebViewProcessFailed(object sender, CoreWebView2ProcessFailedEventArgs eventArgs)
        {
            InvalidOperationException exception = new InvalidOperationException(
                "Процесс WebView2 завершился: " + eventArgs.ProcessFailedKind + ".");
            DesktopDiagnostics.Write("Сбой процесса WebView2.", exception);

            if (_options.IsSmokeTest)
            {
                CompleteSmoke(false, "webview_process_failed", exception.Message, null);
                return;
            }

            if (_fatalErrorHandled)
            {
                return;
            }
            _fatalErrorHandled = true;
            if (!IsDisposed && IsHandleCreated)
            {
                BeginInvoke((MethodInvoker)delegate
                {
                    MessageBox.Show(
                        this,
                        "Компонент отображения неожиданно завершил работу.\r\n\r\n" +
                        "Запустите ЛЕКАЛО снова. Если ошибка повторится, приложите журнал:\r\n" +
                        DesktopDiagnostics.LogPath,
                        Program.WindowTitle,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error);
                    ProcessExitCode = 2;
                    Close();
                });
            }
        }

        private void OnContainsFullScreenElementChanged(object sender, object eventArgs)
        {
            _fullScreenRequestedByWebContent = _webView.CoreWebView2.ContainsFullScreenElement;
            SetFullScreen(_fullScreenRequestedByWebContent);
        }

        private void OnWindowKeyDown(object sender, KeyEventArgs eventArgs)
        {
            if (eventArgs.KeyCode == Keys.F11)
            {
                SetFullScreen(!_isFullScreen);
                eventArgs.Handled = true;
                eventArgs.SuppressKeyPress = true;
            }
            else if (eventArgs.KeyCode == Keys.Escape && _isFullScreen && !_fullScreenRequestedByWebContent)
            {
                SetFullScreen(false);
                eventArgs.Handled = true;
                eventArgs.SuppressKeyPress = true;
            }
        }

        private void SetFullScreen(bool enabled)
        {
            if (_isFullScreen == enabled)
            {
                return;
            }

            if (enabled)
            {
                _restoreBounds = Bounds;
                _restoreBorderStyle = FormBorderStyle;
                _restoreWindowState = WindowState;
                _restoreTopMost = TopMost;

                SuspendLayout();
                WindowState = FormWindowState.Normal;
                FormBorderStyle = FormBorderStyle.None;
                TopMost = false;
                Bounds = Screen.FromControl(this).Bounds;
                ResumeLayout(true);
                _isFullScreen = true;
            }
            else
            {
                SuspendLayout();
                FormBorderStyle = _restoreBorderStyle;
                TopMost = _restoreTopMost;
                Bounds = _restoreBounds;
                WindowState = _restoreWindowState;
                ResumeLayout(true);
                _isFullScreen = false;
            }
        }

        private void ActivateFromSecondInstance()
        {
            if (InvokeRequired)
            {
                BeginInvoke((MethodInvoker)ActivateFromSecondInstance);
                return;
            }

            if (_isFullScreen)
            {
                SetFullScreen(false);
            }
            if (WindowState == FormWindowState.Minimized)
            {
                WindowState = FormWindowState.Normal;
            }
            Show();
            Activate();
            BringToFront();
            DesktopActivation.RestoreAndForeground(Handle);
        }

        private static bool IsAppPage(string address)
        {
            Uri uri;
            return Uri.TryCreate(address, UriKind.Absolute, out uri) &&
                   String.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) &&
                   String.Equals(uri.Host, AppHost, StringComparison.OrdinalIgnoreCase) &&
                   uri.IsDefaultPort;
        }

        private static bool IsAllowedAppResource(string address)
        {
            if (String.IsNullOrWhiteSpace(address) || String.Equals(address, "about:blank", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (IsAppPage(address))
            {
                return true;
            }
            if (address.StartsWith("blob:" + AppOrigin + "/", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (address.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            return false;
        }

        private static bool IsAllowedNavigation(string address)
        {
            return String.IsNullOrWhiteSpace(address) ||
                   String.Equals(address, "about:blank", StringComparison.OrdinalIgnoreCase) ||
                   IsAppPage(address);
        }

        private static void OpenExternalHttps(string address)
        {
            Uri uri;
            if (!Uri.TryCreate(address, UriKind.Absolute, out uri) ||
                !String.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
            {
                return;
            }

            try
            {
                ProcessStartInfo startInfo = new ProcessStartInfo(uri.AbsoluteUri);
                startInfo.UseShellExecute = true;
                Process.Start(startInfo);
            }
            catch (Exception exception)
            {
                DesktopDiagnostics.Write("Не удалось открыть внешнюю ссылку.", exception);
            }
        }

        private void HandleMissingRuntime(WebView2RuntimeNotFoundException exception)
        {
            DesktopDiagnostics.Write("Не найден Microsoft Edge WebView2 Runtime.", exception);
            if (_options.IsSmokeTest)
            {
                CompleteSmoke(false, "webview2_runtime_missing", exception.Message, null);
                return;
            }

            DialogResult choice = MessageBox.Show(
                this,
                "Для работы ЛЕКАЛО нужен бесплатный компонент Microsoft Edge WebView2 Runtime.\r\n\r\n" +
                "Открыть официальную страницу установки?",
                Program.WindowTitle,
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Error);
            if (choice == DialogResult.Yes)
            {
                OpenExternalHttps("https://developer.microsoft.com/microsoft-edge/webview2/");
            }
            ProcessExitCode = 2;
            Close();
        }

        private void HandleStartupFailure(string userMessage, Exception exception, string smokeCode)
        {
            DesktopDiagnostics.Write(userMessage, exception);
            if (_options.IsSmokeTest)
            {
                CompleteSmoke(false, smokeCode, userMessage + " " + exception.Message, null);
                return;
            }

            if (_fatalErrorHandled)
            {
                return;
            }
            _fatalErrorHandled = true;
            MessageBox.Show(
                this,
                userMessage + "\r\n\r\n" +
                "Подробности сохранены в журнале:\r\n" + DesktopDiagnostics.LogPath +
                "\r\n\r\n" + exception.Message,
                Program.WindowTitle,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            ProcessExitCode = 2;
            Close();
        }

        internal void HandleFatalException(Exception exception)
        {
            if (_options.IsSmokeTest)
            {
                CompleteSmoke(false, "unhandled_ui_error", exception.Message, null);
                return;
            }

            if (_fatalErrorHandled)
            {
                return;
            }
            _fatalErrorHandled = true;
            MessageBox.Show(
                this,
                "В приложении произошла непредвиденная ошибка.\r\n\r\n" +
                "Закройте ЛЕКАЛО и запустите программу снова. Журнал:\r\n" + DesktopDiagnostics.LogPath,
                Program.WindowTitle,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            ProcessExitCode = 2;
            Close();
        }

        private void OnSmokeTimeout(object sender, EventArgs eventArgs)
        {
            CompleteSmoke(false, "smoke_timeout", "Проверка превысила 45 секунд.", null);
        }

        private void CompleteSmoke(bool success, string code, string message, IDictionary<string, object> details)
        {
            if (_smokeCompleted)
            {
                return;
            }
            _smokeCompleted = true;
            _smokeTimeoutTimer.Stop();
            ProcessExitCode = success ? 0 : 2;

            try
            {
                SmokeReport.Write(_options.SmokeReportPath, success, code, message, details);
            }
            catch (Exception exception)
            {
                DesktopDiagnostics.Write("Не удалось записать отчёт smoke-теста.", exception);
                ProcessExitCode = 3;
            }

            if (!IsDisposed)
            {
                BeginInvoke((MethodInvoker)Close);
            }
        }

        private void OnFormClosed(object sender, FormClosedEventArgs eventArgs)
        {
            _smokeTimeoutTimer.Stop();
            if (_isFullScreen)
            {
                _isFullScreen = false;
            }
        }
    }

    internal static class SmokeReport
    {
        internal static void WriteFailure(
            string path,
            string code,
            string message,
            IDictionary<string, object> details)
        {
            Write(path, false, code, message, details);
        }

        internal static void Write(
            string path,
            bool success,
            string code,
            string message,
            IDictionary<string, object> details)
        {
            if (String.IsNullOrWhiteSpace(path))
            {
                return;
            }

            string directory = Path.GetDirectoryName(path);
            if (!String.IsNullOrWhiteSpace(directory))
            {
                Directory.CreateDirectory(directory);
            }

            Dictionary<string, object> report = new Dictionary<string, object>();
            report["success"] = success;
            report["code"] = code;
            report["message"] = message;
            report["checkedAtUtc"] = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
            report["application"] = "ЛЕКАЛО — Pattern Studio";
            report["details"] = details ?? new Dictionary<string, object>();

            JavaScriptSerializer serializer = new JavaScriptSerializer();
            string json = serializer.Serialize(report);
            File.WriteAllText(path, json, new UTF8Encoding(false));
        }
    }

    internal static class DesktopActivation
    {
        private const int HwndBroadcastValue = 0xffff;
        private const int SwRestore = 9;
        private const string ApplicationUserModelId = "Lekalo.PatternStudio.Desktop";
        private static readonly uint MessageId = RegisterWindowMessage("Lekalo.PatternStudio.Activate.1");

        internal static uint ActivationMessage { get { return MessageId; } }

        internal static void SetApplicationIdentity()
        {
            try
            {
                SetCurrentProcessExplicitAppUserModelID(ApplicationUserModelId);
            }
            catch (Exception exception)
            {
                DesktopDiagnostics.Write("Не удалось установить идентификатор приложения Windows.", exception);
            }
        }

        internal static void RequestActivation()
        {
            PostMessage(new IntPtr(HwndBroadcastValue), MessageId, IntPtr.Zero, IntPtr.Zero);

            IntPtr window = FindWindow(null, Program.WindowTitle);
            if (window != IntPtr.Zero)
            {
                RestoreAndForeground(window);
            }
        }

        internal static void RestoreAndForeground(IntPtr window)
        {
            ShowWindowAsync(window, SwRestore);
            SetForegroundWindow(window);
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern uint RegisterWindowMessage(string message);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool PostMessage(IntPtr window, uint message, IntPtr wordParameter, IntPtr longParameter);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern IntPtr FindWindow(string className, string windowName);

        [DllImport("user32.dll")]
        private static extern bool ShowWindowAsync(IntPtr window, int command);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr window);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int SetCurrentProcessExplicitAppUserModelID(string applicationId);
    }

    internal static class DesktopDiagnostics
    {
        private static readonly object SyncRoot = new object();

        internal static string LogPath
        {
            get
            {
                string localData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                return Path.Combine(localData, "Lekalo", "desktop-error.log");
            }
        }

        internal static void Write(string context, Exception exception)
        {
            try
            {
                lock (SyncRoot)
                {
                    string directory = Path.GetDirectoryName(LogPath);
                    if (!String.IsNullOrWhiteSpace(directory))
                    {
                        Directory.CreateDirectory(directory);
                    }

                    StringBuilder entry = new StringBuilder();
                    entry.AppendLine(DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture));
                    entry.AppendLine(context ?? "Ошибка без описания.");
                    if (exception != null)
                    {
                        entry.AppendLine(exception.ToString());
                    }
                    entry.AppendLine(new String('-', 72));
                    File.AppendAllText(LogPath, entry.ToString(), new UTF8Encoding(false));
                }
            }
            catch
            {
                // Diagnostics must never hide the original error or crash the app.
            }
        }
    }
}
