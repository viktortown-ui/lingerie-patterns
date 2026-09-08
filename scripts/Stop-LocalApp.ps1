Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$applicationPort = 57021

function Get-RootKey {
    param([string]$Path)

    $normalized = [IO.Path]::GetFullPath($Path).TrimEnd([char[]]@('\', '/')).ToUpperInvariant()
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($normalized)
        return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').Substring(0, 16)
    }
    finally {
        $sha.Dispose()
    }
}

function Get-ProcessCommandLine {
    param([int]$ProcessId)

    $processInfo = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ProcessId) -ErrorAction Stop
    if ($null -eq $processInfo) { return $null }
    return [string]$processInfo.CommandLine
}

function Get-Health {
    param([int]$Port)

    $request = [Net.HttpWebRequest]::Create(('http://127.0.0.1:{0}/__health' -f $Port))
    $request.Method = 'GET'
    $request.Proxy = $null
    $request.Timeout = 1500
    $request.ReadWriteTimeout = 1500
    $request.KeepAlive = $false
    $response = $null
    $reader = $null
    try {
        $response = [Net.HttpWebResponse]$request.GetResponse()
        if ([int]$response.StatusCode -ne 200) { return $null }
        $reader = New-Object IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
        return ($reader.ReadToEnd() | ConvertFrom-Json)
    }
    catch {
        return $null
    }
    finally {
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $response) { $response.Dispose() }
    }
}

function Get-VerifiedPatternStudioServer {
    param([int]$Port)

    try {
        $health = Get-Health -Port $Port
        if ($null -eq $health -or [string]$health.status -ne 'ok' -or
            [string]$health.service -ne 'pattern-studio-local' -or
            [string]::IsNullOrWhiteSpace([string]$health.instanceId)) {
            return $null
        }

        $processId = [int]$health.pid
        $ownsListener = $processId -gt 0 -and @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Where-Object {
            [int]$_.OwningProcess -eq $processId -and [string]$_.LocalAddress -eq '127.0.0.1'
        }).Count -gt 0
        if (-not $ownsListener) { return $null }

        $commandLine = Get-ProcessCommandLine -ProcessId $processId
        $matchesServer = -not [string]::IsNullOrWhiteSpace($commandLine) -and
            $commandLine.IndexOf('LocalServer.ps1', [StringComparison]::OrdinalIgnoreCase) -ge 0
        $matchesInstance = -not [string]::IsNullOrWhiteSpace($commandLine) -and
            $commandLine.IndexOf([string]$health.instanceId, [StringComparison]::OrdinalIgnoreCase) -ge 0
        $matchesPort = -not [string]::IsNullOrWhiteSpace($commandLine) -and
            $commandLine.IndexOf(('-Port {0}' -f $Port), [StringComparison]::OrdinalIgnoreCase) -ge 0
        if (-not $matchesServer -or -not $matchesInstance -or -not $matchesPort) { return $null }

        return [PSCustomObject]@{
            pid = $processId
            port = $Port
            instanceId = [string]$health.instanceId
            verifiedByHealth = $true
        }
    }
    catch {
        return $null
    }
}

function Wait-VerifiedPatternStudioServer {
    param(
        [int]$Port,
        [int]$Attempts = 3
    )

    for ($attempt = 0; $attempt -lt [Math]::Max(1, $Attempts); $attempt++) {
        $state = Get-VerifiedPatternStudioServer -Port $Port
        if ($null -ne $state) { return $state }
        if ($attempt + 1 -lt [Math]::Max(1, $Attempts)) {
            Start-Sleep -Milliseconds 250
        }
    }
    return $null
}

try {
    $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd([char[]]@('\', '/'))
    $serverScript = [IO.Path]::Combine($PSScriptRoot, 'LocalServer.ps1')
    $rootKey = Get-RootKey -Path $projectRoot
    $storageBase = $env:LOCALAPPDATA
    if ([string]::IsNullOrWhiteSpace($storageBase)) {
        $storageBase = [IO.Path]::GetTempPath()
    }
    $runtimeDirectory = [IO.Path]::Combine($storageBase, 'PatternStudioLocal', $rootKey)
    $stateFile = [IO.Path]::Combine($runtimeDirectory, 'server-state.json')

    $verifiedPortState = Wait-VerifiedPatternStudioServer -Port $applicationPort
    $state = $null

    if ([IO.File]::Exists($stateFile)) {
        try {
            $state = [IO.File]::ReadAllText($stateFile) | ConvertFrom-Json
        }
        catch {
            if ($null -eq $verifiedPortState) {
                [IO.File]::Delete($stateFile)
                throw 'The server state file was invalid and has been removed. No process was stopped.'
            }
        }
    }

    # A verified listener is authoritative. A path alias may have its own stale
    # state file even though the live server belongs to the same application.
    if ($null -ne $verifiedPortState) {
        $state = $verifiedPortState
    }
    if ($null -eq $state) {
        Write-Host 'Pattern Studio local server is not running.'
        exit 0
    }

    $processId = [int]$state.pid
    $instanceId = [string]$state.instanceId

    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        [IO.File]::Delete($stateFile)
        Write-Host 'Pattern Studio local server was already stopped. Stale state was cleaned up.'
        exit 0
    }

    $commandLine = Get-ProcessCommandLine -ProcessId $processId
    $matchesExactScript = -not [string]::IsNullOrWhiteSpace($commandLine) -and
        $commandLine.IndexOf($serverScript, [StringComparison]::OrdinalIgnoreCase) -ge 0
    $matchesVerifiedPortServer = $null -ne $verifiedPortState -and
        [int]$verifiedPortState.pid -eq $processId -and
        [string]$verifiedPortState.instanceId -eq $instanceId
    $matchesScript = $matchesExactScript -or $matchesVerifiedPortServer
    $matchesInstance = -not [string]::IsNullOrWhiteSpace($commandLine) -and
        $commandLine.IndexOf($instanceId, [StringComparison]::OrdinalIgnoreCase) -ge 0

    if (-not $matchesScript -or -not $matchesInstance) {
        throw "Refusing to stop process $processId because it could not be verified as this application's server."
    }

    Stop-Process -Id $processId -Force -ErrorAction Stop
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if ($null -eq (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
            break
        }
        Start-Sleep -Milliseconds 100
    }

    if ($null -ne (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
        throw "Server process $processId did not stop. Close it in Task Manager and try again."
    }

    if ([IO.File]::Exists($stateFile)) {
        [IO.File]::Delete($stateFile)
    }
    Write-Host 'Pattern Studio local server stopped.'
    exit 0
}
catch {
    Write-Error ("ERROR: {0}" -f $_.Exception.Message)
    exit 1
}
