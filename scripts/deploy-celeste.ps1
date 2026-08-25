# Wrapper Windows. A esteira autoritativa e scripts/deploy-celeste.js.
$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $RepoRoot
& node.exe scripts/deploy-celeste.js
if ($LASTEXITCODE -ne 0) {
  throw "Deploy Celeste bloqueado (codigo $LASTEXITCODE)"
}
