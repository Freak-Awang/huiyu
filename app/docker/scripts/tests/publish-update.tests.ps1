$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$publishScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\publish-update.ps1'))
$testRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) "arttalk-publish-tests-$([guid]::NewGuid().ToString('N'))"))
$tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (-not $testRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test directory' }

function Get-Sha512([string]$Path) {
  $algorithm = [Security.Cryptography.SHA512]::Create()
  try { return [Convert]::ToBase64String($algorithm.ComputeHash([IO.File]::ReadAllBytes($Path))) }
  finally { $algorithm.Dispose() }
}

function New-Fixture([string]$Name, [byte]$Content = 7) {
  $source = Join-Path $testRoot "$Name\source"
  $publish = Join-Path $testRoot "$Name\publish"
  New-Item -ItemType Directory -Path $source, $publish -Force | Out-Null
  $installerName = 'ArtTalk-Setup-0.0.9-x64.exe'
  $installer = Join-Path $source $installerName
  [IO.File]::WriteAllBytes($installer, [byte[]]($Content, ($Content + 1), ($Content + 2)))
  [IO.File]::WriteAllBytes("$installer.blockmap", [byte[]](1, 2, 3, 4))
  Write-Manifest $source
  return @{ Source = $source; Publish = $publish }
}

function Write-Manifest([string]$Source, [string]$Digest = '') {
  $installerName = 'ArtTalk-Setup-0.0.9-x64.exe'
  $installer = Join-Path $Source $installerName
  $sha = if ($Digest) { $Digest } else { Get-Sha512 $installer }
  $size = (Get-Item -LiteralPath $installer).Length
  $manifest = @"
version: 0.0.9
files:
  - url: $installerName
    sha512: $sha
    size: $size
path: $installerName
sha512: $sha
releaseDate: '2026-08-06T00:00:00.000Z'
"@
  [IO.File]::WriteAllText((Join-Path $Source 'latest.yml'), $manifest, [Text.UTF8Encoding]::new($false))
}

function Invoke-TestPublish($Fixture, [switch]$VerifySignature, [string]$Version = '0.0.9') {
  $parameters = @{
    SourceDirectory = $Fixture.Source
    PublishRoot = $Fixture.Publish
    Channel = 'stable'
    Version = $Version
    SourceCommit = 'a' * 40
    PublicBaseUrl = 'https://im.example.test/downloads/arttalk/stable/0.0.9/win-x64/'
    ExpectedSignerThumbprint = 'B' * 40
    ExpectedPublisher = 'ArtTalk'
    DraftEndpoint = 'https://im.example.test/api/internal/client-release-drafts'
    AutomationToken = 'test-only-release-automation-token-32'
    SkipRemoteVerification = $true
    SkipDraftCreation = $true
  }
  if (-not $VerifySignature) { $parameters.SkipSignatureVerification = $true }
  & $publishScript @parameters | Out-Null
}

function Assert-Fails([scriptblock]$Action, [string]$Pattern) {
  try { & $Action; throw "Expected failure matching $Pattern" }
  catch {
    if ($_.Exception.Message -notmatch $Pattern) { throw "Unexpected failure: $($_.Exception.Message)" }
  }
}

New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
  $success = New-Fixture 'success'
  Invoke-TestPublish $success
  Invoke-TestPublish $success
  $finalFiles = @(Get-ChildItem -LiteralPath (Join-Path $success.Publish 'stable\0.0.9\win-x64') -File)
  if ($finalFiles.Count -ne 3 -or 'latest.yml' -notin $finalFiles.Name) { throw 'Atomic version directory is incomplete' }

  Assert-Fails { Invoke-TestPublish $success -Version "0.0.9';bad" } 'semantic version'

  $missing = New-Fixture 'missing'
  Remove-Item -LiteralPath (Join-Path $missing.Source 'ArtTalk-Setup-0.0.9-x64.exe.blockmap') -Force
  Assert-Fails { Invoke-TestPublish $missing } 'Required release file is missing'

  $digest = New-Fixture 'digest'
  Write-Manifest $digest.Source ('A' * 86 + '==')
  Assert-Fails { Invoke-TestPublish $digest } 'file entry does not match'

  $signature = New-Fixture 'signature'
  Assert-Fails { Invoke-TestPublish $signature -VerifySignature } 'Invalid installer signature'

  [IO.File]::WriteAllBytes((Join-Path $success.Source 'ArtTalk-Setup-0.0.9-x64.exe'), [byte[]](9, 8, 7))
  Write-Manifest $success.Source
  Assert-Fails { Invoke-TestPublish $success } 'different content'

  Write-Output 'publish-update.ps1 tests passed: validation, signature gate, immutable duplicate handling, and atomic readiness.'
} finally {
  if ($testRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
