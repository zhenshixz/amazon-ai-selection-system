param(
    [switch]$ForceRebuild
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $projectDir ".runtime"
$serverLog = Join-Path $runtimeDir "server-production.log"
$serverErrorLog = Join-Path $runtimeDir "server-production-error.log"
$serverPidFile = Join-Path $runtimeDir "server-production.pid"
$buildIdFile = Join-Path $projectDir ".next\BUILD_ID"
$port = 3000
$localUrl = "http://127.0.0.1:$port"

function Get-DemoHealth {
    try {
        return Invoke-RestMethod -Uri "$localUrl/api/health" -TimeoutSec 5
    }
    catch {
        return $null
    }
}

function Test-FrontendAssets([string]$BaseUrl) {
    try {
        $page = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/" -TimeoutSec 10
        $assets = [regex]::Matches($page.Content, '(?:src|href)="([^"]*/_next/static/[^"]+\.(?:js|css)[^"]*)"')
        if ($page.StatusCode -ne 200 -or $assets.Count -eq 0) {
            return $false
        }
        foreach ($asset in $assets | Select-Object -First 3) {
            $assetUrl = "$BaseUrl$($asset.Groups[1].Value)"
            $response = Invoke-WebRequest -UseBasicParsing -Method Head -Uri $assetUrl -Headers @{ Origin = $BaseUrl; Referer = "$BaseUrl/" } -TimeoutSec 10
            if ($response.StatusCode -ne 200) {
                return $false
            }
        }
        return $true
    }
    catch {
        return $false
    }
}

function Get-LanIp {
    $address = Get-NetIPConfiguration |
        Where-Object {
            $_.IPv4DefaultGateway -and
            $_.NetAdapter.Status -eq "Up" -and
            $_.IPv4Address.IPAddress -notlike "198.18.*"
        } |
        ForEach-Object { $_.IPv4Address.IPAddress } |
        Select-Object -First 1
    if ($address) { return $address }
    return "127.0.0.1"
}

function Test-BuildRequired {
    if ($ForceRebuild -or -not (Test-Path $buildIdFile)) {
        return $true
    }
    $buildTime = (Get-Item $buildIdFile).LastWriteTimeUtc
    $inputs = @(
        Get-ChildItem (Join-Path $projectDir "src") -Recurse -File -ErrorAction SilentlyContinue
        Get-Item (Join-Path $projectDir "package.json") -ErrorAction SilentlyContinue
        Get-Item (Join-Path $projectDir "package-lock.json") -ErrorAction SilentlyContinue
        Get-Item (Join-Path $projectDir "next.config.ts") -ErrorAction SilentlyContinue
        Get-Item (Join-Path $projectDir "tsconfig.json") -ErrorAction SilentlyContinue
    )
    return ($inputs | Where-Object { $_.LastWriteTimeUtc -gt $buildTime }).Count -gt 0
}

function Stop-CurrentDemoServer {
    $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) { return }
    $health = Get-DemoHealth
    if (-not $health -or $health.service -ne "amazon-ai-selection-system") {
        throw "Port $port is occupied by another service. Stop it or change its port before starting this demo."
    }
    Write-Host "[INFO] Replacing the old demo process on port $port..."
    Stop-Process -Id $connection.OwningProcess -Force -ErrorAction Stop
    for ($index = 0; $index -lt 10; $index += 1) {
        if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 300
    }
    throw "The old demo process did not release port $port."
}

try {
    Set-Location $projectDir
    if (-not (Test-Path (Join-Path $projectDir "package.json"))) {
        throw "package.json was not found in $projectDir"
    }
    if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
        throw "Node.js is not installed or is not available in PATH."
    }
    if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw "npm is not installed or is not available in PATH."
    }
    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

    if (-not (Test-Path (Join-Path $projectDir "node_modules\next\package.json"))) {
        Write-Host "[INFO] Installing project dependencies..."
        & npm.cmd install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE." }
        $ForceRebuild = $true
    }

    $health = Get-DemoHealth
    $buildRequired = Test-BuildRequired
    $stableServerReady = $health -and $health.service -eq "amazon-ai-selection-system" -and $health.runtime -eq "production" -and -not $buildRequired
    if ($stableServerReady -and (Test-FrontendAssets $localUrl)) {
        Write-Host "[OK] Stable production service is already healthy."
    }
    else {
        if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
            Stop-CurrentDemoServer
        }
        if ($buildRequired) {
            Write-Host "[INFO] Source changes detected. Building the production demo..."
            & npm.cmd run build
            if ($LASTEXITCODE -ne 0) { throw "Production build failed with exit code $LASTEXITCODE." }
        }
        Remove-Item $serverLog, $serverErrorLog, $serverPidFile -Force -ErrorAction SilentlyContinue
        Write-Host "[INFO] Starting the stable production service on port $port..."
        $server = Start-Process -FilePath "npm.cmd" `
            -ArgumentList @("run", "start", "--", "--hostname", "0.0.0.0", "--port", "$port") `
            -WorkingDirectory $projectDir `
            -RedirectStandardOutput $serverLog `
            -RedirectStandardError $serverErrorLog `
            -WindowStyle Hidden `
            -PassThru
        Set-Content -Path $serverPidFile -Value $server.Id -Encoding ASCII

        $ready = $false
        for ($index = 0; $index -lt 30; $index += 1) {
            $health = Get-DemoHealth
            if ($health -and $health.service -eq "amazon-ai-selection-system" -and $health.runtime -eq "production") {
                $ready = $true
                break
            }
            Start-Sleep -Seconds 1
        }
        if (-not $ready) {
            Get-Content $serverErrorLog -Tail 15 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "       $_" }
            throw "The production service did not become healthy. See .runtime\server-production-error.log."
        }
        if (-not (Test-FrontendAssets $localUrl)) {
            throw "The API is healthy, but production frontend assets failed validation."
        }
        Write-Host "[OK] Stable production service is healthy."
    }

    $lanIp = Get-LanIp
    $lanUrl = "http://${lanIp}:$port"
    if (-not (Test-FrontendAssets $lanUrl)) {
        throw "The local service works, but LAN frontend assets are unavailable at $lanUrl."
    }
    Write-Host "Local: $localUrl/"
    Write-Host "LAN:   $lanUrl/"
    exit 0
}
catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
