# Publicacao Android automatizada

O script `scripts/publicar-google-play.ps1` prepara uma release da Celeste sem
alterar o aplicativo, sem pedir senha e sem gravar credenciais. Ele trabalha
somente com o package `com.lenda.celeste`, o perfil EAS `production` e, quando
solicitado, a trilha `internal` do Google Play.

## Antes do primeiro uso

1. Use Node `>=20.19.4` e `<26`. O script escolhe automaticamente a versao mais
   nova em `C:\DevCache\node24\node-v*\node.exe`. Para outro Node portatil,
   defina `CELESTE_NODE_HOME` com a pasta que contem `node.exe`, `npm.cmd` e
   `npx.cmd`; essa escolha explicita tem prioridade.
2. Fora do script, entre na conta Expo proprietaria e vincule o projeto. O
   `extra.eas.projectId` precisa existir no `app.json`; o script nunca cria nem
   troca esse vinculo.
3. No ambiente EAS `production`, configure como `plaintext` ou `sensitive`:
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_CELESTE_API_URL` e uma entre
   `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
4. Para auto-submit, crie antes o app no Google Play Console e cadastre no EAS
   a conta de servico do Google Play. Nenhuma chave JSON deve entrar no Git.
5. Revise e faca commit de todas as mudancas. A branch precisa estar limpa e
   igual ao upstream do GitHub.

## Comandos

Somente conferir se o AAB pode ser iniciado:

```powershell
.\scripts\publicar-google-play.ps1 -CheckOnly
```

Conferir tambem a configuracao do caminho de envio a trilha interna:

```powershell
.\scripts\publicar-google-play.ps1 -CheckOnly -SubmitInternal
```

Iniciar o AAB de producao sem enviar ao Google Play:

```powershell
.\scripts\publicar-google-play.ps1 -StartBuild
```

Iniciar o AAB e agendar o envio automatico apenas para `internal`:

```powershell
.\scripts\publicar-google-play.ps1 `
  -StartBuild `
  -SubmitInternal `
  -ConfirmPlayPrerequisites
```

Ajuda completa:

```powershell
Get-Help .\scripts\publicar-google-play.ps1 -Full
```

## Portoes de seguranca

O processo encerra antes do build quando encontra Node incompativel, worktree
sujo, commit fora do upstream, login EAS ausente, `projectId` divergente,
variavel publica ausente/invalida, regra de exclusao de credenciais ausente ou
falha em `verify:android-release`/`verify:store`.

O auto-submit para `internal` exige a trilha `internal` no `eas.json`, os mesmos
portoes `verify:android-release` e `verify:store`, e a confirmacao explicita dos
pre-requisitos do Play. Essa trilha e usada para gerar e validar a evidencia do
AAB assinado e nao exige o formulario Data Safety.

O script nao envia para `closed`, `open` ou `production`. Essas trilhas continuam
bloqueadas ate `npm run verify:store:submission` passar, alem dos testes,
formularios e revisao exigidos pelo Google Play Console.

Referencias oficiais:

- https://docs.expo.dev/submit/android/
- https://docs.expo.dev/build/automate-submissions/
- https://docs.expo.dev/eas/environment-variables/manage/
