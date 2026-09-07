param(
    [switch]$NoBrowser
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$applicationPort = 57021
$launcherMutex = $null
$hasLauncherMutex = $false
$launcherErrorLog = $null

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

function Read-StateFile {
    param([string]$Path)

    try {
        if (-not [IO.File]::Exists($Path)) {
            return $null
        }
        return ([IO.File]::ReadAllText($Path) | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Get-Health {
    param(
        [int]$Port,
        [int]$TimeoutMilliseconds = 1500
    )

    $request = [Net.HttpWebRequest]::Create(('http://127.0.0.1:{0}/__health' -f $Port))
    $request.Method = 'GET'
    $request.Proxy = $null
    $request.Timeout = $TimeoutMilliseconds
    $request.ReadWriteTimeout = $TimeoutMilliseconds
    $request.KeepAlive = $false

    $response = $null
    $reader = $null
    try {
        $response = [Net.HttpWebResponse]$request.GetResponse()
        if ([int]$response.StatusCode -ne 200) {
            return $null
        }
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

function Test-ExistingServer {
    param(
        $State,
        [int]$Attempts = 4,
        [int]$RetryDelayMilliseconds = 250
    )

    try {
        if ($null -eq $State -or [int]$State.port -lt 1 -or [string]::IsNullOrWhiteSpace([string]$State.instanceId)) {
            return $false
        }

        $attemptCount = [Math]::Max(1, $Attempts)
        for ($attempt = 0; $attempt -lt $attemptCount; $attempt++) {
            $health = Get-Health -Port ([int]$State.port)
            if ($null -ne $health -and [string]$health.status -eq 'ok' -and
                [string]$health.instanceId -eq [string]$State.instanceId) {
                return $true
            }
            if ($attempt + 1 -lt $attemptCount) {
                Start-Sleep -Milliseconds ([Math]::Max(0, $RetryDelayMilliseconds))
            }
        }
        return $false
    }
    catch {
        return $false
    }
}

function Get-ProcessCommandLine {
    param([int]$ProcessId)

    try {
        $processInfo = Get-CimInstance Win32_Process -Filter ("ProcessId = {0}" -f $ProcessId) -ErrorAction Stop
        if ($null -eq $processInfo) { return $null }
        return [string]$processInfo.CommandLine
    }
    catch {
        return $null
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
        if ($processId -lt 1) { return $null }
        $ownsListener = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Where-Object {
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
        if (-not $matchesServer -or -not $matchesInstance -or -not $matchesPort) {
            return $null
        }

        return [PSCustomObject]@{
            status = 'ready'
            pid = $processId
            port = $Port
            baseUrl = 'http://127.0.0.1:{0}/' -f $Port
            instanceId = [string]$health.instanceId
        }
    }
    catch {
        return $null
    }
}

function Wait-VerifiedPatternStudioServer {
    param(
        [int]$Port,
        [int]$Attempts = 3,
        [int]$RetryDelayMilliseconds = 250
    )

    $attemptCount = [Math]::Max(1, $Attempts)
    for ($attempt = 0; $attempt -lt $attemptCount; $attempt++) {
        $state = Get-VerifiedPatternStudioServer -Port $Port
        if ($null -ne $state) { return $state }
        if ($attempt + 1 -lt $attemptCount) {
            Start-Sleep -Milliseconds ([Math]::Max(0, $RetryDelayMilliseconds))
        }
    }
    return $null
}

function Stop-VerifiedStaleServer {
    param(
        $State,
        [string]$ExpectedScript
    )

    try {
        $processId = [int]$State.pid
        if ($processId -lt 1) { return }
        $commandLine = Get-ProcessCommandLine -ProcessId $processId
        if ([string]::IsNullOrWhiteSpace($commandLine)) { return }

        $matchesScript = $commandLine.IndexOf($ExpectedScript, [StringComparison]::OrdinalIgnoreCase) -ge 0
        $matchesInstance = $commandLine.IndexOf([string]$State.instanceId, [StringComparison]::OrdinalIgnoreCase) -ge 0
        if ($matchesScript -and $matchesInstance) {
            Stop-Process -Id $processId -Force -ErrorAction Stop
        }
    }
    catch {
        # Best effort only: the fixed-port conflict check below will stop startup safely.
    }
}

function Test-LoopbackPortAvailable {
    param([int]$Port)

    $probe = $null
    try {
        $probe = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
        $probe.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $probe) {
            try { $probe.Stop() } catch {}
        }
    }
}

function Wait-LoopbackPortAvailable {
    param(
        [int]$Port,
        [int]$TimeoutMilliseconds = 5000
    )

    $deadline = [DateTime]::UtcNow.AddMilliseconds([Math]::Max(0, $TimeoutMilliseconds))
    do {
        if (Test-LoopbackPortAvailable -Port $Port) {
            return $true
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)

    return (Test-LoopbackPortAvailable -Port $Port)
}

function Open-ApplicationWindow {
    param([string]$Url)

    $edgeCandidates = @()
    if (-not [string]::IsNullOrWhiteSpace(${env:ProgramFiles(x86)})) {
        $edgeCandidates += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe')
    }
    if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) {
        $edgeCandidates += (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
    }
    if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
        $edgeCandidates += (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
    }

    foreach ($edgePath in $edgeCandidates) {
        if ([IO.File]::Exists($edgePath)) {
            try {
                Start-Process -FilePath $edgePath -ArgumentList @("--app=$Url", '--start-maximized') | Out-Null
                return
            }
            catch {
                break
            }
        }
    }

    Start-Process -FilePath $Url | Out-Null
}

try {
    $projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd([char[]]@('\', '/'))
    $serverScript = [IO.Path]::Combine($PSScriptRoot, 'LocalServer.ps1')
    $indexFile = [IO.Path]::Combine($projectRoot, 'index.html')

    if (-not [IO.File]::Exists($indexFile)) {
        throw "index.html was not found: $indexFile"
    }
    if (-not [IO.File]::Exists($serverScript)) {
        throw "Local server script was not found: $serverScript"
    }

    $rootKey = Get-RootKey -Path $projectRoot
    $storageBase = $env:LOCALAPPDATA
    if ([string]::IsNullOrWhiteSpace($storageBase)) {
        $storageBase = [IO.Path]::GetTempPath()
    }
    $runtimeBaseDirectory = [IO.Path]::Combine($storageBase, 'PatternStudioLocal')
    [IO.Directory]::CreateDirectory($runtimeBaseDirectory) | Out-Null
    $launcherErrorLog = [IO.Path]::Combine($runtimeBaseDirectory, 'launcher-errors.log')
    $runtimeDirectory = [IO.Path]::Combine($runtimeBaseDirectory, $rootKey)
    [IO.Directory]::CreateDirectory($runtimeDirectory) | Out-Null
    $stateFile = [IO.Path]::Combine($runtimeDirectory, 'server-state.json')
    $logFile = [IO.Path]::Combine($runtimeDirectory, 'server.log')
    $mutexName = 'Local\PatternStudio_{0}' -f $rootKey

    # The app owns one fixed loopback origin, so launches must serialize even
    # when the same folder is reached through a junction or moved shortcut.
    # The server's own mutex is separate because it is held for the full run.
    $launcherMutexName = 'Local\PatternStudioLauncher_57021'
    $launcherMutex = New-Object Threading.Mutex($false, $launcherMutexName)
    try {
        $hasLauncherMutex = $launcherMutex.WaitOne(20000, $false)
    }
    catch [Threading.AbandonedMutexException] {
        $hasLauncherMutex = $true
    }
    if (-not $hasLauncherMutex) {
        throw 'Another launcher is still starting this application. Please try the icon again.'
    }

    $existingState = Read-StateFile -Path $stateFile
    if ((Test-ExistingServer -State $existingState) -and [int]$existingState.port -eq $applicationPort) {
        $url = 'http://127.0.0.1:{0}/' -f ([int]$existingState.port)
        if (-not $NoBrowser) {
            try {
                Open-ApplicationWindow -Url $url
            }
            catch {
                Write-Warning "The server is running, but the browser could not be opened. Open this address manually: $url"
            }
        }
        Write-Host "Pattern Studio is already running: $url"
        exit 0
    }

    # The same physical project can be reached through a junction or a moved
    # shortcut and therefore have a different path hash. If the fast same-key
    # state check missed, adopt only a health-checked server whose listening PID
    # and command line are verified.
    $verifiedPortState = Wait-VerifiedPatternStudioServer -Port $applicationPort
    if ($null -ne $verifiedPortState) {
        $url = [string]$verifiedPortState.baseUrl
        if (-not $NoBrowser) {
            try {
                Open-ApplicationWindow -Url $url
            }
            catch {
                Write-Warning "The server is running, but the browser could not be opened. Open this address manually: $url"
            }
        }
        Write-Host "Pattern Studio is already running: $url"
        exit 0
    }

    if ($null -ne $existingState) {
        Stop-VerifiedStaleServer -State $existingState -ExpectedScript $serverScript
    }
    if ([IO.File]::Exists($stateFile)) {
        [IO.File]::Delete($stateFile)
    }

    if (-not (Wait-LoopbackPortAvailable -Port $applicationPort)) {
        # Re-check after the wait: another alias launcher may have completed, or
        # a previously saturated but valid local server may have recovered.
        $verifiedPortState = Wait-VerifiedPatternStudioServer -Port $applicationPort
        if ($null -ne $verifiedPortState) {
            $url = [string]$verifiedPortState.baseUrl
            if (-not $NoBrowser) {
                try {
                    Open-ApplicationWindow -Url $url
                }
                catch {
                    Write-Warning "The server is running, but the browser could not be opened. Open this address manually: $url"
                }
            }
            Write-Host "Pattern Studio is already running: $url"
            exit 0
        }
        throw "Required local port $applicationPort is already in use. Close the program using it, then start Pattern Studio again. The launcher will not switch ports because that would hide browser profiles and drafts."
    }

    $instanceId = [Guid]::NewGuid().ToString('N')
    $powerShellExe = [IO.Path]::Combine($env:SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    if (-not [IO.File]::Exists($powerShellExe)) {
        throw "Windows PowerShell was not found: $powerShellExe"
    }

    $argumentText = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass ' +
        ('-File "{0}" -Root "{1}" -StateFile "{2}" -LogFile "{3}" -InstanceId "{4}" -MutexName "{5}" -Port {6}' -f `
            $serverScript, $projectRoot, $stateFile, $logFile, $instanceId, $mutexName, $applicationPort)

    $serverProcess = Start-Process -FilePath $powerShellExe -ArgumentList $argumentText `
        -WindowStyle Hidden -PassThru

    $readyState = $null
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        Start-Sleep -Milliseconds 200
        if ($serverProcess.HasExited) {
            break
        }

        $candidateState = Read-StateFile -Path $stateFile
        if ($null -ne $candidateState -and [string]$candidateState.instanceId -eq $instanceId -and
            (Test-ExistingServer -State $candidateState -Attempts 1)) {
            $readyState = $candidateState
            break
        }
    }

    if ($null -eq $readyState) {
        # A concurrent launcher using another path alias may have won the fixed
        # port just before this process. Treat its verified server as success.
        $readyState = Wait-VerifiedPatternStudioServer -Port $applicationPort
    }

    if ($null -eq $readyState) {
        if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
            try { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue } catch {}
        }
        $failedState = Read-StateFile -Path $stateFile
        if ($null -ne $failedState -and [string]$failedState.instanceId -eq $instanceId -and [IO.File]::Exists($stateFile)) {
            [IO.File]::Delete($stateFile)
        }

        $details = ''
        if ([IO.File]::Exists($logFile)) {
            try {
                $details = [IO.File]::ReadAllText($logFile).Trim()
            }
            catch {}
        }
        if ([string]::IsNullOrWhiteSpace($details)) {
            $details = 'The server process exited or did not become ready within 10 seconds.'
        }
        throw "Local server startup failed.`n$details`nLog: $logFile"
    }

    $url = 'http://127.0.0.1:{0}/' -f ([int]$readyState.port)
    if (-not $NoBrowser) {
        try {
            Open-ApplicationWindow -Url $url
        }
        catch {
            Write-Warning "The server is running, but the browser could not be opened. Open this address manually: $url"
        }
    }
    Write-Host "Pattern Studio is ready: $url"
    Write-Host "Server log: $logFile"
    exit 0
}
catch {
    if (-not [string]::IsNullOrWhiteSpace($launcherErrorLog)) {
        try {
            $utf8NoBom = New-Object Text.UTF8Encoding($false)
            $entry = '{0} | {1} | {2}{3}' -f [DateTime]::UtcNow.ToString('o'), $projectRoot, $_.Exception.Message, [Environment]::NewLine
            [IO.File]::AppendAllText($launcherErrorLog, $entry, $utf8NoBom)
        }
        catch {}
    }
    Write-Error ("ERROR: {0}" -f $_.Exception.Message)
    exit 1
}
finally {
    if ($hasLauncherMutex -and $null -ne $launcherMutex) {
        try { $launcherMutex.ReleaseMutex() } catch {}
    }
    if ($null -ne $launcherMutex) {
        try { $launcherMutex.Dispose() } catch {}
    }
}
