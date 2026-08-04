[CmdletBinding()]
param(
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$targetPath = Join-Path $repoRoot '.dev.vars'

if ((Test-Path -LiteralPath $targetPath) -and -not $Force) {
  $answer = Read-Host '.dev.vars already exists. Replace it? (y/N)'
  if ($answer -notmatch '^[Yy]$') {
    Write-Host 'No changes were made.'
    exit 0
  }
}

function Read-RequiredCredential {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Prompt
  )

  $secureValue = Read-Host $Prompt -AsSecureString
  [IntPtr]$buffer = [IntPtr]::Zero
  try {
    $buffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($buffer).Trim()
    if ([string]::IsNullOrWhiteSpace($plainValue)) {
      throw "$Prompt must not be empty."
    }
    if ($plainValue.Length -lt 8 -or $plainValue.Length -gt 512 -or $plainValue -match '\s') {
      throw "$Prompt format is invalid. Check that only the credential itself was pasted."
    }
    return $plainValue
  }
  finally {
    if ($buffer -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($buffer)
    }
  }
}

$appKey = $null
$appSecret = $null
$turnstileSecret = $null

try {
  Write-Host 'Enter each credential. Input is hidden and is never printed.'
  $appKey = Read-RequiredCredential 'POIZON App Key'
  $appSecret = Read-RequiredCredential 'POIZON App Secret'
  $turnstileSecret = Read-RequiredCredential 'Cloudflare Turnstile Secret Key'

  $quotedAppKey = $appKey | ConvertTo-Json -Compress
  $quotedAppSecret = $appSecret | ConvertTo-Json -Compress
  $quotedTurnstileSecret = $turnstileSecret | ConvertTo-Json -Compress
  $lines = @(
    "POIZON_APP_KEY=$quotedAppKey"
    "POIZON_APP_SECRET=$quotedAppSecret"
    "TURNSTILE_SECRET_KEY=$quotedTurnstileSecret"
  )
  [IO.File]::WriteAllLines($targetPath, $lines, [Text.UTF8Encoding]::new($false))
  Write-Host '.dev.vars was created locally. It is excluded from Git.'
}
finally {
  $appKey = $null
  $appSecret = $null
  $turnstileSecret = $null
}
