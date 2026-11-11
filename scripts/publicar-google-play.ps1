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

# Funcoes compartilhadas com publicar-app-store.ps1 (Node, EAS CLI, variaveis e portoes).
. (Join-Path $PSScriptRoot 'celeste-release-lib.ps1')

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

  $scopes = Assert-CelesteEasProductionEnv
  # Sem o numero do projeto do Google Cloud o AAB sai sem Play Integrity: no
  # Android a voz da Celeste nunca abre (toca a voz do aparelho). Avisa, nao bloqueia.
  if (-not $scopes.ContainsKey('EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER')) {
    Write-Warning 'EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER ausente no EAS production: este AAB sai sem Play Integrity e no Android so toca a voz do aparelho (docs/PLAY-INTEGRITY-PASSO-A-PASSO.md, passo 7).'
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
