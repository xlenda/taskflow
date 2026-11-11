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

O envio ao TestFlight exige que as paginas de privacidade NO AR ja mostrem o
controlador (a Apple abre a URL da ficha na revisao). O build em si nao exige.

.PARAMETER CheckOnly
Executa os portoes sem iniciar build nem envio.

.PARAMETER StartBuild
Inicia um build iOS production no EAS e retorna sem esperar a compilacao terminar.

.PARAMETER Submit
Envia ao App Store Connect (TestFlight). Sozinho: o build iOS production concluido
deste mesmo commit (HEAD). Com -StartBuild: envia automaticamente ao terminar.

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
$ControllerCnpj = '56.970.099/0001-09'

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

function Test-CelesteLegalPagesLive {
  # A ficha da App Store aponta para /privacidade (e /privacy); a Apple abre essas
  # URLs na revisao. Devolve a lista de problemas; vazia = controlador ja no ar.
  param([string]$StoreDir, [string]$Cnpj)
  $urls = Get-Content -LiteralPath (Join-Path $StoreDir 'urls.json') -Raw | ConvertFrom-Json
  $privacy = [string]$urls.privacy
  $problems = @()
  foreach ($url in @($privacy, ($privacy -replace '/privacidade$', '/privacy'))) {
    $html = ''
    try {
      $html = [string](Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30).Content
    } catch {
      $problems += "$url nao respondeu: $($_.Exception.Message)"
      continue
    }
    if ($html -match 'data-owner-required=') { $problems += "$url ainda mostra item pendente do titular" }
    if ($html -notmatch [regex]::Escape($Cnpj)) { $problems += "$url ainda nao mostra o controlador (CNPJ)" }
  }
  return ,$problems
}

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$project = Read-CelesteReleaseProject -ProjectRoot $root -EasIgnoreRules @(
  '.env.*',
  '*.p8',
  '*.p12',
  '*.pem',
  'scripts/e2e-shots/'
)
$app = $project.App
$easConfig = $project.Eas
$projectId = $project.ProjectId
if ($app.expo.ios.bundleIdentifier -ne $BundleId) {
  throw "Este script so publica a Celeste ($BundleId)."
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
  # CI=1 deixa whoami/env:list/build:list sem perguntas: uma pergunta ali cairia no
  # buffer capturado e o script travaria em silencio. CI sai so na hora do eas
  # build/submit interativo, que precisa do dialogo de login Apple.
  $env:CI = '1'

  $head = Assert-CelesteWorktreeReady -GitPath $git.Source
  Write-Host "Node compativel: $($node.Version)"
  $script:EasCli = Resolve-EasCli -ProjectRoot $root -NodeHome $node.Home
  Assert-CelesteEasReady -ProjectId $projectId
  $null = Assert-CelesteEasProductionEnv
  Write-Host 'Login, projectId e variaveis EAS: OK (valores ocultos)'

  # Fonte das paginas e textos da loja coerentes com o app.
  Invoke-NpmGate -Npm $npm -Name 'verify:public-pages'
  Invoke-NpmGate -Npm $npm -Name 'verify:store'

  # Paginas no ar: bloqueia o envio ao TestFlight, so avisa para build/checagem.
  $liveProblems = @(Test-CelesteLegalPagesLive -StoreDir (Join-Path $root 'store-listing') -Cnpj $ControllerCnpj)
  if ($liveProblems.Count) {
    $detail = $liveProblems -join '; '
    if ($Submit) {
      throw "As paginas de privacidade no ar ainda nao trazem o controlador; rode scripts/deploy-web-from-vercel.ps1 antes de enviar ao TestFlight. Detalhe: $detail"
    }
    Write-Warning "Paginas de privacidade no ar desatualizadas (o build pode seguir, o envio nao): $detail"
  } else {
    Write-Host 'Paginas de privacidade no ar: controlador publicado.'
  }

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
      Remove-Item Env:CI -ErrorAction SilentlyContinue
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

  # -Submit sozinho: so um build iOS production concluido deste mesmo commit, nunca
  # "o ultimo que apareceu" (poderia ser de outro commit ou de outro perfil).
  $list = Invoke-EasCapture @(
    'build:list', '--platform', 'ios', '--build-profile', 'production',
    '--status', 'finished', '--git-commit-hash', $head, '--limit', '1',
    '--json', '--non-interactive'
  )
  if ($list.Code -ne 0) { throw 'Nao foi possivel listar os builds iOS concluidos.' }
  $jsonStart = $list.Text.IndexOf('[')
  if ($jsonStart -lt 0) { throw 'O EAS nao devolveu a lista de builds em JSON.' }
  $builds = @()
  try {
    $parsed = $list.Text.Substring($jsonStart) | ConvertFrom-Json
    $builds = @($parsed | ForEach-Object { $_ })
  } catch { throw 'A lista de builds do EAS nao e JSON valido.' }
  if (-not $builds.Count) {
    throw "Nenhum build iOS production concluido para o commit $head. Gere um com -StartBuild (ou -StartBuild -Submit)."
  }
  $buildId = [string]$builds[0].id
  if (-not $buildId) { throw 'O build listado pelo EAS veio sem id.' }
  if (-not $NonInteractive) { Remove-Item Env:CI -ErrorAction SilentlyContinue }
  $arguments = @('submit', '--platform', 'ios', '--profile', 'production', '--id', $buildId)
  if ($NonInteractive) { $arguments += '--non-interactive' }
  Invoke-EasVisible -Arguments $arguments
  Write-Host "Build $buildId (commit $head) enviado ao App Store Connect (TestFlight). 'Adicionar para revisao' continua manual."
} finally {
  [Environment]::SetEnvironmentVariable('Path', $oldPath, 'Process')
  [Environment]::SetEnvironmentVariable('CI', $oldCI, 'Process')
  [Environment]::SetEnvironmentVariable('EXPO_NO_DOCTOR', $oldDoctor, 'Process')
  Pop-Location -ErrorAction SilentlyContinue
}
