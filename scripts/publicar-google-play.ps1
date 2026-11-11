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
$project = Read-CelesteReleaseProject -ProjectRoot $root -EasIgnoreRules @(
  '.env.*',
  'google-service-account*.json',
  '*.jks',
  '*.keystore',
  'scripts/e2e-shots/'
)
$app = $project.App
$easConfig = $project.Eas
$projectId = $project.ProjectId
if ($app.expo.android.package -ne 'com.celesteapp.affirmations') {
  throw 'Este script so publica a Celeste (com.celesteapp.affirmations).'
}
if ($SubmitInternal -and $easConfig.submit.production.android.track -ne 'internal') {
  throw 'Auto-submit bloqueado: eas.json deve apontar exatamente para internal.'
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

  $null = Assert-CelesteWorktreeReady -GitPath $git.Source

  Write-Host "Node compativel: $($node.Version)"
  $script:EasCli = Resolve-EasCli -ProjectRoot $root -NodeHome $node.Home
  Assert-CelesteEasReady -ProjectId $projectId

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
