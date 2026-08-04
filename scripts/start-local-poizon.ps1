[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$WorkerPort = 8787
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeDir = Join-Path $repoRoot '.local-runtime'
$statePath = Join-Path $runtimeDir 'poizon-local-state.json'
$devVarsPath = Join-Path $repoRoot '.dev.vars'
$ngrokPath = Join-Path $repoRoot '.local-tools\ngrok\ngrok.exe'
$ngrokConfigPath = Join-Path $runtimeDir 'ngrok.yml'
$wranglerPath = Join-Path $repoRoot 'node_modules\wrangler\bin\wrangler.js'
$nodeCommand = Get-Command node.exe -ErrorAction Stop

if (-not (Test-Path -LiteralPath $devVarsPath)) {
  throw 'Missing .dev.vars. Run npm.cmd run configure:poizon-local first.'
}
if (-not (Test-Path -LiteralPath $ngrokPath)) {
  throw 'Missing ngrok. Install the project-local ngrok CLI first.'
}
if (-not (Test-Path -LiteralPath $ngrokConfigPath)) {
  throw 'Missing local ngrok configuration. Run npm.cmd run configure:ngrok-local first.'
}
if (-not (Test-Path -LiteralPath $wranglerPath)) {
  throw 'Missing Wrangler dependencies. Run npm.cmd ci first.'
}
if (Test-Path -LiteralPath $statePath) {
  throw 'A local POIZON runtime state already exists. Run npm.cmd run stop:poizon-local first.'
}

$secretLines = Get-Content -LiteralPath $devVarsPath
foreach ($requiredName in @('POIZON_APP_KEY', 'POIZON_APP_SECRET', 'TURNSTILE_SECRET_KEY')) {
  $prefix = "$requiredName="
  $matchingLine = @($secretLines | Where-Object { $_.StartsWith($prefix) })
  if ($matchingLine.Count -ne 1 -or $matchingLine[0].Substring($prefix.Length).Length -eq 0) {
    throw ".dev.vars does not contain exactly one non-empty $requiredName value."
  }
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
$workerStdout = Join-Path $runtimeDir 'worker.stdout.log'
$workerStderr = Join-Path $runtimeDir 'worker.stderr.log'
$ngrokStdout = Join-Path $runtimeDir 'ngrok.stdout.log'
$ngrokStderr = Join-Path $runtimeDir 'ngrok.stderr.log'

$workerProcess = $null
$ngrokProcess = $null

try {
  $workerProcess = Start-Process `
    -FilePath $nodeCommand.Source `
    -ArgumentList @($wranglerPath, 'dev', '--local', '--port', "$WorkerPort") `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $workerStdout `
    -RedirectStandardError $workerStderr

  $workerReady = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($workerProcess.HasExited) {
      throw "Local Worker stopped during startup. See $workerStderr"
    }
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$WorkerPort/healthz" -TimeoutSec 2
      if ($health.ok -eq $true) {
        $workerReady = $true
        break
      }
    }
    catch {
      Start-Sleep -Seconds 1
    }
  }
  if (-not $workerReady) {
    throw "Local Worker did not become healthy. See $workerStderr"
  }

  $ngrokProcess = Start-Process `
    -FilePath $ngrokPath `
    -ArgumentList @('http', "http://127.0.0.1:$WorkerPort", '--config', $ngrokConfigPath, '--log', 'stdout', '--log-format', 'json', '--log-level', 'info') `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -PassThru `
    -RedirectStandardOutput $ngrokStdout `
    -RedirectStandardError $ngrokStderr

  $publicUrl = $null
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    if ($ngrokProcess.HasExited) {
      throw "ngrok stopped during startup. See $ngrokStderr and $ngrokStdout"
    }
    try {
      $tunnelResponse = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2
      $httpsTunnels = @($tunnelResponse.tunnels | Where-Object { $_.proto -eq 'https' })
      if ($httpsTunnels.Count -eq 1 -and $httpsTunnels[0].public_url -match '^https://') {
        $publicUrl = [string]$httpsTunnels[0].public_url
        break
      }
    }
    catch {}
    Start-Sleep -Seconds 1
  }
  if ([string]::IsNullOrWhiteSpace($publicUrl)) {
    throw "ngrok did not publish an HTTPS URL. See $ngrokStderr and $ngrokStdout"
  }

  $publicHealth = Invoke-RestMethod `
    -Uri "$publicUrl/healthz" `
    -Headers @{ 'ngrok-skip-browser-warning' = '1' } `
    -TimeoutSec 10
  if ($publicHealth.PSObject.Properties.Name -notcontains 'ok' -or $publicHealth.ok -ne $true) {
    throw 'The public ngrok health check returned an unexpected response.'
  }

  $state = [ordered]@{
    worker = [ordered]@{
      pid = $workerProcess.Id
      path = $nodeCommand.Source
      startedAt = $workerProcess.StartTime.ToUniversalTime().ToString('O')
    }
    ngrok = [ordered]@{
      pid = $ngrokProcess.Id
      path = $ngrokPath
      startedAt = $ngrokProcess.StartTime.ToUniversalTime().ToString('O')
    }
    workerPort = $WorkerPort
    publicUrl = $publicUrl
  }
  [IO.File]::WriteAllText($statePath, ($state | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))

  Write-Host 'Local POIZON backend is running.'
  Write-Host "Public URL: $publicUrl"
  Write-Host 'Keep this PC awake. Stop it with: npm.cmd run stop:poizon-local'
}
catch {
  if ($null -ne $ngrokProcess -and -not $ngrokProcess.HasExited) {
    Stop-Process -Id $ngrokProcess.Id -Force
  }
  if ($null -ne $workerProcess -and -not $workerProcess.HasExited) {
    Stop-Process -Id $workerProcess.Id -Force
  }
  throw
}
