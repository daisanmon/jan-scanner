[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeDir = Join-Path $repoRoot '.local-runtime'
$statePath = Join-Path $runtimeDir 'poizon-local-state.json'

if (-not (Test-Path -LiteralPath $statePath)) {
  Write-Host 'No tracked local POIZON runtime is running.'
  exit 0
}

$state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json

function Stop-TrackedProcess {
  param(
    [Parameter(Mandatory = $true)]
    [object]$ProcessState,
    [Parameter(Mandatory = $true)]
    [string]$Label
  )

  $process = Get-Process -Id ([int]$ProcessState.pid) -ErrorAction SilentlyContinue
  if ($null -eq $process) {
    Write-Host "$Label is already stopped."
    return
  }

  $expectedPath = [IO.Path]::GetFullPath([string]$ProcessState.path)
  $actualPath = [IO.Path]::GetFullPath($process.Path)
  $expectedStart = [DateTime]::Parse([string]$ProcessState.startedAt).ToUniversalTime()
  $actualStart = $process.StartTime.ToUniversalTime()
  if ($actualPath -ne $expectedPath -or [Math]::Abs(($actualStart - $expectedStart).TotalSeconds) -gt 1) {
    throw "Refusing to stop PID $($ProcessState.pid) because it no longer matches the tracked $Label process."
  }

  Stop-Process -Id $process.Id -Force
  Write-Host "$Label stopped."
}

Stop-TrackedProcess -ProcessState $state.ngrok -Label 'ngrok'
Stop-TrackedProcess -ProcessState $state.worker -Label 'Local Worker'

$resolvedRuntime = [IO.Path]::GetFullPath($runtimeDir).TrimEnd('\') + '\'
$resolvedState = [IO.Path]::GetFullPath($statePath)
if (-not $resolvedState.StartsWith($resolvedRuntime, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Runtime state path is outside the expected local runtime directory.'
}
Remove-Item -LiteralPath $resolvedState -Force
Write-Host 'Local POIZON runtime state cleared.'
