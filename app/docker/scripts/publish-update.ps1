param(
  [Parameter(Mandatory = $true)][string]$SourceDirectory,
  [Parameter(Mandatory = $true)][string]$PublishRoot,
  [Parameter(Mandatory = $true)][ValidateSet('stable', 'beta')][string]$Channel,
  [Parameter(Mandatory = $true)][string]$Version
)

$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath($SourceDirectory)
$root = [IO.Path]::GetFullPath($PublishRoot)
$manifestName = if ($Channel -eq 'beta') { 'beta.yml' } else { 'latest.yml' }
$manifest = Join-Path $source $manifestName
$installer = Join-Path $source "ArtTalk Setup $Version.exe"
$blockmap = "$installer.blockmap"

foreach ($path in @($manifest, $installer, $blockmap)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required release file is missing: $path" }
}

$manifestText = Get-Content -LiteralPath $manifest -Raw
$escapedVersion = [regex]::Escape($Version)
if ($manifestText -notmatch "(?m)^version:\s*$escapedVersion\s*$") {
  throw "Manifest version does not match $Version"
}

$sha512Algorithm = [Security.Cryptography.SHA512]::Create()
try {
  $sha512 = [Convert]::ToBase64String($sha512Algorithm.ComputeHash([IO.File]::ReadAllBytes($installer)))
} finally {
  $sha512Algorithm.Dispose()
}
if ($manifestText -notmatch [regex]::Escape($sha512)) { throw 'Installer SHA512 does not match the update manifest' }

$finalDirectory = [IO.Path]::GetFullPath((Join-Path $root "$Channel\win-x64"))
$stage = [IO.Path]::GetFullPath((Join-Path $root ".staging\$([guid]::NewGuid().ToString('N'))"))
$rootPrefix = $root.TrimEnd('\') + '\'
if (-not $finalDirectory.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    -not $stage.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Resolved publish paths escaped the configured update root'
}

New-Item -ItemType Directory -Force -Path $stage, $finalDirectory | Out-Null
try {
  Copy-Item -LiteralPath $installer, $blockmap, $manifest -Destination $stage
  foreach ($name in @([IO.Path]::GetFileName($installer), [IO.Path]::GetFileName($blockmap))) {
    $temporary = Join-Path $finalDirectory "$name.uploading"
    Copy-Item -LiteralPath (Join-Path $stage $name) -Destination $temporary -Force
    Move-Item -LiteralPath $temporary -Destination (Join-Path $finalDirectory $name) -Force
  }
  $manifestTemporary = Join-Path $finalDirectory "$manifestName.uploading"
  Copy-Item -LiteralPath (Join-Path $stage $manifestName) -Destination $manifestTemporary -Force
  Move-Item -LiteralPath $manifestTemporary -Destination (Join-Path $finalDirectory $manifestName) -Force
} finally {
  if ($stage.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Output "Published ArtTalk $Version to $finalDirectory; $manifestName was switched last."
