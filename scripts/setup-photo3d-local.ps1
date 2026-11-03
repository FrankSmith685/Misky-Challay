param([switch]$SkipWeights, [ValidateSet('triposr','sf3d','hunyuanmini')][string]$Engine = 'triposr')
$ErrorActionPreference = 'Stop'
$photoWorkspace = Split-Path -Parent $PSScriptRoot
$photoRoot = Join-Path $photoWorkspace 'backend/tmp/photo-3d'
$photoBootstrap = Join-Path $photoRoot 'bootstrap'
$photoUv = Join-Path $photoBootstrap 'uv/uv.exe'
$photoEnvironment = @{triposr='venv';sf3d='venv-sf3d';hunyuanmini='venv-hunyuan'}[$Engine]
$photoPython = Join-Path $photoRoot "$photoEnvironment/Scripts/python.exe"
$photoRepositoryName = @{triposr='TripoSR';sf3d='stable-fast-3d';hunyuanmini='Hunyuan3D-2'}[$Engine]
$photoRepository = Join-Path $photoRoot $photoRepositoryName
$photoRevision = @{triposr='107cefdc244c39106fa830359024f6a2f1c78871';sf3d='ff21fc491b4dc5314bf6734c7c0dabd86b5f5bb2';hunyuanmini='f8db63096c8282cb27354314d896feba5ba6ff8a'}[$Engine]
$photoRemote = @{triposr='https://github.com/VAST-AI-Research/TripoSR.git';sf3d='https://github.com/Stability-AI/stable-fast-3d.git';hunyuanmini='https://github.com/Tencent-Hunyuan/Hunyuan3D-2.git'}[$Engine]
New-Item -ItemType Directory -Path $photoBootstrap -Force | Out-Null
$photoTemporary = Join-Path $photoRoot 'install-tmp'
New-Item -ItemType Directory -Path $photoTemporary -Force | Out-Null
$env:TEMP = $photoTemporary
$env:TMP = $photoTemporary
$env:UV_CACHE_DIR = Join-Path $photoRoot 'uv-cache'
$env:UV_PYTHON_INSTALL_DIR = Join-Path $photoRoot 'python'
$env:UV_PYTHON_BIN_DIR = Join-Path $photoRoot 'bin'
$env:UV_HTTP_TIMEOUT = '180'

if (-not (Test-Path -LiteralPath $photoUv)) {
    $photoArchive = Join-Path $photoBootstrap 'uv.zip'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/astral-sh/uv/releases/download/0.13.6/uv-x86_64-pc-windows-msvc.zip' -OutFile $photoArchive -TimeoutSec 180
    Expand-Archive -LiteralPath $photoArchive -DestinationPath (Join-Path $photoBootstrap 'uv') -Force
}
& $photoUv python install 3.11
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar Python local' }
if (-not (Test-Path -LiteralPath $photoPython)) {
    & $photoUv venv --python 3.11 (Join-Path $photoRoot $photoEnvironment)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar el entorno Python' }
}
if (-not (Test-Path -LiteralPath (Join-Path $photoRepository '.git'))) {
    if ($Engine -eq 'hunyuanmini') {
        git clone --filter=blob:none --sparse $photoRemote $photoRepository
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo descargar Hunyuan Mini' }
        git -C $photoRepository sparse-checkout set hy3dgen/shapegen
    } else { git clone $photoRemote $photoRepository }
    if ($LASTEXITCODE -ne 0) { throw "No se pudo descargar el codigo de $Engine" }
    git -C $photoRepository checkout $photoRevision
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo fijar la versión de TripoSR' }
}
$photoActualRevision = git -C $photoRepository rev-parse HEAD
if ($photoActualRevision -ne $photoRevision) { throw "La copia de $Engine tiene otra revision. Revisala antes de continuar." }
$photoTorchPackages = @('torch==2.5.1')
if ($Engine -ne 'triposr') { $photoTorchPackages += 'torchvision==0.20.1' }
& $photoUv pip install --python $photoPython --index-url 'https://download.pytorch.org/whl/cu118' @photoTorchPackages
if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar PyTorch CUDA' }
$photoRequirements = @{triposr='backend/tools/photo3d/requirements.txt';sf3d='backend/tools/photo3d/requirements-sf3d.txt';hunyuanmini='backend/tools/photo3d/requirements-hunyuan.txt'}[$Engine]
& $photoUv pip install --python $photoPython --index-url 'https://pypi.org/simple' -r (Join-Path $photoWorkspace $photoRequirements)
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias de reconstrucción' }
if (-not $SkipWeights) {
    $photoPrepare = @{triposr='backend/tools/photo3d/prepare.py';sf3d='backend/tools/photo3d/prepare_sf3d.py';hunyuanmini='backend/tools/photo3d/prepare_hunyuan.py'}[$Engine]
    & $photoPython (Join-Path $photoWorkspace $photoPrepare)
    if ($LASTEXITCODE -ne 0) { throw 'No se pudieron descargar los pesos del motor local' }
}
Write-Output 'Entorno local preparado. Inicia el motor con scripts/start-photo3d-local.ps1.'
