[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SourceDirectory,
  [Parameter(Mandatory = $true)][string]$PublishRoot,
  [Parameter(Mandatory = $true)][ValidateSet('stable', 'beta')][string]$Channel,
  [Parameter(Mandatory = $true)][string]$Version,
  [Parameter(Mandatory = $true)][string]$SourceCommit,
  [Parameter(Mandatory = $true)][string]$PublicBaseUrl,
  [Parameter(Mandatory = $true)][string]$ExpectedSignerThumbprint,
  [Parameter(Mandatory = $true)][string]$ExpectedPublisher,
  [Parameter(Mandatory = $true)][string]$DraftEndpoint,
  [Parameter(Mandatory = $true)][string]$AutomationToken,
  [switch]$SkipSignatureVerification,
  [switch]$SkipRemoteVerification,
  [switch]$SkipDraftCreation
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Get-Base64Sha512([string]$Path) {
  $algorithm = [Security.Cryptography.SHA512]::Create()
  try {
    $stream = [IO.File]::OpenRead($Path)
    try { return [Convert]::ToBase64String($algorithm.ComputeHash($stream)) }
    finally { $stream.Dispose() }
  } finally { $algorithm.Dispose() }
}

function Get-LowerSha256([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-SafeChild([string]$Parent, [string]$Child) {
  $prefix = $Parent.TrimEnd('\') + '\'
  if (-not $Child.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Resolved path escaped the configured publish root: $Child"
  }
}

function Assert-IdenticalDirectory([string]$Existing, [string]$Candidate) {
  $left = @(Get-ChildItem -LiteralPath $Existing -File | Sort-Object Name)
  $right = @(Get-ChildItem -LiteralPath $Candidate -File | Sort-Object Name)
  if ($left.Count -ne $right.Count) { throw 'Published version exists with a different file set' }
  for ($i = 0; $i -lt $left.Count; $i++) {
    if ($left[$i].Name -ne $right[$i].Name -or
        (Get-LowerSha256 $left[$i].FullName) -ne (Get-LowerSha256 $right[$i].FullName)) {
      throw "Published version exists with different content: $($right[$i].Name)"
    }
  }
}

if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z]+(?:\.[0-9A-Za-z-]+)*)?$') {
  throw 'Version must be a semantic version'
}
if ($Channel -eq 'stable' -and $Version.Contains('-')) { throw 'Stable releases cannot use prerelease versions' }
if ($Channel -eq 'beta' -and $Version -notmatch '-beta(?:\.|$)') { throw 'Beta releases must use a beta prerelease version' }
if ($SourceCommit -notmatch '^[0-9a-fA-F]{40}$') { throw 'SourceCommit must be a full Git commit SHA' }
if ($AutomationToken.Length -lt 32) { throw 'AutomationToken must contain at least 32 characters' }

$source = [IO.Path]::GetFullPath($SourceDirectory)
$root = [IO.Path]::GetFullPath($PublishRoot)
$manifestName = if ($Channel -eq 'beta') { 'beta.yml' } else { 'latest.yml' }
$manifest = Join-Path $source $manifestName
if (-not (Test-Path -LiteralPath $manifest -PathType Leaf)) { throw "Required manifest is missing: $manifest" }

$manifestText = Get-Content -LiteralPath $manifest -Raw
$escapedVersion = [regex]::Escape($Version)
$versionPattern = "(?m)^version:\s*['`"]?$escapedVersion['`"]?\s*$"
if ($manifestText -notmatch $versionPattern) {
  throw "Manifest version does not match $Version"
}
$installerMatch = [regex]::Match($manifestText, '(?m)^\s*-\s*url:\s*["'']?(?<name>[^"''\r\n]+\.exe)["'']?\s*$')
if (-not $installerMatch.Success) { throw 'Manifest does not contain an EXE path' }
$installerName = $installerMatch.Groups['name'].Value.Trim()
if ([IO.Path]::GetFileName($installerName) -ne $installerName -or
    $installerName -notmatch '^[A-Za-z0-9._()\- ]{1,200}\.exe$') {
  throw 'Manifest installer path must be a safe EXE basename'
}
$installer = Join-Path $source $installerName
$blockmap = "$installer.blockmap"
foreach ($path in @($installer, $blockmap)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required release file is missing: $path" }
}

$installerInfo = Get-Item -LiteralPath $installer
$installerSha512 = Get-Base64Sha512 $installerInfo.FullName
$escapedInstallerName = [regex]::Escape($installerName)
$escapedInstallerDigest = [regex]::Escape($installerSha512)
$fileEntryPattern = "(?m)^\s*-\s*url:\s*['`"]?$escapedInstallerName['`"]?\s*\r?\n\s*sha512:\s*$escapedInstallerDigest\s*\r?\n\s*size:\s*$($installerInfo.Length)\s*$"
if ($manifestText -notmatch $fileEntryPattern) {
  throw 'Installer file entry does not match the update manifest'
}
$primaryPathPattern = "(?m)^path:\s*['`"]?$escapedInstallerName['`"]?\s*\r?\nsha512:\s*$escapedInstallerDigest\s*$"
if ($manifestText -notmatch $primaryPathPattern) {
  throw 'Manifest primary path or SHA512 does not match the installer'
}
if (-not $SkipSignatureVerification) {
  $signature = Get-AuthenticodeSignature -LiteralPath $installerInfo.FullName
  $expectedThumbprint = ($ExpectedSignerThumbprint -replace '\s', '').ToUpperInvariant()
  if ($signature.Status -ne 'Valid') { throw "Invalid installer signature: $($signature.Status)" }
  if (-not $signature.TimeStamperCertificate) { throw 'Installer signature is not timestamped' }
  if ($signature.SignerCertificate.Thumbprint.ToUpperInvariant() -ne $expectedThumbprint) { throw 'Installer signer thumbprint mismatch' }
  if ($signature.SignerCertificate.Subject -notlike "*$ExpectedPublisher*") { throw 'Installer publisher mismatch' }
}

$versionDirectory = [IO.Path]::GetFullPath((Join-Path $root "$Channel\$Version"))
$finalDirectory = [IO.Path]::GetFullPath((Join-Path $versionDirectory 'win-x64'))
$stageVersionDirectory = [IO.Path]::GetFullPath((Join-Path $root ".staging\$([guid]::NewGuid().ToString('N'))"))
$stageDirectory = Join-Path $stageVersionDirectory 'win-x64'
Assert-SafeChild $root $versionDirectory
Assert-SafeChild $root $finalDirectory
Assert-SafeChild $root $stageVersionDirectory

New-Item -ItemType Directory -Path $stageDirectory -Force | Out-Null
$publishedNow = $false
try {
  Copy-Item -LiteralPath $installer, $blockmap, $manifest -Destination $stageDirectory
  if (Test-Path -LiteralPath $versionDirectory) {
    if (-not (Test-Path -LiteralPath $finalDirectory -PathType Container)) {
      throw 'Published version path exists but is incomplete'
    }
    Assert-IdenticalDirectory $finalDirectory $stageDirectory
  } else {
    $channelDirectory = Join-Path $root $Channel
    New-Item -ItemType Directory -Path $channelDirectory -Force | Out-Null
    Move-Item -LiteralPath $stageVersionDirectory -Destination $versionDirectory
    $publishedNow = $true
  }
} finally {
  if (Test-Path -LiteralPath $stageVersionDirectory) {
    Assert-SafeChild $root $stageVersionDirectory
    Remove-Item -LiteralPath $stageVersionDirectory -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$manifestDigest = Get-LowerSha256 $manifest
$verifiedAt = [DateTimeOffset]::UtcNow.ToString('o')
if (-not $SkipRemoteVerification) {
  $baseUri = [Uri]$PublicBaseUrl
  if ($baseUri.Scheme -ne 'https') { throw 'PublicBaseUrl must use HTTPS' }
  $expectedPath = "/downloads/arttalk/$Channel/$Version/win-x64/"
  if ($baseUri.AbsolutePath -ne $expectedPath) { throw "PublicBaseUrl must use immutable path $expectedPath" }
  $verificationDirectory = [IO.Path]::GetFullPath((Join-Path $root ".verification\$([guid]::NewGuid().ToString('N'))"))
  Assert-SafeChild $root $verificationDirectory
  New-Item -ItemType Directory -Path $verificationDirectory -Force | Out-Null
  try {
    foreach ($file in @($installerInfo, (Get-Item -LiteralPath $blockmap), (Get-Item -LiteralPath $manifest))) {
      $remote = [Uri]::new($baseUri, $file.Name)
      $downloaded = Join-Path $verificationDirectory $file.Name
      Invoke-WebRequest -Uri $remote -Method Get -OutFile $downloaded -UseBasicParsing
      if ((Get-LowerSha256 $downloaded) -ne (Get-LowerSha256 $file.FullName)) {
        throw "HTTPS read-back digest mismatch: $($file.Name)"
      }
    }
  } finally {
    if (Test-Path -LiteralPath $verificationDirectory) {
      Assert-SafeChild $root $verificationDirectory
      Remove-Item -LiteralPath $verificationDirectory -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
  $verifiedAt = [DateTimeOffset]::UtcNow.ToString('o')
}

if (-not $SkipDraftCreation) {
  $draftUri = [Uri]$DraftEndpoint
  if ($draftUri.Scheme -ne 'https' -or $draftUri.AbsolutePath -ne '/api/internal/client-release-drafts') {
    throw 'DraftEndpoint must be the HTTPS internal release draft endpoint'
  }
  $payload = [ordered]@{
    version = $Version
    channel = $Channel
    platform = 'win32'
    arch = 'x64'
    updateBaseUrl = $PublicBaseUrl
    manifestName = $manifestName
    manifestDigest = $manifestDigest
    installerName = $installerName
    installerSize = $installerInfo.Length
    installerSha512 = $installerSha512
    sourceCommit = $SourceCommit.ToLowerInvariant()
    signerThumbprint = ($ExpectedSignerThumbprint -replace '\s', '').ToUpperInvariant()
    artifactVerifiedAt = $verifiedAt
  }
  Invoke-RestMethod -Uri $draftUri -Method Post -ContentType 'application/json' `
    -Headers @{ 'X-Release-Automation-Token' = $AutomationToken } `
    -Body ($payload | ConvertTo-Json -Depth 5) | Out-Null
}

$action = if ($publishedNow) { 'Published' } else { 'Verified existing immutable release' }
Write-Output "$action ArtTalk $Version at $finalDirectory and synchronized its approval draft."
