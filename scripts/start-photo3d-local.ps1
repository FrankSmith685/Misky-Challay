param([ValidateSet('auto', 'cuda', 'cpu')][string]$Device = 'auto', [ValidateSet(96,128,160,192,256)][int]$Resolution = 192, [ValidateSet(0,512,1024,2048)][int]$TextureResolution = 1024, [ValidateRange(1024,65535)][int]$Port = 8091, [ValidateSet('triposr','sf3d','hunyuanmini')][string]$Engine = 'triposr', [ValidateSet(6,8,12,16)][int]$Steps = 8)
$ErrorActionPreference = 'Stop'
$photoWorkspace = Split-Path -Parent $PSScriptRoot
$photoEnvPath = Join-Path $photoWorkspace 'backend/.env'
if (Test-Path -LiteralPath $photoEnvPath) {
    $photoSettings = Get-Content -LiteralPath $photoEnvPath -Raw
    if (-not $PSBoundParameters.ContainsKey('Engine') -and $photoSettings -match '(?m)^CAKE_3D_PROVIDER\s*=\s*["'']?(sf3d|hunyuanmini)["'']?\s*$') { $Engine = $Matches[1] }
    $photoPrefix = @{triposr='TRIPOSR';sf3d='SF3D';hunyuanmini='HUNYUAN_MINI'}[$Engine]
    if (-not $PSBoundParameters.ContainsKey('Port') -and $photoSettings -match ('(?m)^' + $photoPrefix + '_3D_URL\s*=\s*["'']?(https?://[^\s"'']+)')) {
        $photoUrl = [uri]$Matches[1]
        if ($photoUrl.Host -notin '127.0.0.1','localhost','::1' -or $photoUrl.Scheme -ne 'http') { throw "El lanzador local necesita ${photoPrefix}_3D_URL con HTTP y direccion local." }
        $Port = $photoUrl.Port
        if ($Port -lt 1024 -or $Port -gt 65535) { throw 'El puerto local del motor no es valido.' }
    }
    if ($Engine -ne 'sf3d' -and -not $PSBoundParameters.ContainsKey('Resolution') -and $photoSettings -match ('(?m)^' + $photoPrefix + '_3D_RESOLUTION\s*=\s*["'']?(\d+)')) {
        $Resolution = [int]$Matches[1]
        if ($Resolution -notin 96,128,160,192,256) { throw "${photoPrefix}_3D_RESOLUTION no es valida." }
    }
    if (-not $PSBoundParameters.ContainsKey('TextureResolution') -and $photoSettings -match ('(?m)^' + $photoPrefix + '_3D_TEXTURE_RESOLUTION\s*=\s*["'']?(\d+)')) {
        $TextureResolution = [int]$Matches[1]
        if ($TextureResolution -notin 0,512,1024,2048) { throw "${photoPrefix}_3D_TEXTURE_RESOLUTION no es valida." }
    }
    if ($Engine -eq 'hunyuanmini' -and -not $PSBoundParameters.ContainsKey('Steps') -and $photoSettings -match '(?m)^HUNYUAN_MINI_3D_STEPS\s*=\s*["'']?(\d+)') {
        $Steps = [int]$Matches[1]
        if ($Steps -notin 6,8,12,16) { throw 'HUNYUAN_MINI_3D_STEPS no es valido.' }
    }
}
$photoEnvironment = @{triposr='venv';sf3d='venv-sf3d';hunyuanmini='venv-hunyuan'}[$Engine]
$photoPython = Join-Path $photoWorkspace "backend/tmp/photo-3d/$photoEnvironment/Scripts/python.exe"
$photoTemporary = Join-Path $photoWorkspace 'backend/tmp/photo-3d/install-tmp'
New-Item -ItemType Directory -Path $photoTemporary -Force | Out-Null
$env:TEMP = $photoTemporary
$env:TMP = $photoTemporary
if (-not (Test-Path -LiteralPath $photoPython)) { throw 'Primero ejecuta scripts/setup-photo3d-local.ps1.' }
& $photoPython (Join-Path $photoWorkspace 'backend/tools/photo3d/server.py') --engine $Engine --device $Device --port $Port --resolution $Resolution --texture-resolution $TextureResolution --steps $Steps
exit $LASTEXITCODE
