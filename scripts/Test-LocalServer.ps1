Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$serverProcess = $null
$testRoot = $null

function Assert-Equal {
    param(
        $Actual,
        $Expected,
        [string]$Label
    )

    if ($Actual -ne $Expected) {
        throw "$Label failed. Expected '$Expected', got '$Actual'."
    }
    Write-Host "[OK] $Label"
}

function Invoke-TestRequest {
    param(
        [string]$Url,
        [int]$TimeoutMilliseconds = 2000
    )

    $request = [Net.HttpWebRequest]::Create($Url)
    $request.Method = 'GET'
    $request.Proxy = $null
    $request.Timeout = $TimeoutMilliseconds
    $request.ReadWriteTimeout = $TimeoutMilliseconds
    $request.KeepAlive = $false

    $response = $null
    $reader = $null
    try {
        $response = [Net.HttpWebResponse]$request.GetResponse()
        $reader = New-Object IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
        return [PSCustomObject]@{
            Status = [int]$response.StatusCode
            ContentType = [string]$response.ContentType
            Body = $reader.ReadToEnd()
        }
    }
    finally {
        if ($null -ne $reader) { $reader.Dispose() }
        if ($null -ne $response) { $response.Dispose() }
    }
}

function Invoke-RawStatus {
    param(
        [int]$Port,
        [string]$Target,
        [AllowNull()]
        [string]$HostHeader
    )

    $client = New-Object Net.Sockets.TcpClient
    $reader = $null
    try {
        $client.Connect([Net.IPAddress]::Loopback, $Port)
        $stream = $client.GetStream()
        $hostLine = if ($PSBoundParameters.ContainsKey('HostHeader')) {
            if ($null -eq $HostHeader) { '' } else { "Host: $HostHeader`r`n" }
        }
        else {
            "Host: 127.0.0.1:$Port`r`n"
        }
        $requestText = "GET $Target HTTP/1.1`r`n${hostLine}Connection: close`r`n`r`n"
        $requestBytes = [Text.Encoding]::ASCII.GetBytes($requestText)
        $stream.Write($requestBytes, 0, $requestBytes.Length)
        $stream.Flush()
        $reader = New-Object IO.StreamReader($stream, [Text.Encoding]::ASCII)
        $statusLine = $reader.ReadLine()
        $match = [regex]::Match($statusLine, '^HTTP/1\.1 (?<status>\d{3}) ')
        if (-not $match.Success) {
            throw "Invalid raw response: $statusLine"
        }
        return [int]$match.Groups['status'].Value
    }
    finally {
        if ($null -ne $reader) { $reader.Dispose() }
        $client.Dispose()
    }
}

try {
    $serverScript = [IO.Path]::Combine($PSScriptRoot, 'LocalServer.ps1')
    if (-not [IO.File]::Exists($serverScript)) {
        throw "Local server script was not found: $serverScript"
    }

    $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar
    $testRoot = [IO.Path]::Combine($tempBase, 'PatternStudioSelfTest-' + [Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($testRoot) | Out-Null

    $fixtures = [ordered]@{
        'index.html' = '<!doctype html><title>ok</title>'
        'sample.js' = 'export const ok = true;'
        'sample.css' = 'body { color: black; }'
        'sample.svg' = '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
        'sample.json' = '{"ok":true}'
        'site.webmanifest' = '{"name":"test"}'
        '.secret' = 'must not be served'
    }
    foreach ($name in $fixtures.Keys) {
        [IO.File]::WriteAllText([IO.Path]::Combine($testRoot, $name), $fixtures[$name], $utf8NoBom)
    }

    $stateFile = [IO.Path]::Combine($testRoot, 'state.json')
    $logFile = [IO.Path]::Combine($testRoot, 'server.log')
    $instanceId = [Guid]::NewGuid().ToString('N')
    $mutexName = 'Local\PatternStudio_SelfTest_{0}' -f $instanceId
    $powerShellExe = [IO.Path]::Combine($env:SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    if (-not [IO.File]::Exists($powerShellExe)) {
        throw "Windows PowerShell was not found: $powerShellExe"
    }

    $argumentText = '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass ' +
        ('-File "{0}" -Root "{1}" -StateFile "{2}" -LogFile "{3}" -InstanceId "{4}" -MutexName "{5}"' -f `
            $serverScript, $testRoot, $stateFile, $logFile, $instanceId, $mutexName)
    $serverProcess = Start-Process -FilePath $powerShellExe -ArgumentList $argumentText -WindowStyle Hidden -PassThru

    $state = $null
    for ($attempt = 0; $attempt -lt 50; $attempt++) {
        Start-Sleep -Milliseconds 100
        if ($serverProcess.HasExited) { break }
        if ([IO.File]::Exists($stateFile)) {
            try {
                $candidate = [IO.File]::ReadAllText($stateFile) | ConvertFrom-Json
                if ([string]$candidate.instanceId -eq $instanceId) {
                    $state = $candidate
                    break
                }
            }
            catch {}
        }
    }

    if ($null -eq $state) {
        $log = if ([IO.File]::Exists($logFile)) { [IO.File]::ReadAllText($logFile) } else { 'No server log was created.' }
        throw "Test server did not start.`n$log"
    }

    $baseUrl = 'http://127.0.0.1:{0}' -f ([int]$state.port)
    $health = Invoke-TestRequest -Url "$baseUrl/__health"
    Assert-Equal -Actual $health.Status -Expected 200 -Label 'health status'
    Assert-Equal -Actual $health.ContentType -Expected 'application/json; charset=utf-8' -Label 'health MIME'
    $healthJson = $health.Body | ConvertFrom-Json
    Assert-Equal -Actual ([string]$healthJson.status) -Expected 'ok' -Label 'health payload'
    Assert-Equal -Actual ([string]$healthJson.instanceId) -Expected $instanceId -Label 'health instance identity'

    $mimeChecks = [ordered]@{
        '/sample.js' = 'text/javascript; charset=utf-8'
        '/sample.css' = 'text/css; charset=utf-8'
        '/sample.svg' = 'image/svg+xml'
        '/sample.json' = 'application/json; charset=utf-8'
        '/site.webmanifest' = 'application/manifest+json; charset=utf-8'
    }
    foreach ($path in $mimeChecks.Keys) {
        $response = Invoke-TestRequest -Url ($baseUrl + $path)
        Assert-Equal -Actual $response.Status -Expected 200 -Label "$path status"
        Assert-Equal -Actual $response.ContentType -Expected $mimeChecks[$path] -Label "$path MIME"
    }

    $traversalStatus = Invoke-RawStatus -Port ([int]$state.port) -Target '/..%2f..%2fWindows%2fwin.ini'
    Assert-Equal -Actual $traversalStatus -Expected 403 -Label 'encoded path traversal protection'

    $hiddenStatus = Invoke-RawStatus -Port ([int]$state.port) -Target '/.secret'
    Assert-Equal -Actual $hiddenStatus -Expected 403 -Label 'hidden-file protection'
    $foreignHostStatus = Invoke-RawStatus -Port ([int]$state.port) -Target '/' -HostHeader 'attacker.invalid'
    Assert-Equal -Actual $foreignHostStatus -Expected 421 -Label 'foreign Host rejection'
    $missingHostStatus = Invoke-RawStatus -Port ([int]$state.port) -Target '/' -HostHeader $null
    Assert-Equal -Actual $missingHostStatus -Expected 400 -Label 'missing Host rejection'

    $slowClient = New-Object Net.Sockets.TcpClient
    try {
        $slowClient.Connect([Net.IPAddress]::Loopback, [int]$state.port)
        $slowStream = $slowClient.GetStream()
        $oneByte = [Text.Encoding]::ASCII.GetBytes('G')
        $slowStream.Write($oneByte, 0, $oneByte.Length)
        $slowStream.Flush()
        Start-Sleep -Milliseconds 100
        $stopwatch = [Diagnostics.Stopwatch]::StartNew()
        $parallelHealth = Invoke-TestRequest -Url "$baseUrl/__health"
        $stopwatch.Stop()
        Assert-Equal -Actual $parallelHealth.Status -Expected 200 -Label 'health remains responsive beside a slow client'
        if ($stopwatch.ElapsedMilliseconds -ge 900) {
            throw "slow-client isolation failed. Health took $($stopwatch.ElapsedMilliseconds)ms."
        }
        Write-Host "[OK] slow-client isolation ($($stopwatch.ElapsedMilliseconds)ms)"
    }
    finally {
        if ($null -ne $slowClient) { $slowClient.Dispose() }
    }

    Write-Host '[OK] Local server self-test completed.'
    exit 0
}
catch {
    Write-Error ("SELF-TEST FAILED: {0}" -f $_.Exception.Message)
    exit 1
}
finally {
    if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
        try { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue } catch {}
    }

    if (-not [string]::IsNullOrWhiteSpace($testRoot)) {
        try {
            $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
            $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar
            $safeName = [IO.Path]::GetFileName($resolvedTestRoot).StartsWith('PatternStudioSelfTest-', [StringComparison]::Ordinal)
            if ($safeName -and $resolvedTestRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and [IO.Directory]::Exists($resolvedTestRoot)) {
                Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        catch {}
    }
}
