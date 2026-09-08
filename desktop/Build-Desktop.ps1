[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$SkipSmokeTest,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$packageJson = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$appVersion = [string]$packageJson.version
$webViewVersion = '1.0.4191.47'
$webViewSha256 = 'F492BBF547D0DA329553B6727435B677579B1E9F91CC9E4A1AD029366D5F23D0'
$webViewPackageName = "Microsoft.Web.WebView2.$webViewVersion"
$webViewUrl = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$webViewVersion/microsoft.web.webview2.$webViewVersion.nupkg"

$cacheRoot = Join-Path $PSScriptRoot '.packages'
$nupkgPath = Join-Path $cacheRoot "$webViewPackageName.nupkg"
$sdkRoot = Join-Path $cacheRoot $webViewPackageName
$distRoot = Join-Path $projectRoot 'dist-desktop'
$bundleName = "LEKALO-Pattern-Studio-$appVersion-win-x64"
$bundleRoot = Join-Path $distRoot $bundleName
$appRoot = Join-Path $bundleRoot 'app'
$exePath = Join-Path $bundleRoot 'LEKALO.exe'
$zipPath = Join-Path $distRoot "$bundleName.zip"
$zipHashPath = "$zipPath.sha256"
$zipTempPath = Join-Path $distRoot "$bundleName.tmp.zip"
$zipHashTempPath = "$zipHashPath.tmp"

function Assert-ChildPath {
    param(
        [Parameter(Mandatory = $true)][string]$Parent,
        [Parameter(Mandatory = $true)][string]$Child
    )

    $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
    $childFull = [System.IO.Path]::GetFullPath($Child)
    if (-not $childFull.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe generated path outside $Parent`: $Child"
    }
}

function Remove-GeneratedPath {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [switch]$BestEffort
    )

    Assert-ChildPath -Parent $projectRoot -Child $Path
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (-not (Test-Path -LiteralPath $Path)) {
            return
        }

        try {
            Remove-Item -LiteralPath $Path -Recurse -Force
            return
        }
        catch {
            if ($attempt -eq 39) {
                if ($BestEffort) {
                    Write-Warning "Could not remove temporary path yet: $Path"
                    return
                }
                throw
            }
            Start-Sleep -Milliseconds 250
        }
    }
}

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
}

function Get-WebView2Sdk {
    New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null

    $mustDownload = -not (Test-Path -LiteralPath $nupkgPath)
    if (-not $mustDownload -and (Get-Sha256 -Path $nupkgPath) -ne $webViewSha256) {
        Remove-Item -LiteralPath $nupkgPath -Force
        $mustDownload = $true
    }

    if ($mustDownload) {
        Write-Host "Downloading the pinned Microsoft WebView2 SDK $webViewVersion..."
        Invoke-WebRequest -UseBasicParsing -Uri $webViewUrl -OutFile $nupkgPath
    }

    $actualSha256 = Get-Sha256 -Path $nupkgPath
    if ($actualSha256 -ne $webViewSha256) {
        throw "WebView2 SDK integrity check failed. Expected $webViewSha256, got $actualSha256."
    }

    # Re-extract on every build so managed/native inputs always come from the
    # hash-verified package instead of a mutable stale cache directory.
    Remove-GeneratedPath -Path $sdkRoot
    New-Item -ItemType Directory -Force -Path $sdkRoot | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($nupkgPath, $sdkRoot)
}

if (-not $SkipTests) {
    Push-Location $projectRoot
    try {
        & npm.cmd run check
        if ($LASTEXITCODE -ne 0) {
            throw "Application checks failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

Get-WebView2Sdk

if ($Clean) {
    Remove-GeneratedPath -Path $distRoot
}

Remove-GeneratedPath -Path $bundleRoot
foreach ($stalePackageFile in @($zipPath, $zipHashPath, $zipTempPath, $zipHashTempPath)) {
    Remove-GeneratedPath -Path $stalePackageFile
}

New-Item -ItemType Directory -Force -Path $bundleRoot, $appRoot | Out-Null

foreach ($directory in @('assets', 'src')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $directory) -Destination $appRoot -Recurse -Force
}

foreach ($file in @('index.html', 'manifest.webmanifest', 'sw.js')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $appRoot $file) -Force
}

foreach ($file in @('LICENSE', 'THIRD_PARTY_NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination (Join-Path $bundleRoot $file) -Force
}

Copy-Item -LiteralPath (Join-Path $sdkRoot 'LICENSE.txt') -Destination (Join-Path $bundleRoot 'WEBVIEW2_LICENSE.txt') -Force

$coreDll = Join-Path $sdkRoot 'lib\net462\Microsoft.Web.WebView2.Core.dll'
$formsDll = Join-Path $sdkRoot 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'
$loaderDll = Join-Path $sdkRoot 'runtimes\win-x64\native\WebView2Loader.dll'
$sourceFile = Join-Path $PSScriptRoot 'LekaloDesktop.cs'
$manifestFile = Join-Path $PSScriptRoot 'app.manifest'
$configSource = Join-Path $PSScriptRoot 'Lekalo.exe.config'
$iconFile = Join-Path $projectRoot 'assets\icons\app-icon.ico'
$cscPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

foreach ($requiredPath in @($coreDll, $formsDll, $loaderDll, $sourceFile, $manifestFile, $configSource, $iconFile, $cscPath)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required desktop build file is missing: $requiredPath"
    }
}

$sourceText = Get-Content -LiteralPath $sourceFile -Raw
$manifestText = Get-Content -LiteralPath $manifestFile -Raw
$expectedAssemblyVersion = "$appVersion.0"
$versionChecks = @(
    @{ Name = 'AssemblyVersion'; Actual = [regex]::Match($sourceText, 'AssemblyVersion\("([^"]+)"\)').Groups[1].Value; Expected = $expectedAssemblyVersion },
    @{ Name = 'AssemblyFileVersion'; Actual = [regex]::Match($sourceText, 'AssemblyFileVersion\("([^"]+)"\)').Groups[1].Value; Expected = $expectedAssemblyVersion },
    @{ Name = 'AssemblyInformationalVersion'; Actual = [regex]::Match($sourceText, 'AssemblyInformationalVersion\("([^"]+)"\)').Groups[1].Value; Expected = $appVersion },
    @{ Name = 'app.manifest version'; Actual = [regex]::Match($manifestText, 'assemblyIdentity\s+version="([^"]+)"').Groups[1].Value; Expected = $expectedAssemblyVersion }
)
foreach ($versionCheck in $versionChecks) {
    if ($versionCheck.Actual -ne $versionCheck.Expected) {
        throw "$($versionCheck.Name) is $($versionCheck.Actual), expected $($versionCheck.Expected) from package.json."
    }
}

Write-Host "Compiling $exePath..."

# The inbox .NET Framework compiler can mis-handle non-ASCII argument paths.
# Stage all compiler inputs under the ASCII-only system temp directory, then copy
# the verified executable back to the project path.
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$compileRoot = Join-Path $temporaryRoot ("lekalo-build-" + [Guid]::NewGuid().ToString('N'))
$compileExe = Join-Path $compileRoot 'Lekalo.exe'

try {
    New-Item -ItemType Directory -Force -Path $compileRoot | Out-Null
    Copy-Item -LiteralPath $sourceFile -Destination (Join-Path $compileRoot 'LekaloDesktop.cs') -Force
    Copy-Item -LiteralPath $manifestFile -Destination (Join-Path $compileRoot 'app.manifest') -Force
    Copy-Item -LiteralPath $iconFile -Destination (Join-Path $compileRoot 'app-icon.ico') -Force
    Copy-Item -LiteralPath $coreDll -Destination (Join-Path $compileRoot 'Microsoft.Web.WebView2.Core.dll') -Force
    Copy-Item -LiteralPath $formsDll -Destination (Join-Path $compileRoot 'Microsoft.Web.WebView2.WinForms.dll') -Force

    $compilerArguments = @(
        '/nologo',
        '/target:winexe',
        '/platform:x64',
        '/optimize+',
        '/debug-',
        '/codepage:65001',
        "/out:$compileExe",
        "/win32icon:$(Join-Path $compileRoot 'app-icon.ico')",
        "/win32manifest:$(Join-Path $compileRoot 'app.manifest')",
        '/reference:System.dll',
        '/reference:System.Core.dll',
        '/reference:System.Drawing.dll',
        '/reference:System.Web.Extensions.dll',
        '/reference:System.Windows.Forms.dll',
        "/reference:$(Join-Path $compileRoot 'Microsoft.Web.WebView2.Core.dll')",
        "/reference:$(Join-Path $compileRoot 'Microsoft.Web.WebView2.WinForms.dll')",
        (Join-Path $compileRoot 'LekaloDesktop.cs')
    )

    & $cscPath @compilerArguments
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $compileExe)) {
        throw "C# compiler failed with exit code $LASTEXITCODE."
    }

    Copy-Item -LiteralPath $compileExe -Destination $exePath -Force
}
finally {
    $compileFull = [System.IO.Path]::GetFullPath($compileRoot)
    if ($compileFull.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $compileFull)) {
        Remove-Item -LiteralPath $compileFull -Recurse -Force
    }
}

Copy-Item -LiteralPath $coreDll -Destination $bundleRoot -Force
Copy-Item -LiteralPath $formsDll -Destination $bundleRoot -Force
Copy-Item -LiteralPath $loaderDll -Destination $bundleRoot -Force

Copy-Item -LiteralPath $configSource -Destination "$exePath.config" -Force

if (-not $SkipSmokeTest) {
    $smokeResult = Join-Path $distRoot 'desktop-smoke-result.json'
    $smokeProfile = Join-Path $distRoot ("desktop-smoke-profile-" + [Guid]::NewGuid().ToString('N'))
    Remove-GeneratedPath -Path $smokeResult

    try {
        Write-Host 'Running the packaged desktop smoke test in an isolated profile...'
        $smokeArguments = '--smoke-test="{0}" --qa-user-data="{1}"' -f $smokeResult, $smokeProfile
        $smokeProcess = Start-Process -FilePath $exePath -ArgumentList $smokeArguments -PassThru
        if (-not $smokeProcess.WaitForExit(65000)) {
            $smokeProcess.Kill()
            $smokeProcess.WaitForExit()
            throw 'Desktop smoke test process exceeded 65 seconds.'
        }
        if ($smokeProcess.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $smokeResult)) {
            throw "Desktop smoke test failed with exit code $($smokeProcess.ExitCode)."
        }

        $smoke = Get-Content -LiteralPath $smokeResult -Raw | ConvertFrom-Json
        if (-not $smoke.success) {
            throw "Desktop smoke test reported failure: $($smoke.message)"
        }
    }
    finally {
        Remove-GeneratedPath -Path $smokeResult
        Remove-GeneratedPath -Path $smokeProfile -BestEffort
    }
}

Compress-Archive -LiteralPath $bundleRoot -DestinationPath $zipTempPath -CompressionLevel Optimal

$zipHash = Get-Sha256 -Path $zipTempPath
$zipHash | Set-Content -LiteralPath $zipHashTempPath -Encoding ASCII
Move-Item -LiteralPath $zipTempPath -Destination $zipPath
Move-Item -LiteralPath $zipHashTempPath -Destination $zipHashPath

Write-Host ''
Write-Host 'Desktop package is ready:'
Write-Host "  EXE: $exePath"
Write-Host "  ZIP: $zipPath"
Write-Host "  SHA256: $zipHash"
