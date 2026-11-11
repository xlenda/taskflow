<#
.SYNOPSIS
Valida e inicia uma release iOS da Celeste pelo EAS (TestFlight / App Store Connect).

.DESCRIPTION
Nenhuma acao externa ocorre sem -StartBuild ou -Submit. O build iOS roda na nuvem
da Expo. Na primeira vez o EAS pede login na conta Apple do titular para criar o
certificado de distribuicao e o perfil de provisionamento (codigo de 2 fatores no
iPhone); por isso o primeiro build e interativo. O script nunca pede senha, nunca
grava credencial e nunca envia o app para revisao: "Adicionar para revisao"
continua manual no App Store Connect.

.PARAMETER CheckOnly
Executa os portoes sem iniciar build nem envio.

.PARAMETER StartBuild
Inicia um build iOS production no EAS e retorna sem esperar a compilacao terminar.

.PARAMETER Submit
Envia ao App Store Connect (TestFlight). Sozinho: o ultimo build iOS concluido.
Com -StartBuild: envia automaticamente quando o build terminar.

.PARAMETER NonInteractive
Usa as credenciais Apple ja guardadas no EAS sem perguntar nada. So funciona
depois da primeira release; antes disso o EAS precisa perguntar.

.PARAMETER Help
Mostra os exemplos e encerra sem executar verificacoes.

.EXAMPLE
.\scripts\publicar-app-store.ps1 -CheckOnly

.EXAMPLE
.\scripts\publicar-app-store.ps1 -StartBuild

.EXAMPLE
.\scripts\publicar-app-store.ps1 -StartBuild -Submit

.EXAMPLE
.\scripts\publicar-app-store.ps1 -Submit
#>
[CmdletBinding()]
param(
  [switch]$CheckOnly,
  [switch]$StartBuild,
  [switch]$Submit,
  [switch]$NonInteractive,
  [Alias('h', '?')][switch]$Help
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Ficha "Celeste: Manifestacao" criada no App Store Connect em 11/11/2026 na
# equipe VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA. Sao identificadores publicos
# da ficha, nao credenciais; eas.json precisa apontar para os mesmos valores.
$AscAppId = '6833663415'
$AppleTeamId = '68VRL5BCA7'
$BundleId = 'com.celesteapp.affirmations'

function Show-ReleaseHelp {
  @'
Celeste - release iOS segura

  .\scripts\publicar-app-store.ps1 -CheckOnly
  .\scripts\publicar-app-store.ps1 -StartBuild
  .\scripts\publicar-app-store.ps1 -StartBuild -Submit
  .\scripts\publicar-app-store.ps1 -Submit
  .\scripts\publicar-app-store.ps1 -StartBuild -NonInteractive   (so apos a 1a release)

O script nunca executa eas login, nunca pede senha e nunca grava credenciais.
-StartBuild e obrigatorio para criar um build. -Submit envia ao TestFlight;
o envio para revisao da App Store continua manual.
'@ | Write-Output
}

if ($Help) { Show-ReleaseHelp; return }
if ($CheckOnly -and ($StartBuild -or $Submit)) {
  throw 'Escolha -CheckOnly ou -StartBuild/-Submit; nao use os dois juntos.'
}
if (-not $CheckOnly -and -not $StartBuild -and -not $Submit) {
  Show-ReleaseHelp
  throw 'Use -CheckOnly, -StartBuild ou -Submit.'
}

# Funcoes compartilhadas com publicar-google-play.ps1 (Node, EAS CLI, variaveis e portoes).
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
if ($package.name -ne 'celeste' -or $app.expo.ios.bundleIdentifier -ne $BundleId) {
  throw "Este script so publica a Celeste ($BundleId)."
}

$projectId = ''
try { $projectId = [string]$app.expo.extra.eas.projectId } catch {}
$parsedId = [guid]::Empty
if (-not $projectId -or -not [guid]::TryParse($projectId, [ref]$parsedId)) {
  throw 'extra.eas.projectId ausente ou invalido. Vincule a conta Expo proprietaria antes da release.'
}

$iosSubmitOk = $false
try {
  $iosSubmit = $easConfig.submit.production.ios
  $iosSubmitOk = ([string]$iosSubmit.ascAppId -eq $AscAppId) -and
    ([string]$iosSubmit.appleTeamId -eq $AppleTeamId)
} catch { $iosSubmitOk = $false }
if (-not $iosSubmitOk) {
  throw "eas.json: submit.production.ios precisa apontar para a ficha $AscAppId da equipe $AppleTeamId."
}

$ignoreLines = Get-Content -LiteralPath (Join-Path $root '.easignore') |
  ForEach-Object { $_.Trim() }
foreach ($rule in @(
  '.env.*',
  '*.p8',
  '*.p12',
  '*.pem',
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
  $env:EXPO_NO_DOCTOR = '1'
  # O EAS CLI trata CI=1 como modo sem perguntas. O primeiro build iOS precisa
  # perguntar (login Apple, certificado, perfil), entao CI so entra com -NonInteractive.
  if ($NonInteractive) { $env:CI = '1' }

  $dirty = @(& $git.Source status --porcelain=v1 --untracked-files=all)
  if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel verificar o Git.' }
  # Capturas de QA sao do titular e ficam fora do upload pelo .easignore; qualquer
  # outra alteracao ainda bloqueia a release.
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

  $null = Assert-CelesteEasProductionEnv
  Write-Host 'Login, projectId e variaveis EAS: OK (valores ocultos)'

  # A ficha da App Store aponta para /privacidade e /suporte; os dois portoes
  # garantem que as paginas e os textos da loja continuam coerentes com o app.
  Invoke-NpmGate -Npm $npm -Name 'verify:public-pages'
  Invoke-NpmGate -Npm $npm -Name 'verify:store'

  if ($CheckOnly) {
    Write-Host 'CHECK ONLY aprovado; nenhum build ou envio foi iniciado.'
    return
  }

  if ($StartBuild) {
    if (-not $NonInteractive) {
      @'
O EAS vai perguntar, nesta ordem (responda com o iPhone na mao):
  1. "Do you want to log in to your Apple account?"  -> Y, Apple ID payvenuz@gmail.com, senha, codigo de 2 fatores
  2. "Generate a new Apple Distribution Certificate?" -> Y
  3. "Generate a new Apple Provisioning Profile?"     -> Y
  4. "Set up Push Notifications key?"                 -> Y (lembretes locais nao precisam, mas nao atrapalha)
A senha vai direto para a Apple pelo EAS CLI; este script nao a ve nem guarda.
'@ | Write-Host
    }
    $arguments = @('build', '--platform', 'ios', '--profile', 'production', '--no-wait')
    if ($NonInteractive) { $arguments += @('--non-interactive', '--freeze-credentials') }
    if ($Submit) { $arguments += '--auto-submit-with-profile=production' }
    Invoke-EasVisible -Arguments $arguments
    if ($Submit) {
      Write-Host 'Build iOS enfileirado com envio automatico ao TestFlight. A revisao continua manual no App Store Connect.'
    } else {
      Write-Host 'Build iOS production enfileirado sem envio automatico. Quando terminar: .\scripts\publicar-app-store.ps1 -Submit'
    }
    return
  }

  $arguments = @('submit', '--platform', 'ios', '--profile', 'production', '--latest')
  if ($NonInteractive) { $arguments += '--non-interactive' }
  Invoke-EasVisible -Arguments $arguments
  Write-Host 'Ultimo build iOS enviado ao App Store Connect (TestFlight). "Adicionar para revisao" continua manual.'
} finally {
  [Environment]::SetEnvironmentVariable('Path', $oldPath, 'Process')
  [Environment]::SetEnvironmentVariable('CI', $oldCI, 'Process')
  [Environment]::SetEnvironmentVariable('EXPO_NO_DOCTOR', $oldDoctor, 'Process')
  Pop-Location -ErrorAction SilentlyContinue
}
