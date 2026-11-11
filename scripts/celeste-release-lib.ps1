# Funcoes compartilhadas pelos scripts de release da Celeste
# (publicar-google-play.ps1 e publicar-app-store.ps1). Carregar com dot-source:
#   . (Join-Path $PSScriptRoot 'celeste-release-lib.ps1')
# Nenhuma funcao aqui pede senha, grava credencial ou imprime valor de variavel.

function Remove-Ansi {
  param([AllowEmptyString()][string]$Text)
  if ($null -eq $Text) { return '' }
  return [regex]::Replace($Text, "$([char]27)\[[0-9;?]*[ -/]*[@-~]", '')
}

function Resolve-CelesteNode {
  param([string]$ProjectRoot)

  $candidates = [System.Collections.Generic.List[string]]::new()
  if ($env:CELESTE_NODE_HOME) {
    $candidates.Add((Join-Path $env:CELESTE_NODE_HOME 'node.exe'))
  } else {
    $portableNode24 = @(
      Get-ChildItem -Path 'C:\DevCache\node24\node-v*\node.exe' `
        -File -ErrorAction SilentlyContinue |
        ForEach-Object {
          $match = [regex]::Match($_.Directory.Name, '^node-v(\d+\.\d+\.\d+)')
          if ($match.Success) {
            [pscustomobject]@{ Path = $_.FullName; Version = [version]$match.Groups[1].Value }
          }
        } |
        Sort-Object Version -Descending
    )
    foreach ($portable in $portableNode24) { $candidates.Add($portable.Path) }
    foreach ($path in @(
      (Join-Path $ProjectRoot '.tools\node\node.exe'),
      'C:\DevCache\node\node.exe'
    )) {
      if (Test-Path -LiteralPath $path -PathType Leaf) { $candidates.Add($path) }
    }
    $pathNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($pathNode) { $candidates.Add($pathNode.Source) }
  }
  if ($candidates.Count -eq 0) {
    throw 'Node nao encontrado. Defina CELESTE_NODE_HOME para um Node portatil.'
  }

  $nodePath = [System.IO.Path]::GetFullPath($candidates[0])
  if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    throw "node.exe nao existe em $nodePath"
  }
  $rawVersion = & $nodePath -p 'process.versions.node' 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $rawVersion) {
    throw 'Nao foi possivel consultar a versao do Node.'
  }
  try { $version = [version]([string]$rawVersion).Trim() } catch {
    throw 'O Node retornou uma versao invalida.'
  }
  if ($version -lt [version]'20.19.4' -or $version -ge [version]'26.0.0') {
    throw "Celeste exige Node >=20.19.4 e <26; encontrado $version. Use CELESTE_NODE_HOME."
  }
  return [pscustomobject]@{
    Path = $nodePath
    Home = Split-Path -Parent $nodePath
    Version = $version
  }
}

function Resolve-EasCli {
  param([string]$ProjectRoot, [string]$NodeHome)

  $local = Join-Path $ProjectRoot 'node_modules\.bin\eas.cmd'
  if (Test-Path -LiteralPath $local -PathType Leaf) {
    return [pscustomobject]@{ Path = $local; Prefix = @() }
  }
  $global = Get-Command eas.cmd -ErrorAction SilentlyContinue
  if ($global) { return [pscustomobject]@{ Path = $global.Source; Prefix = @() } }

  $npx = Join-Path $NodeHome 'npx.cmd'
  if (-not (Test-Path -LiteralPath $npx -PathType Leaf)) {
    $pathNpx = Get-Command npx.cmd -ErrorAction SilentlyContinue
    if ($pathNpx) { $npx = $pathNpx.Source }
  }
  if (-not (Test-Path -LiteralPath $npx -PathType Leaf)) {
    throw 'EAS CLI e npx nao foram encontrados.'
  }
  return [pscustomobject]@{ Path = $npx; Prefix = @('--yes', 'eas-cli@latest') }
}

function Invoke-EasCapture {
  param([string[]]$Arguments)
  $output = & $script:EasCli.Path @($script:EasCli.Prefix + $Arguments) 2>&1
  return [pscustomobject]@{
    Code = $LASTEXITCODE
    Text = Remove-Ansi (($output | ForEach-Object { $_.ToString() }) -join "`n")
  }
}

function Invoke-EasVisible {
  param([string[]]$Arguments)
  & $script:EasCli.Path @($script:EasCli.Prefix + $Arguments)
  if ($LASTEXITCODE -ne 0) {
    throw "EAS falhou com codigo $LASTEXITCODE. O script nao solicitara senha."
  }
}

function Get-EnvironmentInventory {
  param([ValidateSet('project', 'account')][string]$Scope)
  $result = Invoke-EasCapture @(
    'env:list', 'production', '--format', 'short', '--scope', $Scope
  )
  if ($result.Code -ne 0) {
    throw "Nao foi possivel consultar as variaveis EAS production ($Scope)."
  }
  $names = @()
  foreach ($line in ($result.Text -split "`r?`n")) {
    if ($line -match '^\s*([A-Z][A-Z0-9_]*)=') { $names += $Matches[1] }
  }
  return $names
}

function Get-PublicEnvironmentValue {
  param(
    [string]$Name,
    [ValidateSet('project', 'account')][string]$Scope
  )
  $result = Invoke-EasCapture @(
    'env:get', 'production', '--variable-name', $Name,
    '--format', 'short', '--scope', $Scope, '--non-interactive'
  )
  if ($result.Code -ne 0) {
    throw "$Name precisa usar visibilidade plaintext ou sensitive, nunca secret."
  }
  $line = ($result.Text -split "`r?`n") |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))=" } |
    Select-Object -First 1
  if (-not $line) { throw "$Name nao possui valor publico utilizavel." }
  $value = $line.Substring($line.IndexOf('=') + 1).Trim()
  if (-not $value -or $value -match '^\*+$') {
    throw "$Name esta vazia ou inacessivel."
  }
  return $value
}

function Assert-HttpsUrl {
  param([string]$Name, [string]$Value)
  [uri]$uri = $null
  if (-not [uri]::TryCreate($Value, [System.UriKind]::Absolute, [ref]$uri)) {
    throw "$Name deve ser uma URL absoluta valida."
  }
  if ($uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Fragment) {
    throw "$Name deve usar HTTPS, sem credenciais e sem fragmento."
  }
}

function Invoke-NpmGate {
  param([string]$Npm, [string]$Name)
  Write-Host "[gate] npm run $Name"
  & $Npm run $Name
  if ($LASTEXITCODE -ne 0) {
    throw "O portao $Name falhou; build e submissao foram bloqueados."
  }
}

function Assert-CelesteEasProductionEnv {
  # Confere as variaveis publicas do EAS production que os dois binarios precisam,
  # sem imprimir valor algum. Devolve o mapa nome -> escopo para o chamador
  # acrescentar avisos proprios da plataforma (Play Integrity, por exemplo).
  $scopes = @{}
  foreach ($name in (Get-EnvironmentInventory -Scope 'account')) { $scopes[$name] = 'account' }
  foreach ($name in (Get-EnvironmentInventory -Scope 'project')) { $scopes[$name] = 'project' }
  foreach ($forbidden in @(
    'EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
    'EXPO_PUBLIC_EXPO_TOKEN',
    'EXPO_PUBLIC_EAS_TOKEN',
    'EXPO_PUBLIC_GOOGLE_SERVICE_ACCOUNT'
  )) {
    if ($scopes.ContainsKey($forbidden)) { throw "Variavel publica proibida: $forbidden" }
  }
  foreach ($required in @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_CELESTE_API_URL')) {
    if (-not $scopes.ContainsKey($required)) { throw "Variavel EAS production ausente: $required" }
  }
  $keyNames = @(
    @('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY') |
      Where-Object { $scopes.ContainsKey($_) }
  )
  if (-not $keyNames.Count) { throw 'EAS production exige uma chave publica Supabase.' }

  foreach ($urlName in @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_CELESTE_API_URL')) {
    $value = Get-PublicEnvironmentValue -Name $urlName -Scope $scopes[$urlName]
    Assert-HttpsUrl -Name $urlName -Value $value
    $value = $null
  }
  foreach ($keyName in $keyNames) {
    $value = Get-PublicEnvironmentValue -Name $keyName -Scope $scopes[$keyName]
    if (
      $value.Length -lt 20 -or $value.Length -gt 4096 -or $value -match '\s' -or
      $value -match '^(?:sb_)?secret_' -or $value -match 'service[_-]?role'
    ) { throw "$keyName nao e uma chave publica Supabase valida." }
    $value = $null
  }
  return $scopes
}
