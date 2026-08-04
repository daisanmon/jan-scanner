[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$statePath = Join-Path $repoRoot '.local-runtime\poizon-local-state.json'

if (-not (Test-Path -LiteralPath $statePath)) {
  throw 'The local POIZON backend is not running. Start it with: npm.cmd run start:poizon-local'
}

$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json

function Test-TrackedProcess {
  param(
    [Parameter(Mandatory = $true)]
    [object]$ProcessState
  )

  $process = Get-Process -Id ([int]$ProcessState.pid) -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    return $false
  }

  $expectedPath = [IO.Path]::GetFullPath([string]$ProcessState.path)
  $actualPath = [IO.Path]::GetFullPath($process.Path)
  $expectedStart = [DateTime]::Parse([string]$ProcessState.startedAt).ToUniversalTime()
  $actualStart = $process.StartTime.ToUniversalTime()
  return $actualPath -eq $expectedPath -and [Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -le 1
}

$workerRunning = Test-TrackedProcess -ProcessState $state.worker
$ngrokRunning = Test-TrackedProcess -ProcessState $state.ngrok
$localHealthy = $false
$publicHealthy = $false

if ($workerRunning) {
  try {
    $localHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$($state.workerPort)/healthz" -TimeoutSec 3
    $localHealthy = $localHealth.ok -eq $true
  }
  catch {}
}

if ($ngrokRunning) {
  try {
    $publicHealth = Invoke-RestMethod `
      -Uri "$($state.publicUrl)/healthz" `
      -Headers @{ 'ngrok-skip-browser-warning' = '1' } `
      -TimeoutSec 10
    $publicHealthy = $publicHealth.ok -eq $true
  }
  catch {}
}

[pscustomobject]@{
  WorkerProcess = $workerRunning
  NgrokProcess = $ngrokRunning
  LocalHealth = $localHealthy
  PublicHealth = $publicHealthy
  PublicUrl = [string]$state.publicUrl
} | Format-List

if (-not ($workerRunning -and $ngrokRunning -and $localHealthy -and $publicHealthy)) {
  throw 'The local POIZON backend is not fully healthy. Stop it, then start it again.'
}
