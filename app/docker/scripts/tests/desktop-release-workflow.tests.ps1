$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$workflowPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\..\.github\workflows\desktop-release.yml'))
$workflow = Get-Content -LiteralPath $workflowPath -Raw

foreach ($required in @(
  'environment: desktop-signing',
  'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
  'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
  'EXPECTED_SIGNER_THUMBPRINT',
  'release-provenance.json',
  'origin/main'
)) {
  if (-not $workflow.Contains($required)) { throw "Workflow safeguard is missing: $required" }
}
if ($workflow -notmatch "(?m)^\s*tags:\s*\r?$" -or $workflow -notmatch "(?m)^\s*- 'v\*\.\*\.\*'\s*\r?$") {
  throw 'Workflow tag trigger is missing'
}
if ($workflow -match 'actions/(checkout|setup-node|upload-artifact)@v\d') {
  throw 'Third-party actions must be pinned to complete commit SHAs'
}
if ($workflow -match 'npm\s+version') { throw 'The release workflow must not mutate package versions' }
if ([regex]::Matches($workflow, '\$\{\{[^}\r\n]*inputs\.').Count -ne 1) {
  throw 'Workflow inputs must only enter the sanitized RELEASE_TAG environment boundary'
}
foreach ($removedUpdateConcern in @(
  'ARTTALK_UPDATE_BASE_URL',
  'INTERNAL_APP_ORIGIN',
  'RELEASE_AUTOMATION_TOKEN',
  'RELEASE_DRAFT_ENDPOINT',
  'UPDATE_PUBLISH_ROOT',
  'publish-update.ps1',
  'latest.yml',
  'beta.yml'
)) {
  if ($workflow.Contains($removedUpdateConcern)) {
    throw "Online-update publishing concern remains in desktop packaging workflow: $removedUpdateConcern"
  }
}

$valid = '^v(?<version>(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z]+(?:\.[0-9A-Za-z-]+)*)?)$'
foreach ($tag in @('v0.0.9', 'v0.0.9-beta.1', 'v0.0.9-rc.1')) {
  if ($tag -notmatch $valid) { throw "Expected valid release tag was rejected: $tag" }
}
foreach ($tag in @("v0.0.9';Write-Host injected", 'v01.0.0', '0.0.9')) {
  if ($tag -match $valid) { throw "Unsafe release tag was accepted: $tag" }
}

Write-Output 'desktop-release.yml tests passed: signed packaging, tag validation, action pinning, and immutable provenance.'
