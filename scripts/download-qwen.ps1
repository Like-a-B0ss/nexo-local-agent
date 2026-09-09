param(
  [string]$ModelDirectory = 'A:\ollama-models',
  [string]$OllamaExecutable = 'A:\Ollama\ollama.exe'
)

$ErrorActionPreference = 'Stop'
$digest = '7f4030143c1c477224c5434f8272c662a8b042079a0a584f0a27a1684fe2e1fa'
$totalBytes = 522640096L
$chunkBytes = 20000000L
$downloadUrl = "https://registry.ollama.ai/v2/library/qwen3/blobs/sha256:$digest"
$partsDirectory = 'A:\nexo-qwen-parts'
$blobDirectory = Join-Path $ModelDirectory 'blobs'
$blobPath = Join-Path $blobDirectory "sha256-$digest"

New-Item -ItemType Directory -Force -Path $partsDirectory, $blobDirectory | Out-Null

$chunks = @()
for ($index = 0; ($index * $chunkBytes) -lt $totalBytes; $index++) {
  $start = $index * $chunkBytes
  $end = [Math]::Min($start + $chunkBytes - 1, $totalBytes - 1)
  $partPath = Join-Path $partsDirectory ('part-{0:D2}.bin' -f $index)
  $chunks += [pscustomobject]@{ Index = $index; Start = $start; End = $end; Size = $end - $start + 1; Path = $partPath }
}

for ($batchStart = 0; $batchStart -lt $chunks.Count; $batchStart += 6) {
  $batch = $chunks[$batchStart..([Math]::Min($batchStart + 5, $chunks.Count - 1))]
  $running = @()
  foreach ($chunk in $batch) {
    if ((Test-Path -LiteralPath $chunk.Path) -and (Get-Item -LiteralPath $chunk.Path).Length -eq $chunk.Size) { continue }
    $arguments = @('-sS', '-L', '--fail', '--retry', '8', '--retry-all-errors', '--range', "$($chunk.Start)-$($chunk.End)", '--output', $chunk.Path, $downloadUrl)
    $process = Start-Process -FilePath 'C:\Windows\System32\curl.exe' -ArgumentList $arguments -WindowStyle Hidden -PassThru
    $running += [pscustomobject]@{ Process = $process; Chunk = $chunk }
  }
  foreach ($item in $running) {
    $item.Process.WaitForExit()
    if ($item.Process.ExitCode -ne 0) { throw "Falha ao baixar o bloco $($item.Chunk.Index)." }
    $actualSize = (Get-Item -LiteralPath $item.Chunk.Path).Length
    if ($actualSize -ne $item.Chunk.Size) { throw "Tamanho incorreto no bloco $($item.Chunk.Index): $actualSize." }
  }
  Write-Host "Blocos concluídos: $([Math]::Min($batchStart + 6, $chunks.Count))/$($chunks.Count)"
}

if (Test-Path -LiteralPath $blobPath) {
  if ((Get-FileHash -LiteralPath $blobPath -Algorithm SHA256).Hash.ToLowerInvariant() -eq $digest) {
    Write-Host 'Blob já validado.'
  } else {
    throw "Já existe um blob inválido em $blobPath."
  }
} else {
  $output = [System.IO.File]::Open($blobPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
  try {
    foreach ($chunk in $chunks) {
      $input = [System.IO.File]::OpenRead($chunk.Path)
      try { $input.CopyTo($output) } finally { $input.Dispose() }
    }
  } finally { $output.Dispose() }
  $hash = (Get-FileHash -LiteralPath $blobPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $digest) { throw "SHA-256 inválido: $hash" }
  Write-Host "SHA-256 validado: $hash"
}

$env:OLLAMA_MODELS = $ModelDirectory
& $OllamaExecutable pull qwen3:0.6b
