param([switch]$SkipWeights)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'setup-photo3d-local.ps1') -Engine sf3d -SkipWeights:$SkipWeights
exit $LASTEXITCODE
