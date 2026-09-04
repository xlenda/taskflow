param(
  [ValidateSet('list', 'push', 'prepare-reporting', 'report-expansion', 'report-cutover')]
  [string]$Action = 'list'
)

$ErrorActionPreference = 'Stop'

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
$env:NODE_USE_SYSTEM_CA = '1'
$preferredDriveReady = Test-Path -LiteralPath 'D:\' -PathType Container -ErrorAction SilentlyContinue
$tempBase = if ($preferredDriveReady) { 'D:\Temp\User' } else { [System.IO.Path]::GetTempPath() }
$tempRoot = Join-Path $tempBase 'celeste-play-release'
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot).TrimEnd('\') + '\'
$tempFile = Join-Path $tempRoot ("vercel-env-$([guid]::NewGuid().ToString('N')).local")
$tempArtifacts = @($tempFile)

function Get-PulledEnvironmentValue([string]$Name) {
  $entry = Get-Content -LiteralPath $tempFile |
    Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
    Select-Object -First 1
  if (-not $entry) { return $null }
  $rawValue = $entry.Substring($entry.IndexOf('=') + 1).Trim()
  if ($rawValue.StartsWith('"')) { return $rawValue | ConvertFrom-Json }
  return $rawValue
}

try {
  & npx --yes vercel@latest env pull $tempFile --environment=production --yes
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel obter o ambiente da Vercel.' }

  $dbUrl = Get-PulledEnvironmentValue 'POSTGRES_URL_NON_POOLING'
  if (-not $dbUrl) {
    throw 'POSTGRES_URL_NON_POOLING nao existe no projeto Vercel vinculado.'
  }
  [Environment]::SetEnvironmentVariable('CELESTE_MIGRATION_DB_URL', $dbUrl, 'Process')

  if ($Action -eq 'prepare-reporting') {
    throw 'Use report-expansion, publique o app com CELESTE_AI_REPORT_ROLLOUT=expansion e depois use report-cutover.'
  } elseif ($Action -in @('report-expansion', 'report-cutover')) {
    $supabaseUrl = Get-PulledEnvironmentValue 'CELESTE_SUPABASE_URL'
    if (-not $supabaseUrl) { $supabaseUrl = Get-PulledEnvironmentValue 'EXPO_PUBLIC_SUPABASE_URL' }
    $publicKey = Get-PulledEnvironmentValue 'CELESTE_SUPABASE_ANON_KEY'
    if (-not $publicKey) { $publicKey = Get-PulledEnvironmentValue 'SUPABASE_PUBLISHABLE_KEY' }
    if (-not $publicKey) { $publicKey = Get-PulledEnvironmentValue 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY' }
    $serviceKey = Get-PulledEnvironmentValue 'CELESTE_SUPABASE_SERVICE_ROLE_KEY'
    if (-not $serviceKey) { $serviceKey = Get-PulledEnvironmentValue 'SUPABASE_SECRET_KEY' }
    if (-not $serviceKey) { $serviceKey = Get-PulledEnvironmentValue 'SUPABASE_SERVICE_ROLE_KEY' }
    if (-not $supabaseUrl -or -not $publicKey -or -not $serviceKey) {
      throw 'As credenciais de verificacao do Supabase nao estao disponiveis na Vercel.'
    }
    [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_URL', $supabaseUrl, 'Process')
    [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_PUBLIC_KEY', $publicKey, 'Process')
    [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_SERVICE_KEY', $serviceKey, 'Process')

    if ($Action -eq 'report-expansion') {
      $baselineOutput = & node (Join-Path $PSScriptRoot 'verificar-supabase-baseline-live.js')
      $baselineExit = $LASTEXITCODE
      $baselineOutput | Write-Output
      if ($baselineExit -ne 0) { throw 'O schema remoto anterior nao passou na auditoria.' }
      $baselineModeLine = $baselineOutput |
        Where-Object { $_ -match '^BASELINE_MODE=' } |
        Select-Object -First 1
      $baselineVersionLine = $baselineOutput |
        Where-Object { $_ -match '^BASELINE_VERSION=' } |
        Select-Object -First 1
      if (-not $baselineModeLine -or $baselineVersionLine -ne 'BASELINE_VERSION=012') {
        throw 'A auditoria nao confirmou o baseline seguro ate a migration 012.'
      }
      $baselineMode = $baselineModeLine.Substring('BASELINE_MODE='.Length)
      $baselineVersions = if ($baselineMode -eq 'complete') {
        1..12 | ForEach-Object { $_.ToString('000') }
      } elseif ($baselineMode -eq 'generation_only') {
        @('004', '005', '006', '008', '009', '010', '011', '012')
      } else {
        throw "Modo de schema remoto inesperado: $baselineMode"
      }
      & npx --yes supabase@latest migration repair `
        --db-url $env:CELESTE_MIGRATION_DB_URL `
        --status applied `
        --yes `
        @baselineVersions
      if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel registrar o historico validado 001-012.' }

      # Marca 014 apenas durante o push para que a expansao 013 seja aplicada
      # isoladamente. O finally sempre devolve 014 ao estado pendente.
      & npx --yes supabase@latest migration repair `
        --db-url $env:CELESTE_MIGRATION_DB_URL `
        --status applied `
        --yes `
        014
      if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel preparar o push isolado da migration 013.' }
      try {
        & npx --yes supabase@latest db push `
          --db-url $env:CELESTE_MIGRATION_DB_URL `
          --include-all `
          --yes
        if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel aplicar a migration de expansao 013.' }
      } finally {
        & npx --yes supabase@latest migration repair `
          --db-url $env:CELESTE_MIGRATION_DB_URL `
          --status reverted `
          --yes `
          014
        if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel restaurar 014 ao estado pendente.' }
      }

      [Environment]::SetEnvironmentVariable('CELESTE_AI_REPORT_ROLLOUT', 'expansion', 'Process')
      [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SKIP_REPORT_ENDPOINT', '1', 'Process')
      & node (Join-Path $PSScriptRoot 'verificar-denuncia-ia-live.js')
      if ($LASTEXITCODE -ne 0) { throw 'A expansao 013 nao passou no smoke remoto.' }
      Write-Output 'Migration 013 validada. Publique com CELESTE_AI_REPORT_ROLLOUT=expansion antes do cutover.'
    } else {
      # Antes de revogar o cliente legado, prova que o endpoint novo ja esta
      # publicado e operante contra o contrato de expansao.
      [Environment]::SetEnvironmentVariable('CELESTE_AI_REPORT_ROLLOUT', 'expansion', 'Process')
      [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SKIP_REPORT_ENDPOINT', $null, 'Process')
      & node (Join-Path $PSScriptRoot 'verificar-denuncia-ia-live.js')
      if ($LASTEXITCODE -ne 0) {
        throw 'O endpoint novo nao passou no smoke; cutover 014 cancelado.'
      }

      & npx --yes supabase@latest db push `
        --db-url $env:CELESTE_MIGRATION_DB_URL `
        --include-all `
        --yes
      if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel aplicar o cutover 014.' }

      [Environment]::SetEnvironmentVariable('CELESTE_AI_REPORT_ROLLOUT', 'final', 'Process')
      & node (Join-Path $PSScriptRoot 'verificar-denuncia-ia-live.js')
      if ($LASTEXITCODE -ne 0) { throw 'O contrato final 014 nao passou no smoke remoto.' }
      Write-Output 'Migration 014 aplicada: RPC legada revogada e gateway final validado.'
    }

    & npx --yes supabase@latest migration list --db-url $env:CELESTE_MIGRATION_DB_URL
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel confirmar o historico remoto.' }
  } elseif ($Action -eq 'push') {
    & npx --yes supabase@latest db push --db-url $env:CELESTE_MIGRATION_DB_URL
  } else {
    & npx --yes supabase@latest migration list --db-url $env:CELESTE_MIGRATION_DB_URL
  }
  if ($LASTEXITCODE -ne 0) { throw "Supabase migration $Action falhou." }
} finally {
  [Environment]::SetEnvironmentVariable('CELESTE_MIGRATION_DB_URL', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_URL', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_PUBLIC_KEY', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_SERVICE_KEY', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_AI_REPORT_ROLLOUT', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SKIP_REPORT_ENDPOINT', $null, 'Process')
  foreach ($artifact in $tempArtifacts) {
    if (Test-Path -LiteralPath $artifact) {
      $resolvedArtifact = [System.IO.Path]::GetFullPath($artifact)
      if (-not $resolvedArtifact.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Um artefato temporario saiu do diretorio permitido.'
      }
      Remove-Item -LiteralPath $resolvedArtifact -Force
    }
  }
}
