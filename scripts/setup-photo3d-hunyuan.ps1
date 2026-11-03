param([switch]$SkipWeights)
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'setup-photo3d-local.ps1') -Engine hunyuanmini -SkipWeights:$SkipWeights
exit $LASTEXITCODE
