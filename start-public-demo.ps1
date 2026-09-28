$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $projectDir ".runtime"
$serverLog = Join-Path $runtimeDir "server.log"
$serverErrorLog = Join-Path $runtimeDir "server-error.log"
$cpolarLog = Join-Path $runtimeDir "cpolar.log"
$cpolarErrorLog = Join-Path $runtimeDir "cpolar-error.log"
$publicUrlFile = Join-Path $runtimeDir "public-url.txt"
$port = 3000
$localHealthUrl = "http://127.0.0.1:$port/api/health"

function Test-DemoHealth([string]$Url) {
    try {
        $response = Invoke-RestMethod -Uri $Url -TimeoutSec 8
        return $response.status -eq "ok" -and $response.service -eq "amazon-ai-selection-system"
    }
    catch {
        return $false
    }
}

function Wait-DemoHealth([string]$Url, [int]$Attempts) {
    for ($index = 0; $index -lt $Attempts; $index += 1) {
        if (Test-DemoHealth $Url) {
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Test-PublicFrontend([string]$BaseUrl) {
    try {
        $page = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/" -TimeoutSec 12
        $assetMatch = [regex]::Match($page.Content, 'src="([^"]*/_next/static/chunks/[^"]*\.js)"')
        if (-not $assetMatch.Success) {
            return $false
        }
        $headers = @{
            Origin = $BaseUrl
            Referer = "$BaseUrl/"
        }
        $asset = Invoke-WebRequest -UseBasicParsing -Method Head -Uri "$BaseUrl$($assetMatch.Groups[1].Value)" -Headers $headers -TimeoutSec 12
        return $asset.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Test-PublicImageApi([string]$BaseUrl) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$BaseUrl/api/design-images" -ContentType "application/json" -Body '{}' -TimeoutSec 12 -ErrorAction Stop
        return $response.StatusCode -eq 202
    }
    catch {
        # An empty request should reach the route and return a JSON validation error, never a tunnel 404.
        return $_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -eq 400
    }
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

    $cpolarExe = "D:\Program Files\cpolar\cpolar.exe"
    if (-not (Test-Path $cpolarExe)) {
        $cpolarCommand = Get-Command cpolar.exe -ErrorAction SilentlyContinue
        if (-not $cpolarCommand) {
            throw "cpolar.exe was not found."
        }
        $cpolarExe = $cpolarCommand.Source
    }
    if (-not (Test-Path (Join-Path $env:USERPROFILE ".cpolar\cpolar.yml"))) {
        throw "The cpolar config file was not found in the current user profile."
    }

    New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

    $serverManager = Join-Path $projectDir "ensure-demo-server.ps1"
    if (-not (Test-Path $serverManager)) {
        throw "ensure-demo-server.ps1 was not found."
    }
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $serverManager
    if ($LASTEXITCODE -ne 0) {
        throw "The stable local service failed to start."
    }

    $lanIp = Get-NetIPConfiguration |
        Where-Object {
            $_.IPv4DefaultGateway -and
            $_.NetAdapter.Status -eq "Up" -and
            $_.IPv4Address.IPAddress -notlike "198.18.*"
        } |
        ForEach-Object { $_.IPv4Address.IPAddress } |
        Select-Object -First 1
    if (-not $lanIp) {
        $lanIp = "127.0.0.1"
    }

    $publicUrl = $null
    for ($attempt = 1; $attempt -le 2 -and -not $publicUrl; $attempt += 1) {
        Write-Host "[INFO] Starting cpolar public tunnel (attempt $attempt of 2)..."
        Get-Process cpolar -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Milliseconds 800
        Remove-Item $cpolarLog, $cpolarErrorLog -Force -ErrorAction SilentlyContinue

        Start-Process -FilePath $cpolarExe `
            -ArgumentList @("http", "$port", "-region=cn_top", "-log=stdout", "-log-level=INFO") `
            -WorkingDirectory $projectDir `
            -RedirectStandardOutput $cpolarLog `
            -RedirectStandardError $cpolarErrorLog `
            -WindowStyle Hidden

        for ($index = 0; $index -lt 20; $index += 1) {
            if (Test-Path $cpolarLog) {
                $logText = [string](Get-Content $cpolarLog -Raw -ErrorAction SilentlyContinue)
                if ($logText) {
                    $matches = [regex]::Matches($logText, "Tunnel established at (https://[a-zA-Z0-9.-]+)")
                    if ($matches.Count -gt 0) {
                        $publicUrl = $matches[$matches.Count - 1].Groups[1].Value
                        break
                    }
                }
            }
            Start-Sleep -Seconds 1
        }
    }
    if (-not $publicUrl) {
        Write-Host "[INFO] Last cpolar messages:"
        Get-Content $cpolarLog -Tail 8 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "       $_" }
        Get-Content $cpolarErrorLog -Tail 8 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "       $_" }
        throw "cpolar could not establish a public tunnel. See .runtime\cpolar.log."
    }

    Write-Host "[INFO] Checking remote access and frontend assets..."
    if (-not (Wait-DemoHealth "$publicUrl/api/health" 25)) {
        throw "The tunnel started, but its public health check failed: $publicUrl"
    }
    if (-not (Test-PublicFrontend $publicUrl)) {
        throw "The public API is healthy, but frontend assets are unavailable: $publicUrl"
    }
    if (-not (Test-PublicImageApi $publicUrl)) {
        throw "The public tunnel does not expose the image API route: $publicUrl"
    }

    Set-Content -Path $publicUrlFile -Value $publicUrl -Encoding ASCII
    try { Set-Clipboard -Value "$publicUrl/" -ErrorAction Stop; $clipboardMessage = "The public URL was copied to the clipboard." }
    catch { $clipboardMessage = "Clipboard unavailable; use .runtime\\public-url.txt." }

    Write-Host ""
    Write-Host "[OK] Public demo is ready."
    Write-Host "Local:  http://127.0.0.1:$port/"
    Write-Host "LAN:    http://${lanIp}:$port/"
    Write-Host "Public: $publicUrl/"
    Write-Host ""
    Write-Host $clipboardMessage
    exit 0
}
catch {
    Write-Host ""
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
