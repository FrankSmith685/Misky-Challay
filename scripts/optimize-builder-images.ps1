param(
  [string]$GeneratedRoot = 'C:\Users\pc\.codex\generated_images\019f779b-a98d-7d50-acbd-bd51ff71564b',
  [string]$OutputRoot = "$PSScriptRoot\..\frontend\public\images\builder\ingredients"
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null

$assets = [ordered]@{
  'exec-ee1c8b4e-de11-43d1-b914-7edc3d99db84.png' = 'arroz-blanco.jpg'
  'exec-1a0773e9-a553-4fbe-8003-92165842ed4f.png' = 'arroz-integral.jpg'
  'exec-f00cd3d0-2a51-4b43-8b19-239d373f7222.png' = 'quinoa.jpg'
  'exec-66d83e10-a0b1-438f-ad31-c0a7016c0485.png' = 'hojas-verdes.jpg'
  'exec-14f28188-3656-4a23-8f67-cb9a60fa3de4.png' = 'mitad-arroz-hojas.jpg'
  'exec-1a476a84-ba9a-4a3a-b908-8e184b2168b9.png' = 'pollo-grillado.jpg'
  'exec-12240708-640f-4582-875a-f51a44951890.png' = 'tofu-marinado.jpg'
  'exec-480e6d34-8c15-4062-86e2-3c7775740e07.png' = 'garbanzos-especiados.jpg'
  'exec-d921189b-5c1e-4814-9e84-bae6e11e2774.png' = 'salmon-fresco.jpg'
  'exec-582fe963-ad3e-4e38-a2f8-808b3616d8a0.png' = 'atun-fresco.jpg'
  'exec-e7a7e312-c26e-486f-8b5f-677f49970352.png' = 'langostinos.jpg'
  'exec-04793d0c-105b-4b10-90d2-05d385bab105.png' = 'ponzu.jpg'
  'exec-a35622c9-3b9a-4c56-b401-554ab76d5a19.png' = 'sriracha-mayo.jpg'
  'exec-b327ec86-0dc2-49a9-bc8c-4b9e9acef9da.png' = 'teriyaki.jpg'
  'exec-886741e0-f22a-4d3d-8c2b-8599cf57984e.png' = 'hummus.jpg'
  'exec-c4924595-6889-4002-a6fb-15edee1d527e.png' = 'yogurt-limon.jpg'
  'exec-a7a69c66-1153-4f78-af22-666592fdc585.png' = 'aceite-oliva-limon.jpg'
  'exec-a22f1e35-abd0-4cf2-97f9-048a00de09ee.png' = 'palta.jpg'
  'exec-c60c7eff-16c9-4408-a093-4623bc019fe1.png' = 'edamame.jpg'
  'exec-8cd1a521-2c83-4fba-a942-b495e13510d5.png' = 'mango.jpg'
  'exec-6db3e2f9-21db-4781-a3a5-4854ee265bf0.png' = 'pepino.jpg'
  'exec-3f87e467-65ae-44c1-823d-fdba59b22e2c.png' = 'zanahoria-rallada.jpg'
  'exec-5cb4d0b1-67e3-48c0-b908-f9284b40108e.png' = 'tomate-cherry.jpg'
  'exec-9ebdc170-9e53-42bc-a4fb-32dc33513d9a.png' = 'choclo.jpg'
  'exec-7931366d-a91b-4307-9512-89e42a99dd15.png' = 'algas-wakame.jpg'
  'exec-f23254ec-c299-4f57-85dc-7fa036117a85.png' = 'kale.jpg'
  'exec-e51d83e7-d4f1-42e8-aaa4-770ad63b9c12.png' = 'camote-horno.jpg'
  'exec-17b51ccc-dd0b-4379-8c6e-357d4ba92b0e.png' = 'ajonjoli-tostado.jpg'
  'exec-3bf0163b-9a00-43c9-8493-8eeed9b0a94b.png' = 'mani-crocante.jpg'
  'exec-c78cee53-ab57-401f-961d-95ad2eb786ec.png' = 'cebolla-crispy.jpg'
  'exec-6db032d1-3b8b-447e-a412-c05e190f86bd.png' = 'chips-wonton.jpg'
  'exec-9e6e1ad9-2e17-4bd9-be04-331ea15ccf46.png' = 'furikake.jpg'
}

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' }
$encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  [System.Drawing.Imaging.Encoder]::Quality,
  [long]84
)

foreach ($entry in $assets.GetEnumerator()) {
  $source = Join-Path $GeneratedRoot $entry.Key
  $target = Join-Path $OutputRoot $entry.Value
  if (-not (Test-Path -LiteralPath $source)) { throw "No existe el original: $source" }

  $original = [System.Drawing.Image]::FromFile($source)
  try {
    $canvas = New-Object System.Drawing.Bitmap(700, 700)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($original, 0, 0, 700, 700)
      } finally { $graphics.Dispose() }
      $canvas.Save($target, $jpegCodec, $encoderParameters)
    } finally { $canvas.Dispose() }
  } finally { $original.Dispose() }
}

$totalBytes = (Get-ChildItem -LiteralPath $OutputRoot -Filter '*.jpg' | Measure-Object Length -Sum).Sum
Write-Output "Optimized $($assets.Count) assets ($([math]::Round($totalBytes / 1MB, 2)) MB) -> $OutputRoot"
