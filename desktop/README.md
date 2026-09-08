# Windows desktop host

`LEKALO.exe` is a small native WinForms host for the same static application that is published as the PWA. It does not start an HTTP server, open a browser tab, or require Node.js/Python on the user's computer.

## Build

Run from the repository root on 64-bit Windows:

```powershell
.\desktop\Build-Desktop.ps1
```

The script:

1. runs `npm run check`;
2. downloads Microsoft WebView2 SDK `1.0.4191.47` from NuGet and verifies its pinned SHA-256;
3. compiles the C# 5 source with the .NET Framework 4.8 compiler already present on supported Windows systems;
4. copies the complete shared static frontend and verifies every packaged file against the source with SHA-256;
5. starts the packaged EXE against a fresh isolated WebView2 profile, checks the rendered home screen, and opens the complete in-app Help Center;
6. creates a ZIP and a separate `.sha256` file in `dist-desktop`.

Generated packages and the NuGet cache are intentionally excluded from Git. Tagged builds can also be produced by `.github/workflows/desktop-package.yml`.

## Runtime design

- Local files are exposed only to `https://lekalo-app.example` through WebView2 virtual-host mapping with `DenyCors` access.
- All remote resource requests are blocked. User-initiated external HTTPS links open in the default system browser.
- Camera, microphone, location, notification and other permission requests are denied.
- DevTools, host objects and web messaging are disabled in release builds.
- User data remains in `%LOCALAPPDATA%\Lekalo\WebView2`, outside the portable folder.
- A named mutex prevents duplicate app instances and activates the existing window.

The host follows Microsoft's guidance for [local WebView2 content](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/working-with-local-content), the [user data folder](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder), and [Evergreen Runtime distribution](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).

## Distribution boundary

The portable preview is unsigned. Windows SmartScreen may therefore ask the tester to confirm the first launch. A broadly distributed installer requires a code-signing certificate and clean-Windows VM verification; no certificate or trust warning is bypassed by this project.
