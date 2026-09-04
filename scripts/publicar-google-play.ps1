<#
.SYNOPSIS
Valida e inicia uma release Android da Celeste pelo EAS, sem modo interativo.

.DESCRIPTION
Nenhuma acao externa ocorre sem -StartBuild. O envio automatico fica limitado
a trilha internal e exige confirmacao explicita dos pre-requisitos do Play.

.PARAMETER CheckOnly
Executa os portoes sem iniciar build nem submissao. Combine com
-SubmitInternal para validar tambem os portoes de envio.

.PARAMETER StartBuild
Inicia um AAB production no EAS e retorna sem esperar a compilacao terminar.

.PARAMETER SubmitInternal
Agenda auto-submit somente para a trilha internal. Nao promove a producao.

.PARAMETER ConfirmPlayPrerequisites
Confirma que o app existe no Play Console e a conta de servico esta no EAS.

.PARAMETER Help
Mostra os exemplos e encerra sem executar verificacoes.

.EXAMPLE
.\scripts\publicar-google-play.ps1 -CheckOnly

.EXAMPLE
.\scripts\publicar-google-play.ps1 -StartBuild

.EXAMPLE
.\scripts\publicar-google-play.ps1 -StartBuild -SubmitInternal -ConfirmPlayPrerequisites
#>
[CmdletBinding()]
param(
  [switch]$CheckOnly,
  [switch]$StartBuild,
  [switch]$SubmitInternal,
  [switch]$ConfirmPlayPrerequisites,
  [Alias('h', '?')][switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Show-ReleaseHelp {
  @'
Celeste - release Android segura

  .\scripts\publicar-google-play.ps1 -CheckOnly
  .\scripts\publicar-google-play.ps1 -CheckOnly -SubmitInternal
  .\scripts\publicar-google-play.ps1 -StartBuild
  .\scripts\publicar-google-play.ps1 -StartBuild -SubmitInternal -ConfirmPlayPrerequisites

O script nunca executa eas login, nunca pede senha e nunca grava credenciais.
-StartBuild e obrigatorio para criar um AAB. -SubmitInternal nunca publica
diretamente em producao.
'@ | Write-Output
}

if ($Help) { Show-ReleaseHelp; return }
if ($CheckOnly -and $StartBuild) {
  throw 'Escolha -CheckOnly ou -StartBuild; nao use os dois juntos.'
}
if (-not $CheckOnly -and -not $StartBuild) {
  Show-ReleaseHelp
  throw 'Use -CheckOnly ou -StartBuild.'
}
if ($ConfirmPlayPrerequisites -and -not $SubmitInternal) {
  throw '-ConfirmPlayPrerequisites so pode ser usado com -SubmitInternal.'
}
if ($StartBuild -and $SubmitInternal -and -not $ConfirmPlayPrerequisites) {
  throw 'Auto-submit exige -ConfirmPlayPrerequisites.'
}

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

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
foreach ($file in @('package.json', 'app.json', 'eas.json', '.easignore')) {
  if (-not (Test-Path -LiteralPath (Join-Path $root $file) -PathType Leaf)) {
    throw "Arquivo obrigatorio ausente: $file"
  }
}
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$app = Get-Content -LiteralPath (Join-Path $root 'app.json') -Raw | ConvertFrom-Json
$easConfig = Get-Content -LiteralPath (Join-Path $root 'eas.json') -Raw | ConvertFrom-Json
if ($package.name -ne 'celeste' -or $app.expo.android.package -ne 'com.celesteapp.affirmations') {
  throw 'Este script so publica a Celeste (com.celesteapp.affirmations).'
}

$projectId = ''
try { $projectId = [string]$app.expo.extra.eas.projectId } catch {}
$parsedId = [guid]::Empty
if (-not $projectId -or -not [guid]::TryParse($projectId, [ref]$parsedId)) {
  throw 'extra.eas.projectId ausente ou invalido. Vincule a conta Expo proprietaria antes da release.'
}
if ($SubmitInternal -and $easConfig.submit.production.android.track -ne 'internal') {
  throw 'Auto-submit bloqueado: eas.json deve apontar exatamente para internal.'
}

$ignoreLines = Get-Content -LiteralPath (Join-Path $root '.easignore') |
  ForEach-Object { $_.Trim() }
foreach ($rule in @(
  '.env.*',
  'google-service-account*.json',
  '*.jks',
  '*.keystore',
  'scripts/e2e-shots/'
)) {
  if ($ignoreLines -notcontains $rule) { throw ".easignore precisa bloquear $rule" }
}

$git = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $git) { throw 'Git nao foi encontrado.' }
$node = Resolve-CelesteNode -ProjectRoot $root
$npm = Join-Path $node.Home 'npm.cmd'
if (-not (Test-Path -LiteralPath $npm -PathType Leaf)) { throw 'npm.cmd nao acompanha o Node selecionado.' }

$oldPath = $env:Path
$oldCI = $env:CI
$oldDoctor = $env:EXPO_NO_DOCTOR
Push-Location $root
try {
  $env:Path = "$($node.Home);$env:Path"
  $env:CI = '1'
  $env:EXPO_NO_DOCTOR = '1'

  $dirty = @(& $git.Source status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel verificar o Git.' }
  # Capturas de QA pertencem ao titular e sao explicitamente excluidas do
  # upload pelo .easignore. Elas podem permanecer no worktree sem contaminar o
  # AAB; qualquer outra alteracao ainda bloqueia a release.
  $ignoredQaShots = @(
    $dirty | Where-Object { $_ -match '^.. scripts/e2e-shots/.+$' }
  )
  $blockingDirty = @(
    $dirty | Where-Object { $_ -notmatch '^.. scripts/e2e-shots/.+$' }
  )
  if ($blockingDirty.Count) {
    throw "O worktree tem $($blockingDirty.Count) alteracao(oes) fora de scripts/e2e-shots; faca commit primeiro."
  }
  if ($ignoredQaShots.Count) {
    Write-Warning "$($ignoredQaShots.Count) captura(s) local(is) de QA serao ignoradas pelo EAS."
  }
  & $git.Source fetch --quiet
  if ($LASTEXITCODE -ne 0) { throw 'git fetch falhou.' }
  $localHead = & $git.Source rev-parse HEAD
  $remoteHead = & $git.Source rev-parse '@{u}' 2>$null
  if ($LASTEXITCODE -ne 0 -or $localHead -ne $remoteHead) {
    throw 'O commit local nao coincide com o upstream do GitHub.'
  }

  Write-Host "Node compativel: $($node.Version)"
  $script:EasCli = Resolve-EasCli -ProjectRoot $root -NodeHome $node.Home
  $versionResult = Invoke-EasCapture @('--version')
  $versionMatch = [regex]::Match($versionResult.Text, '(?<!\d)(\d+\.\d+\.\d+)(?!\d)')
  if ($versionResult.Code -ne 0 -or -not $versionMatch.Success) {
    throw 'Nao foi possivel validar o EAS CLI.'
  }
  if ([version]$versionMatch.Groups[1].Value -lt [version]'22.6.0') {
    throw 'EAS CLI >=22.6.0 e obrigatorio.'
  }

  $who = Invoke-EasCapture @('whoami')
  if ($who.Code -ne 0 -or -not $who.Text.Trim() -or $who.Text -match '(?i)not logged|login required') {
    throw 'Login EAS ausente. Faca login fora deste script; ele nunca pede senha.'
  }
  $info = Invoke-EasCapture @('project:info')
  if ($info.Code -ne 0 -or $info.Text -notmatch [regex]::Escape($projectId)) {
    throw 'A conta EAS atual nao confirmou o projectId do app.json.'
  }

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
  Write-Host 'Login, projectId e variaveis EAS: OK (valores ocultos)'

  Invoke-NpmGate -Npm $npm -Name 'verify:android-release'
  Invoke-NpmGate -Npm $npm -Name 'verify:store'

  if ($CheckOnly) {
    Write-Host 'CHECK ONLY aprovado; nenhum build ou envio foi iniciado.'
    return
  }

  $arguments = @(
    'build', '--platform', 'android', '--profile', 'production',
    '--non-interactive', '--no-wait', '--freeze-credentials'
  )
  if ($SubmitInternal) { $arguments += '--auto-submit-with-profile=production' }
  Invoke-EasVisible -Arguments $arguments
  if ($SubmitInternal) {
    Write-Host 'AAB enfileirado com auto-submit apenas para internal.'
  } else {
    Write-Host 'AAB production enfileirado sem submissao automatica.'
  }
} finally {
  [Environment]::SetEnvironmentVariable('Path', $oldPath, 'Process')
  [Environment]::SetEnvironmentVariable('CI', $oldCI, 'Process')
  [Environment]::SetEnvironmentVariable('EXPO_NO_DOCTOR', $oldDoctor, 'Process')
  Pop-Location -ErrorAction SilentlyContinue
}
