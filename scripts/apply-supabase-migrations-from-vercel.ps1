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
$npxExecutable = Join-Path $nodeHome 'npx.cmd'
if (-not (Test-Path -LiteralPath $npxExecutable -PathType Leaf)) {
  throw 'npx.cmd nao foi encontrado ao lado do Node selecionado.'
}

$env:Path = "$nodeHome;$env:Path"
$env:NODE_USE_SYSTEM_CA = '1'
$preferredDriveReady = Test-Path -LiteralPath 'D:\' -PathType Container -ErrorAction SilentlyContinue
$tempBase = if ($preferredDriveReady) { 'D:\Temp\User' } else { [System.IO.Path]::GetTempPath() }
$tempRoot = Join-Path $tempBase 'celeste-play-release'
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot).TrimEnd('\') + '\'
$tempFile = Join-Path $tempRoot ("vercel-env-$([guid]::NewGuid().ToString('N')).local")
$tempProject = Join-Path $tempRoot ("report-expansion-$([guid]::NewGuid().ToString('N'))")
$tempArtifacts = @($tempFile, $tempProject)

function Get-PulledEnvironmentValue([string]$Name) {
  # `vercel env pull` intentionally redacts sensitive values. If an operator
  # supplied a local-only process value, prefer it without writing it to disk.
  $processValue = [Environment]::GetEnvironmentVariable($Name, 'Process')
  if ($processValue -and $processValue -ne '[SENSITIVE]') { return $processValue }
  $entry = Get-Content -LiteralPath $tempFile |
    Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
    Select-Object -First 1
  if (-not $entry) { return $null }
  $rawValue = $entry.Substring($entry.IndexOf('=') + 1).Trim()
  $value = if ($rawValue.StartsWith('"')) { $rawValue | ConvertFrom-Json } else { $rawValue }
  if (-not $value -or $value -eq '[SENSITIVE]') { return $null }
  return $value
}

function Invoke-AiReportContractCheck(
  [ValidateSet('expansion', 'final')]
  [string]$Mode
) {
  $expectedVersion = if ($Mode -eq 'expansion') { '1' } else { '2' }
  $expectedLegacy = if ($Mode -eq 'expansion') { 'false' } else { 'true' }
  $sql = @'
do $celeste_contract$
declare
  contract jsonb := public.celeste_ai_content_report_gateway_version();
begin
  if contract is null
     or contract->>'schemaVersion' <> '__VERSION__'
     or contract->>'serverGateway' <> 'true'
     or contract->>'userQuota' <> 'true'
     or contract->>'actorQuota' <> 'true'
     or contract->>'globalQuota' <> 'true'
     or contract->>'retentionDays' <> '180'
     or contract->>'legacyClientSubmitDisabled' <> '__LEGACY__'
     or contract->>'deleteAll' <> 'true' then
    raise exception 'celeste_ai_report_contract_invalid';
  end if;
end
$celeste_contract$;
'@
  $sql = $sql.Replace('__VERSION__', $expectedVersion).Replace('__LEGACY__', $expectedLegacy)
  & $npxExecutable --yes supabase@latest db query `
    --db-url $env:CELESTE_MIGRATION_DB_URL `
    --output-format json `
    $sql | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "O contrato $Mode de denuncia nao foi confirmado diretamente no banco."
  }
}

function Invoke-ReportEndpointSmoke(
  [ValidateSet('expansion', 'final')]
  [string]$Mode
) {
  [Environment]::SetEnvironmentVariable('CELESTE_AI_REPORT_ROLLOUT', $Mode, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SKIP_REPORT_ENDPOINT', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_DB_CONTRACT_VERIFIED', '1', 'Process')
  $smokeOutput = & node (Join-Path $PSScriptRoot 'verificar-denuncia-ia-live.js')
  $smokeExit = $LASTEXITCODE
  $smokeOutput | Where-Object { $_ -notmatch '^REPORTER_ID_TO_DELETE=' } | Write-Output

  $reporterLine = $smokeOutput |
    Where-Object { $_ -match '^REPORTER_ID_TO_DELETE=[0-9a-f-]{36}$' } |
    Select-Object -First 1
  if ($reporterLine) {
    $reporterId = $reporterLine.Substring('REPORTER_ID_TO_DELETE='.Length)
    if ($reporterId -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
      throw 'O smoke devolveu um identificador anonimo invalido.'
    }
    $cleanupSql = "delete from auth.users where id = '$reporterId'::uuid;"
    & $npxExecutable --yes supabase@latest db query `
      --db-url $env:CELESTE_MIGRATION_DB_URL `
      --output-format json `
      $cleanupSql | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel remover o usuario anonimo do smoke.' }
  }
  if ($smokeExit -ne 0) { throw "O endpoint de denuncia falhou no modo $Mode." }
}

try {
  & $npxExecutable --yes vercel@latest env pull $tempFile --environment=production --yes
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
    if (-not $supabaseUrl -or -not $publicKey) {
      throw 'A URL e a chave publica de verificacao do Supabase nao estao disponiveis na Vercel.'
    }
    [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_URL', $supabaseUrl, 'Process')
    [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_PUBLIC_KEY', $publicKey, 'Process')
    if ($serviceKey) {
      [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_SERVICE_KEY', $serviceKey, 'Process')
    }

    if ($Action -eq 'report-expansion') {
      $historyOutput = & $npxExecutable --yes supabase@latest migration list `
        --db-url $env:CELESTE_MIGRATION_DB_URL `
        --output-format json
      if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel auditar o historico remoto.' }
      $history = ($historyOutput -join "`n") | ConvertFrom-Json
      $remoteVersions = @(
        $history.migrations |
          Where-Object { $_.remote } |
          ForEach-Object { [string]$_.remote }
      )
      $expectedVersions = @(1..12 | ForEach-Object { $_.ToString('000') })
      if (($remoteVersions -join ',') -ne ($expectedVersions -join ',')) {
        throw 'O historico remoto precisa estar exatamente em 001-012 antes da expansao.'
      }

      $sourceMigrations = Join-Path $PSScriptRoot '..\supabase\migrations'
      $temporaryMigrations = Join-Path $tempProject 'supabase\migrations'
      New-Item -ItemType Directory -Path $temporaryMigrations -Force | Out-Null
      foreach ($number in 1..13) {
        $version = $number.ToString('000')
        $matches = @(Get-ChildItem -LiteralPath $sourceMigrations -File |
          Where-Object { $_.Name.StartsWith("$version`_", [System.StringComparison]::Ordinal) })
        if ($matches.Count -ne 1) { throw "Migration local $version ausente ou duplicada." }
        Copy-Item -LiteralPath $matches[0].FullName -Destination $temporaryMigrations
      }

      & $npxExecutable --yes supabase@latest db push `
        --workdir $tempProject `
        --db-url $env:CELESTE_MIGRATION_DB_URL `
        --include-all `
        --yes
      if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel aplicar a migration de expansao 013.' }
      Invoke-AiReportContractCheck 'expansion'
      Write-Output 'Migration 013 validada. Publique com CELESTE_AI_REPORT_ROLLOUT=expansion antes do cutover.'
    } else {
      # Antes de revogar o cliente legado, prova que o endpoint novo ja esta
      # publicado e operante contra o contrato de expansao.
      Invoke-AiReportContractCheck 'expansion'
      Invoke-ReportEndpointSmoke 'expansion'

      & $npxExecutable --yes supabase@latest db push `
        --db-url $env:CELESTE_MIGRATION_DB_URL `
        --include-all `
        --yes
      if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel aplicar o cutover 014.' }

      Invoke-AiReportContractCheck 'final'
      Invoke-ReportEndpointSmoke 'final'
      Write-Output 'Migration 014 aplicada: RPC legada revogada e gateway final validado.'
    }

    & $npxExecutable --yes supabase@latest migration list --db-url $env:CELESTE_MIGRATION_DB_URL
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel confirmar o historico remoto.' }
  } elseif ($Action -eq 'push') {
    & $npxExecutable --yes supabase@latest db push --db-url $env:CELESTE_MIGRATION_DB_URL
  } else {
    & $npxExecutable --yes supabase@latest migration list --db-url $env:CELESTE_MIGRATION_DB_URL
  }
  if ($LASTEXITCODE -ne 0) { throw "Supabase migration $Action falhou." }
} finally {
  [Environment]::SetEnvironmentVariable('CELESTE_MIGRATION_DB_URL', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_URL', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_PUBLIC_KEY', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SUPABASE_SERVICE_KEY', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_AI_REPORT_ROLLOUT', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_SKIP_REPORT_ENDPOINT', $null, 'Process')
  [Environment]::SetEnvironmentVariable('CELESTE_RELEASE_DB_CONTRACT_VERIFIED', $null, 'Process')
  foreach ($artifact in $tempArtifacts) {
    if (Test-Path -LiteralPath $artifact) {
      $resolvedArtifact = [System.IO.Path]::GetFullPath($artifact)
      if (-not $resolvedArtifact.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Um artefato temporario saiu do diretorio permitido.'
      }
      if (Test-Path -LiteralPath $resolvedArtifact -PathType Container) {
        Remove-Item -LiteralPath $resolvedArtifact -Recurse -Force
      } else {
        Remove-Item -LiteralPath $resolvedArtifact -Force
      }
    }
  }
}
