param(
  [ValidateSet('deploy', 'validate-production', 'validate-configuration')]
  [string]$Action = 'deploy'
)

$ErrorActionPreference = 'Stop'

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$packageFile = Join-Path $projectRoot 'package.json'
if (-not (Test-Path -LiteralPath $packageFile)) {
  throw "package.json nao encontrado em $projectRoot"
}
$package = Get-Content -LiteralPath $packageFile -Raw | ConvertFrom-Json
if ($package.name -ne 'celeste') { throw "Projeto inesperado: $($package.name)" }

$nodeCommand = if ($env:CELESTE_NODE_HOME) {
  Get-Item -LiteralPath (Join-Path $env:CELESTE_NODE_HOME 'node.exe') -ErrorAction SilentlyContinue
} else {
  Get-Command node.exe -ErrorAction SilentlyContinue
}
if (-not $nodeCommand) { throw 'Node.js nao foi encontrado.' }
$nodeExecutable = if ($nodeCommand.Source) { $nodeCommand.Source } else { $nodeCommand.FullName }
$nodeMajor = [int](& $nodeExecutable -p "Number(process.versions.node.split('.')[0])")
if ($nodeMajor -lt 20 -or $nodeMajor -gt 25) {
  throw "Celeste exige Node 20 a 25; encontrado Node $nodeMajor."
}
$nodeHome = Split-Path -Parent $nodeExecutable

$env:Path = "$nodeHome;$env:Path"
$env:CI = '1'
if (
  $env:CELESTE_PYTHON_PACKAGES -and
  (Test-Path -LiteralPath $env:CELESTE_PYTHON_PACKAGES)
) {
  $env:PYTHONPATH = $env:CELESTE_PYTHON_PACKAGES
}

$preferredDriveReady = Test-Path -LiteralPath 'D:\' -PathType Container -ErrorAction SilentlyContinue
$tempBase = if ($preferredDriveReady) { 'D:\Temp\User' } else { [System.IO.Path]::GetTempPath() }
$tempRoot = Join-Path $tempBase 'celeste-play-release'
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot).TrimEnd('\') + '\'
$tempFile = Join-Path $tempRoot ("deploy-env-$([guid]::NewGuid().ToString('N')).local")

function Get-PulledEnvironmentValue([string[]]$Names) {
  foreach ($name in $Names) {
    $entry = Get-Content -LiteralPath $tempFile |
      Where-Object { $_ -match "^$([regex]::Escape($name))=" } |
      Select-Object -First 1
    if (-not $entry) { continue }
    $rawValue = $entry.Substring($entry.IndexOf('=') + 1).Trim()
    if ($rawValue.StartsWith('"')) { return $rawValue | ConvertFrom-Json }
    return $rawValue
  }
  return $null
}

try {
  Push-Location $projectRoot
  $vercelCommand = Get-Command vercel.cmd -ErrorAction SilentlyContinue
  if (-not $vercelCommand) { throw 'Vercel CLI nao foi encontrado no PATH.' }
  & $vercelCommand.Source env pull $tempFile --environment=production --yes
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel obter o ambiente da Vercel.' }

  $supabaseUrl = Get-PulledEnvironmentValue @(
    'CELESTE_SUPABASE_URL',
    'SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_URL'
  )
  $supabaseSecret = Get-PulledEnvironmentValue @(
    'SUPABASE_SERVICE_ROLE_KEY',
    'CELESTE_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY'
  )
  if (
    -not $supabaseUrl -or
    -not $supabaseSecret -or
    $supabaseSecret -eq '[SENSITIVE]'
  ) {
    throw 'As credenciais privadas exigidas pelo portao de deploy nao estao disponiveis na Vercel.'
  }

  [Environment]::SetEnvironmentVariable('CELESTE_SUPABASE_URL', $supabaseUrl, 'Process')
  [Environment]::SetEnvironmentVariable(
    'CELESTE_SUPABASE_SERVICE_ROLE_KEY',
    $supabaseSecret,
    'Process'
  )

  $deployArguments = @((Join-Path $PSScriptRoot 'deploy-celeste.js'))
  if ($Action -ne 'deploy') { $deployArguments += "--$Action" }
  & node @deployArguments
  if ($LASTEXITCODE -ne 0) { throw "Deploy web falhou com codigo $LASTEXITCODE." }
} finally {
  [Environment]::SetEnvironmentVariable('CELESTE_SUPABASE_URL', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_SUPABASE_SERVICE_ROLE_KEY', $null, 'Process')
  Pop-Location -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $tempFile) {
    $resolvedArtifact = [System.IO.Path]::GetFullPath($tempFile)
    if (-not $resolvedArtifact.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'O arquivo temporario saiu do diretorio permitido.'
    }
    Remove-Item -LiteralPath $resolvedArtifact -Force
  }
}
