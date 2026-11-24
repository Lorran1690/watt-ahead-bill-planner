# Converte o PNG do projeto num .ico Windows, sem instalar programas extras.
$ErrorActionPreference = 'Stop'
$pngPath = Join-Path $PSScriptRoot '..\..\public\voltara-icon-192.png'
$icoPath = Join-Path $PSScriptRoot 'voltara.ico'
$png = [System.IO.File]::ReadAllBytes((Resolve-Path $pngPath))
$stream = [System.IO.File]::Create($icoPath)
try {
  $writer = [System.IO.BinaryWriter]::new($stream)
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]1)
  $writer.Write([byte]192)
  $writer.Write([byte]192)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]32)
  $writer.Write([UInt32]$png.Length)
  $writer.Write([UInt32]22)
  $writer.Write($png)
  $writer.Flush()
} finally {
  $writer.Dispose()
  $stream.Dispose()
}
Write-Host "Icone criado: $icoPath"
