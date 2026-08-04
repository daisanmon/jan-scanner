[CmdletBinding()]
param(
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runtimeDir = Join-Path $repoRoot '.local-runtime'
$configPath = Join-Path $runtimeDir 'ngrok.yml'
$ngrokPath = Join-Path $repoRoot '.local-tools\ngrok\ngrok.exe'

if (-not (Test-Path -LiteralPath $ngrokPath)) {
  throw 'Missing ngrok. Install the project-local ngrok CLI first.'
}
if ((Test-Path -LiteralPath $configPath) -and -not $Force) {
  $answer = Read-Host 'A local ngrok configuration already exists. Replace it? (y/N)'
  if ($answer -notmatch '^[Yy]$') {
    Write-Host 'No changes were made.'
    exit 0
  }
}

$secureToken = Read-Host 'Paste the ngrok Authtoken (input is hidden)' -AsSecureString
[IntPtr]$buffer = [IntPtr]::Zero
$token = $null

try {
  $buffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($buffer).Trim()
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw 'The ngrok Authtoken must not be empty.'
  }
  if ($token.Length -lt 20 -or $token.Length -gt 512 -or $token -match '\s') {
    throw 'The ngrok Authtoken format is invalid. Copy only the token value.'
  }

  New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
  $quotedToken = $token | ConvertTo-Json -Compress
  $configLines = @(
    'version: 3'
    'agent:'
    "  authtoken: $quotedToken"
  )
  [IO.File]::WriteAllLines($configPath, $configLines, [Text.UTF8Encoding]::new($false))
  & $ngrokPath config check --config $configPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'ngrok rejected the local configuration.'
  }
  Write-Host 'The ngrok Authtoken was saved in a Git-ignored local configuration.'
}
finally {
  $token = $null
  if ($buffer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($buffer)
  }
}
