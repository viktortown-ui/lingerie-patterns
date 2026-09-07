param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [Parameter(Mandatory = $true)]
    [string]$StateFile,

    [Parameter(Mandatory = $true)]
    [string]$LogFile,

    [Parameter(Mandatory = $true)]
    [string]$InstanceId,

    [Parameter(Mandatory = $true)]
    [string]$MutexName,

    [ValidateRange(0, 65535)]
    [int]$Port = 0,

    [switch]$HandleSingleClient,

    [Net.Sockets.TcpClient]$Client
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:Listener = $null
$script:Mutex = $null
$script:HasMutex = $false
$script:WorkerPool = $null
$script:Workers = New-Object Collections.ArrayList
$script:MaxClientWorkers = 8

function Write-ServerLog {
    param([string]$Message)

    try {
        $line = '{0} {1}{2}' -f ([DateTime]::UtcNow.ToString('o')), $Message, [Environment]::NewLine
        [IO.File]::AppendAllText($LogFile, $line, $script:Utf8NoBom)
    }
    catch {
        # Logging must never take down the server.
    }
}

function Write-HttpResponse {
    param(
        [Parameter(Mandatory = $true)]
        [IO.Stream]$Stream,
        [Parameter(Mandatory = $true)]
        [int]$StatusCode,
        [Parameter(Mandatory = $true)]
        [string]$Reason,
        [Parameter(Mandatory = $true)]
        [string]$ContentType,
        [Parameter(Mandatory = $true)]
        [byte[]]$Body,
        [bool]$HeadOnly = $false,
        [hashtable]$ExtraHeaders = @{}
    )

    $header = New-Object System.Text.StringBuilder
    [void]$header.Append(("HTTP/1.1 {0} {1}`r`n" -f $StatusCode, $Reason))
    [void]$header.Append(("Date: {0}`r`n" -f [DateTime]::UtcNow.ToString('R')))
    [void]$header.Append("Server: PatternStudioLocal/1.0`r`n")
    [void]$header.Append(("Content-Type: {0}`r`n" -f $ContentType))
    [void]$header.Append(("Content-Length: {0}`r`n" -f $Body.Length))
    [void]$header.Append("Cache-Control: no-cache`r`n")
    [void]$header.Append("X-Content-Type-Options: nosniff`r`n")
    [void]$header.Append("Cross-Origin-Resource-Policy: same-origin`r`n")
    [void]$header.Append("Referrer-Policy: no-referrer`r`n")
    [void]$header.Append("X-Frame-Options: DENY`r`n")
    [void]$header.Append("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`r`n")
    [void]$header.Append("Connection: close`r`n")

    foreach ($name in $ExtraHeaders.Keys) {
        [void]$header.Append(("{0}: {1}`r`n" -f $name, $ExtraHeaders[$name]))
    }

    [void]$header.Append("`r`n")
    $headerBytes = [Text.Encoding]::ASCII.GetBytes($header.ToString())
    $Stream.Write($headerBytes, 0, $headerBytes.Length)

    if (-not $HeadOnly -and $Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }

    $Stream.Flush()
}

function Write-TextResponse {
    param(
        [IO.Stream]$Stream,
        [int]$StatusCode,
        [string]$Reason,
        [string]$Text,
        [bool]$HeadOnly = $false,
        [hashtable]$ExtraHeaders = @{}
    )

    $body = $script:Utf8NoBom.GetBytes($Text)
    Write-HttpResponse -Stream $Stream -StatusCode $StatusCode -Reason $Reason `
        -ContentType 'text/plain; charset=utf-8' -Body $body -HeadOnly $HeadOnly `
        -ExtraHeaders $ExtraHeaders
}

function Get-ContentType {
    param([string]$Path)

    switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.htm' { return 'text/html; charset=utf-8' }
        '.js' { return 'text/javascript; charset=utf-8' }
        '.mjs' { return 'text/javascript; charset=utf-8' }
        '.css' { return 'text/css; charset=utf-8' }
        '.svg' { return 'image/svg+xml' }
        '.json' { return 'application/json; charset=utf-8' }
        '.webmanifest' { return 'application/manifest+json; charset=utf-8' }
        '.xml' { return 'application/xml; charset=utf-8' }
        '.txt' { return 'text/plain; charset=utf-8' }
        '.png' { return 'image/png' }
        '.jpg' { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.gif' { return 'image/gif' }
        '.webp' { return 'image/webp' }
        '.ico' { return 'image/x-icon' }
        '.woff' { return 'font/woff' }
        '.woff2' { return 'font/woff2' }
        '.ttf' { return 'font/ttf' }
        '.pdf' { return 'application/pdf' }
        '.wasm' { return 'application/wasm' }
        default { return 'application/octet-stream' }
    }
}

function Test-DescendantReparsePoint {
    param(
        [string]$RootPath,
        [string]$CandidatePath
    )

    $rootWithSeparator = $RootPath.TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar
    if ($CandidatePath.Equals($RootPath, [StringComparison]::OrdinalIgnoreCase)) {
        return $false
    }

    $relative = $CandidatePath.Substring($rootWithSeparator.Length)
    $current = $RootPath
    foreach ($segment in $relative.Split([char[]]@('\', '/'), [StringSplitOptions]::RemoveEmptyEntries)) {
        $current = [IO.Path]::Combine($current, $segment)
        if (-not [IO.File]::Exists($current) -and -not [IO.Directory]::Exists($current)) {
            break
        }

        $attributes = [IO.File]::GetAttributes($current)
        if (($attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            return $true
        }
    }

    return $false
}

function Resolve-RequestedFile {
    param(
        [string]$RawPath,
        [string]$RootPath
    )

    if ($RawPath -match '%(?![0-9A-Fa-f]{2})') {
        throw [ArgumentException]::new('Malformed percent encoding.')
    }

    $decoded = [Uri]::UnescapeDataString($RawPath)
    if ($decoded.IndexOf([char]0) -ge 0 -or $decoded.IndexOf(':') -ge 0) {
        throw [UnauthorizedAccessException]::new('The requested path is not allowed.')
    }

    $relative = $decoded.TrimStart([char[]]@('/', '\'))
    $segments = $relative.Split([char[]]@('/', '\'), [StringSplitOptions]::RemoveEmptyEntries)
    if ($segments | Where-Object { $_.StartsWith('.', [StringComparison]::Ordinal) }) {
        throw [UnauthorizedAccessException]::new('Hidden paths are not served.')
    }
    $candidate = [IO.Path]::GetFullPath([IO.Path]::Combine($RootPath, $relative))
    $rootWithSeparator = $RootPath.TrimEnd([char[]]@('\', '/')) + [IO.Path]::DirectorySeparatorChar

    $insideRoot = $candidate.Equals($RootPath, [StringComparison]::OrdinalIgnoreCase) -or
        $candidate.StartsWith($rootWithSeparator, [StringComparison]::OrdinalIgnoreCase)
    if (-not $insideRoot) {
        throw [UnauthorizedAccessException]::new('The requested path leaves the application directory.')
    }

    if ([IO.Directory]::Exists($candidate)) {
        $candidate = [IO.Path]::Combine($candidate, 'index.html')
    }

    $insideRoot = $candidate.StartsWith($rootWithSeparator, [StringComparison]::OrdinalIgnoreCase)
    if (-not $insideRoot -or (Test-DescendantReparsePoint -RootPath $RootPath -CandidatePath $candidate)) {
        throw [UnauthorizedAccessException]::new('The requested path is not allowed.')
    }

    return $candidate
}

function Read-BoundedAsciiLine {
    param(
        [Parameter(Mandatory = $true)]
        [IO.Stream]$Stream,
        [Parameter(Mandatory = $true)]
        [int]$MaxBytes,
        [Parameter(Mandatory = $true)]
        [DateTime]$DeadlineUtc
    )

    $bytes = New-Object Collections.Generic.List[byte]
    while ($true) {
        $remaining = [int][Math]::Ceiling(($DeadlineUtc - [DateTime]::UtcNow).TotalMilliseconds)
        if ($remaining -le 0) {
            throw [TimeoutException]::new('The request deadline expired.')
        }
        $Stream.ReadTimeout = [Math]::Max(1, [Math]::Min(1000, $remaining))
        try {
            $next = $Stream.ReadByte()
        }
        catch [IO.IOException] {
            if ([DateTime]::UtcNow -ge $DeadlineUtc) {
                throw [TimeoutException]::new('The request deadline expired.')
            }
            throw
        }
        if ($next -lt 0) {
            if ($bytes.Count -eq 0) { return $null }
            throw [IO.EndOfStreamException]::new('The request ended before the line terminator.')
        }
        if ($next -eq 10) {
            if ($bytes.Count -gt 0 -and $bytes[$bytes.Count - 1] -eq 13) {
                $bytes.RemoveAt($bytes.Count - 1)
            }
            return [Text.Encoding]::ASCII.GetString($bytes.ToArray())
        }
        if ($next -lt 32 -and $next -ne 9 -and $next -ne 13) {
            throw [IO.InvalidDataException]::new('The request contains a control character.')
        }
        if ($bytes.Count -ge $MaxBytes) {
            throw [IO.InvalidDataException]::new('The HTTP line is too long.')
        }
        $bytes.Add([byte]$next)
    }
}

function Handle-Client {
    param(
        [Net.Sockets.TcpClient]$Client,
        [string]$RootPath,
        [string]$ExpectedHost
    )

    $Client.ReceiveTimeout = 1000
    $Client.SendTimeout = 5000
    $stream = $Client.GetStream()
    $deadlineUtc = [DateTime]::UtcNow.AddMilliseconds(1000)

    try {
        try {
            $requestLine = Read-BoundedAsciiLine -Stream $stream -MaxBytes 8192 -DeadlineUtc $deadlineUtc
        }
        catch [IO.InvalidDataException] {
            Write-TextResponse -Stream $stream -StatusCode 414 -Reason 'URI Too Long' -Text 'Request target is too long.'
            return
        }
        if ([string]::IsNullOrWhiteSpace($requestLine)) {
            return
        }

        $match = [regex]::Match($requestLine, '^(?<method>[A-Z]+) (?<target>\S+) HTTP/(?<version>1\.[01])$')
        if (-not $match.Success) {
            Write-TextResponse -Stream $stream -StatusCode 400 -Reason 'Bad Request' -Text 'Malformed HTTP request.'
            return
        }

        $headerCount = 0
        $headerLength = 0
        $hostCount = 0
        $hostValue = $null
        while ($true) {
            try {
                $line = Read-BoundedAsciiLine -Stream $stream -MaxBytes 8192 -DeadlineUtc $deadlineUtc
            }
            catch [IO.InvalidDataException] {
                Write-TextResponse -Stream $stream -StatusCode 431 -Reason 'Request Header Fields Too Large' -Text 'Request headers are too large.'
                return
            }
            if ($null -eq $line -or $line.Length -eq 0) {
                break
            }

            $headerCount++
            $headerLength += $line.Length
            if ($headerCount -gt 100 -or $headerLength -gt 32768) {
                Write-TextResponse -Stream $stream -StatusCode 431 -Reason 'Request Header Fields Too Large' -Text 'Request headers are too large.'
                return
            }
            $separator = $line.IndexOf(':')
            if ($separator -le 0) {
                Write-TextResponse -Stream $stream -StatusCode 400 -Reason 'Bad Request' -Text 'Malformed HTTP header.'
                return
            }
            $headerName = $line.Substring(0, $separator).Trim()
            $headerValue = $line.Substring($separator + 1).Trim()
            if ($headerName.Equals('Host', [StringComparison]::OrdinalIgnoreCase)) {
                $hostCount++
                $hostValue = $headerValue
            }
        }

        if ($hostCount -ne 1 -or [string]::IsNullOrWhiteSpace($hostValue)) {
            Write-TextResponse -Stream $stream -StatusCode 400 -Reason 'Bad Request' -Text 'Exactly one Host header is required.'
            return
        }
        if (-not $hostValue.Equals($ExpectedHost, [StringComparison]::OrdinalIgnoreCase)) {
            Write-TextResponse -Stream $stream -StatusCode 421 -Reason 'Misdirected Request' -Text 'This local server accepts only its loopback origin.'
            return
        }

        $method = $match.Groups['method'].Value
        $target = $match.Groups['target'].Value
        $headOnly = $method -eq 'HEAD'
        if ($method -ne 'GET' -and -not $headOnly) {
            Write-TextResponse -Stream $stream -StatusCode 405 -Reason 'Method Not Allowed' `
                -Text 'Only GET and HEAD are supported.' -ExtraHeaders @{ Allow = 'GET, HEAD' }
            return
        }

        if (-not $target.StartsWith('/') -or $target.IndexOf('#') -ge 0) {
            Write-TextResponse -Stream $stream -StatusCode 400 -Reason 'Bad Request' -Text 'Invalid request target.' -HeadOnly $headOnly
            return
        }

        $queryIndex = $target.IndexOf('?')
        $rawPath = if ($queryIndex -ge 0) { $target.Substring(0, $queryIndex) } else { $target }

        if ($rawPath -eq '/__health') {
            $health = [ordered]@{
                status = 'ok'
                service = 'pattern-studio-local'
                instanceId = $InstanceId
                pid = $PID
            }
            $body = $script:Utf8NoBom.GetBytes(($health | ConvertTo-Json -Compress))
            Write-HttpResponse -Stream $stream -StatusCode 200 -Reason 'OK' `
                -ContentType 'application/json; charset=utf-8' -Body $body -HeadOnly $headOnly
            return
        }

        try {
            $filePath = Resolve-RequestedFile -RawPath $rawPath -RootPath $RootPath
        }
        catch [UnauthorizedAccessException] {
            Write-TextResponse -Stream $stream -StatusCode 403 -Reason 'Forbidden' -Text 'Path is outside the application directory.' -HeadOnly $headOnly
            return
        }
        catch [ArgumentException] {
            Write-TextResponse -Stream $stream -StatusCode 400 -Reason 'Bad Request' -Text 'Invalid request path.' -HeadOnly $headOnly
            return
        }
        catch [NotSupportedException] {
            Write-TextResponse -Stream $stream -StatusCode 400 -Reason 'Bad Request' -Text 'Invalid request path.' -HeadOnly $headOnly
            return
        }

        if (-not [IO.File]::Exists($filePath)) {
            Write-TextResponse -Stream $stream -StatusCode 404 -Reason 'Not Found' -Text 'File not found.' -HeadOnly $headOnly
            return
        }

        try {
            $body = [IO.File]::ReadAllBytes($filePath)
            Write-HttpResponse -Stream $stream -StatusCode 200 -Reason 'OK' `
                -ContentType (Get-ContentType -Path $filePath) -Body $body -HeadOnly $headOnly
        }
        catch [UnauthorizedAccessException] {
            Write-TextResponse -Stream $stream -StatusCode 403 -Reason 'Forbidden' -Text 'The file cannot be read.' -HeadOnly $headOnly
        }
    }
    catch [TimeoutException] {
        Write-ServerLog ('Request timeout: ' + $_.Exception.Message)
        try {
            Write-TextResponse -Stream $stream -StatusCode 408 -Reason 'Request Timeout' -Text 'The local request timed out.'
        }
        catch {}
    }
    catch {
        Write-ServerLog ('Request error: ' + $_.Exception.Message)
        try {
            Write-TextResponse -Stream $stream -StatusCode 500 -Reason 'Internal Server Error' -Text 'The local server could not process this request.'
        }
        catch {
            # The client may already have disconnected.
        }
    }
}

function Remove-OwnStateFile {
    if (-not [IO.File]::Exists($StateFile)) {
        return
    }

    try {
        $state = [IO.File]::ReadAllText($StateFile, $script:Utf8NoBom) | ConvertFrom-Json
        if ([string]$state.instanceId -eq $InstanceId) {
            [IO.File]::Delete($StateFile)
        }
    }
    catch {
        # Keep an unknown state file for the launcher to diagnose.
    }
}

function Complete-ClientWorkers {
    for ($index = $script:Workers.Count - 1; $index -ge 0; $index--) {
        $worker = $script:Workers[$index]
        if (-not $worker.AsyncResult.IsCompleted) { continue }
        try {
            [void]$worker.PowerShell.EndInvoke($worker.AsyncResult)
        }
        catch {
            Write-ServerLog ('Worker error: ' + $_.Exception.Message)
        }
        finally {
            try { $worker.PowerShell.Dispose() } catch {}
            try { $worker.Client.Dispose() } catch {}
            $script:Workers.RemoveAt($index)
        }
    }
}

function Start-ClientWorker {
    param(
        [Parameter(Mandatory = $true)]
        [Net.Sockets.TcpClient]$AcceptedClient,
        [Parameter(Mandatory = $true)]
        [string]$RootPath,
        [Parameter(Mandatory = $true)]
        [int]$ActualPort
    )

    $powerShell = [Management.Automation.PowerShell]::Create()
    $powerShell.RunspacePool = $script:WorkerPool
    [void]$powerShell.AddCommand($PSCommandPath)
    [void]$powerShell.AddParameter('Root', $RootPath)
    [void]$powerShell.AddParameter('StateFile', $StateFile)
    [void]$powerShell.AddParameter('LogFile', $LogFile)
    [void]$powerShell.AddParameter('InstanceId', $InstanceId)
    [void]$powerShell.AddParameter('MutexName', $MutexName)
    [void]$powerShell.AddParameter('Port', $ActualPort)
    [void]$powerShell.AddParameter('HandleSingleClient', $true)
    [void]$powerShell.AddParameter('Client', $AcceptedClient)
    try {
        $asyncResult = $powerShell.BeginInvoke()
        [void]$script:Workers.Add([PSCustomObject]@{
            PowerShell = $powerShell
            AsyncResult = $asyncResult
            Client = $AcceptedClient
        })
    }
    catch {
        $powerShell.Dispose()
        $AcceptedClient.Dispose()
        throw
    }
}

if ($HandleSingleClient) {
    if ($null -eq $Client -or $Port -lt 1) {
        throw 'A client and its listening port are required in worker mode.'
    }
    try {
        $workerRoot = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]@('\', '/'))
        Handle-Client -Client $Client -RootPath $workerRoot -ExpectedHost ('127.0.0.1:{0}' -f $Port)
    }
    finally {
        $Client.Dispose()
    }
    return
}

$exitCode = 0
try {
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd([char[]]@('\', '/'))
    if (-not [IO.Directory]::Exists($rootFull)) {
        throw "Application directory does not exist: $rootFull"
    }
    if (-not [IO.File]::Exists([IO.Path]::Combine($rootFull, 'index.html'))) {
        throw "index.html was not found in: $rootFull"
    }

    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($LogFile)) | Out-Null

    $createdNew = $false
    $script:Mutex = New-Object Threading.Mutex($false, $MutexName, [ref]$createdNew)
    try {
        $script:HasMutex = $script:Mutex.WaitOne(0, $false)
    }
    catch [Threading.AbandonedMutexException] {
        $script:HasMutex = $true
    }

    if (-not $script:HasMutex) {
        throw 'Another local server instance already owns this application directory.'
    }

    # Only the process that owns the server mutex may rotate the shared log.
    [IO.File]::WriteAllText($LogFile, '', $script:Utf8NoBom)

    $script:Listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
    $script:Listener.Start()
    $actualPort = ([Net.IPEndPoint]$script:Listener.LocalEndpoint).Port
    $baseUrl = 'http://127.0.0.1:{0}/' -f $actualPort
    $script:WorkerPool = [Management.Automation.Runspaces.RunspaceFactory]::CreateRunspacePool(1, $script:MaxClientWorkers)
    $script:WorkerPool.Open()

    $state = [ordered]@{
        schemaVersion = 1
        status = 'ready'
        pid = $PID
        port = $actualPort
        baseUrl = $baseUrl
        instanceId = $InstanceId
        root = $rootFull
        serverScript = $PSCommandPath
        startedUtc = [DateTime]::UtcNow.ToString('o')
    }
    $stateJson = $state | ConvertTo-Json -Compress
    $temporaryStateFile = '{0}.{1}.tmp' -f $StateFile, $InstanceId
    [IO.File]::WriteAllText($temporaryStateFile, $stateJson, $script:Utf8NoBom)
    Move-Item -LiteralPath $temporaryStateFile -Destination $StateFile -Force

    Write-ServerLog ("Listening on $baseUrl")

    while ($true) {
        Complete-ClientWorkers
        if ($script:Workers.Count -ge $script:MaxClientWorkers -or -not $script:Listener.Pending()) {
            Start-Sleep -Milliseconds 10
            continue
        }
        $acceptedClient = $script:Listener.AcceptTcpClient()
        Start-ClientWorker -AcceptedClient $acceptedClient -RootPath $rootFull -ActualPort $actualPort
    }
}
catch {
    $exitCode = 1
    Write-ServerLog ('Fatal error: ' + $_.Exception.Message)
}
finally {
    if ($null -ne $script:Listener) {
        try { $script:Listener.Stop() } catch {}
    }
    foreach ($worker in @($script:Workers)) {
        try { $worker.Client.Dispose() } catch {}
        try { $worker.PowerShell.Stop() } catch {}
        try { $worker.PowerShell.Dispose() } catch {}
    }
    if ($null -ne $script:WorkerPool) {
        try { $script:WorkerPool.Close() } catch {}
        try { $script:WorkerPool.Dispose() } catch {}
    }
    Remove-OwnStateFile
    if ($script:HasMutex -and $null -ne $script:Mutex) {
        try { $script:Mutex.ReleaseMutex() } catch {}
    }
    if ($null -ne $script:Mutex) {
        $script:Mutex.Dispose()
    }
}

exit $exitCode
