# Play Integrity — passo a passo (voz e textos com IA da Celeste no Android)

**Para que serve.** É a verificação do Google que prova ao servidor da Celeste que o pedido de voz veio do app oficial, baixado da Google Play, num celular Android de verdade. Sem ela, o servidor recusa o pedido e o app toca a voz do próprio celular, com aviso. Isso impede que alguém gaste os créditos da sua conta da ElevenLabs fora do app.

**Também libera os textos com IA (desde 21/10), sem passo extra.** A mesma configuração deste guia vale para a Cena-Âncora e as visões e afirmações das seis áreas escritas pela IA a partir das respostas dela. Sem a verificação, o servidor recusa também esse pedido e ela continua vendo os textos montados no próprio celular com as respostas dela, sem IA e sem aviso de erro. Isso protege da mesma forma os créditos dos provedores de texto.

**Quanto tempo:** uns 30 minutos.

Conferi cada passo nas páginas oficiais do Google, da Vercel e da Expo em 21/10/2026. Onde está escrito **não verificado**, eu não consegui confirmar o nome exato do menu ou do botão.

## Antes de começar

- O app Celeste já criado no Play Console (depende da conta verificada, item B1 da auditoria).
- Acesso de dono ou administrador ao Play Console, ao Google Cloud (pode ser a mesma conta Google), à Vercel (projeto `celeste`) e à Expo (organização `celestegroup`).
- O código da voz no Android já no GitHub (tarefas V1 e V2 do plano de 21/10) e o dos textos com IA (tarefa T1 do plano dos textos, também de 21/10). O agente avisa quando estiver.

> **Regra de ouro:** a chave (o arquivo `.json` e o texto em base64) é uma senha. Ela só vai para a Vercel. Nunca cole a chave no chat, no WhatsApp, no GitHub nem em arquivos do projeto.

## Passo 1 — Projeto no Google Cloud

1. Abra https://console.cloud.google.com e entre com a conta Google da Celeste.
2. No seletor de projeto, no topo da tela, crie um projeto novo (sugestão de nome: `celeste-play-integrity`) ou escolha um projeto da Celeste que já exista. O Google aceita os dois. O nome dos botões do seletor: **não verificado**.
3. Anote o **número do projeto**. Ele aparece na página **Welcome** (boas-vindas) do console, logo abaixo do título, junto com o nome e o ID. Use o **número**, que tem só dígitos (exemplo: `464036093014`). Não use o ID, que é texto (exemplo: `celeste-play-integrity`).

## Passo 2 — Ligar a Play Integrity API

1. No Google Cloud, com o projeto do passo 1 escolhido, vá em **APIs and services** (APIs e serviços) e clique em **Enable APIs and services** (Ativar APIs e serviços).
2. Busque **Play Integrity API** e clique em **Enable** (Ativar).

Se você pular este passo, o vínculo do passo 3 liga a API sozinho.

## Passo 3 — Vincular o projeto no Play Console

1. Abra https://play.google.com/console e escolha o app Celeste.
2. No menu da esquerda, clique em **Protected with Play**. O nome desse menu com o Console em português: **não verificado**.
3. Na seção **Play Integrity API**, clique em **Get started**.
4. Escolha **Link existing project**, selecione o projeto do passo 1 e clique em **Link cloud project**.

Observações:
- Se o seu menu não tiver **Protected with Play**, procure **App integrity** dentro de **Test and release**. Esse era o caminho em versões anteriores da documentação do Google.
- Não precisa mexer em **Responses** (respostas). O servidor usa só as respostas que já vêm ligadas: app reconhecido pela Play e aparelho certificado.
- **Não verificado:** se o botão aparece antes do primeiro envio de AAB. Se não aparecer, faça o passo 8 primeiro e volte aqui.

## Passo 3b — Alerta de cota e pedido de aumento (logo depois do vínculo)

O Google dá ao projeto 10 mil verificações por dia. Cada pedido de voz ou de textos gasta uma. Se acabarem, o Android toca a voz do celular e mostra os textos montados no celular até o dia seguinte. O Google diz que o aumento pode levar até uma semana, então peça logo depois do passo 3.

1. **Alerta:** no Google Cloud, com o projeto do passo 1 escolhido, abra **IAM & Admin → Quotas & System Limits** (IAM e administrador → Cotas e limites do sistema) e busque **Play Integrity**. Na linha da cota diária, clique em **More actions** (os três pontos) → **Create usage alert**. Em **Configure notifications**, escolha o seu e-mail e clique em **Create**.
2. **Aumento:** preencha o formulário do Google: https://support.google.com/googleplay/android-developer/contact/piaqr. O Google só aceita com o projeto já vinculado (passo 3) e com o app disponível na Google Play. Se recusar por isso, peça de novo quando o app estiver publicado.

**Não verificado:** se a cota da Play Integrity aparece nessa página do Google Cloud. O Google avisa que nem todo serviço mostra a cota ali. Se não aparecer, me chame.

## Passo 4 — Conta de serviço e chave JSON

É o "login" que o servidor usa para perguntar ao Google se a verificação é válida.

1. No Google Cloud, no mesmo projeto, abra a página de **Service accounts** (contas de serviço). Ela fica em **IAM & Admin** (IAM e administrador). O caminho exato no menu: **não verificado**. Se não achar, digite "Service accounts" na busca do topo do console.
2. Clique em **Create service account**, dê o nome `celeste-play-integrity` e clique em **Done**. Não escolha nenhum papel (role): o Google diz que os papéis são opcionais, e a página da Play Integrity só pede uma conta de serviço no projeto vinculado. Se o teste do passo 9 falhar por falta de permissão, me chame; isso eu **não verifiquei na prática**.
3. Na lista, clique no e-mail da conta que você criou, abra a aba **Keys**, clique em **Add key** e depois em **Create new key**. Escolha **JSON** e clique em **Create**.
4. O arquivo baixa na hora, **uma única vez**. O Google não deixa baixar de novo.

**Se aparecer um bloqueio de política** (`iam.disableServiceAccountKeyCreation`): organizações do Google Cloud criadas a partir de 03/05/2024 bloqueiam chaves por padrão. Não desligue essa política para a organização inteira. Me chame: dá para liberar só este projeto, e isso exige o papel de administrador de políticas da organização.

## Passo 5 — Transformar o JSON em base64, sem mostrar na tela

1. Abra o **PowerShell** (não o Prompt de Comando).
2. Rode as duas linhas abaixo, trocando `NOME-DO-ARQUIVO` pelo nome do arquivo que baixou:

```powershell
$arquivo = "$env:USERPROFILE\Downloads\NOME-DO-ARQUIVO.json"
[Convert]::ToBase64String([IO.File]::ReadAllBytes($arquivo)) | Set-Clipboard
```

O texto vai direto para a área de transferência (o Ctrl+C), sem aparecer na tela. Siga para o passo 6 sem copiar mais nada no meio.

## Passo 6 — Colocar a chave na Vercel (projeto `celeste`, Production)

1. Abra https://vercel.com, escolha o time onde está o projeto **celeste** e entre no projeto.
2. Abra **Environment Variables** (variáveis de ambiente), no menu lateral do projeto.
3. Em **Type**, escolha **Secret**. A Vercel trocou o antigo "Sensitive" por "Secret": depois de salvo, ninguém consegue ler o valor.
4. Em **Key**, escreva exatamente `CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64`.
5. Em **Value**, cole com Ctrl+V.
6. Em ambientes, marque **somente Production**.
7. Clique em **Save**.
8. Limpe a área de transferência. No PowerShell: `Set-Clipboard -Value ' '`
9. Guarde o arquivo `.json` fora da pasta do projeto, num lugar seguro (um gerenciador de senhas, por exemplo), ou apague o arquivo. Se perder, é só criar outra chave (passo 4) e apagar a antiga.

A variável só passa a valer no próximo deploy (passo 8).

## Passo 7 — Número do projeto na Expo (EAS), ambiente production

1. Abra https://expo.dev, organização **celestegroup**, projeto da Celeste.
2. Vá em **Project settings** → **Environment variables** → **Add Variables**.
3. Preencha:
   - **Name:** `EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER`
   - **Value:** o **número** do projeto do passo 1 (só dígitos)
   - **Environment:** `production`
   - **Visibility:** **Plain text**. O número não é segredo, porque vai dentro do app. O script de publicação recusa `Secret` em variáveis que começam com `EXPO_PUBLIC_`.
4. Salve. A variável deve aparecer com a marca **production**.

Também dá para fazer pelo terminal, com o comando que a documentação da Expo mostra (eu não rodei):
`eas env:set --name EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER --value SEU_NUMERO --environment production --visibility plaintext`

## Passo 8 — Deploy do servidor e AAB novo

Peça ao agente, ou rode nesta ordem, na pasta `C:\projetos\TaskFlow`:

1. `.\scripts\deploy-web-from-vercel.ps1` — publica o servidor já com a chave.
2. `.\scripts\publicar-google-play.ps1 -StartBuild` — gera o AAB com o número do projeto. Variáveis `EXPO_PUBLIC_` entram no app na hora do build: se o número mudar, precisa de um AAB novo.
3. Para gerar e já mandar só para a trilha interna, depois da conta e do app prontos: `.\scripts\publicar-google-play.ps1 -StartBuild -SubmitInternal -ConfirmPlayPrerequisites`.

## Passo 9 — Testar pela trilha interna

1. Instale a Celeste pelo link de teste interno, **pela Play Store**, num celular Android de verdade.
2. Escolha uma voz em **Perfil → Voz da narração**.
3. Toque para ouvir uma afirmação, uma visão ou a sua história. Na primeira vez, confirme que tem 18 anos ou mais e permita a voz e os textos com IA.
4. **Deu certo** se tocar a voz do narrador escolhido, a mesma da prévia.
5. **Está falhando** se tocar a voz robótica do celular, com aviso.
6. Confira também, na mesma tela, o botão **Denunciar este conteúdo de IA**.
7. **Textos:** depois de permitir, abra **Visões** e **Afirmações**. Em até um minuto, os textos das seis áreas e a Cena-Âncora trocam pela versão escrita pela IA a partir das suas respostas, e cada tela tem **Denunciar este conteúdo de IA**. Se continuarem os textos montados no celular (sem nenhum aviso), a verificação falhou: confira a lista abaixo, que vale igual para a voz e para os textos. Depois de uma recusa, o celular espera 24 horas antes de pedir esses textos sozinho de novo (para não gastar uma verificação do Google a cada abertura); depois de corrigir, crie um desejo novo na **Início** (esse pedido não espera) ou apague os dados do app para testar na hora.
8. **Tradução:** com os textos da IA na tela, troque o idioma do app. A Cena-Âncora escrita pela IA aparece traduzida (Google Gemini, com a mesma verificação).

**Se tocar a voz do celular, confira nesta ordem:**
- **Esperado, não é defeito:**
  - app instalado por fora da Play: APK do EAS, build "preview" ou cabo. O Google só reconhece o app baixado pela Play;
  - emulador, celular com root ou com o bootloader desbloqueado: o Google não confirma o aparelho;
  - celular sem internet.
- **Configuração:**
  - variável da Vercel ausente, com nome errado ou sem deploy novo (passos 6 e 8);
  - número do projeto errado, ou AAB gerado antes do passo 7;
  - projeto não vinculado no Play Console (passo 3).
- **Limite:** o padrão é de 10 mil verificações por dia. O alerta e o pedido de aumento estão no passo 3b.

**O motivo de cada recusa fica no log da Vercel.** O celular recebe sempre a mesma recusa (`native_attestation_required`). O servidor escreve uma linha no log com o motivo:

1. Na Vercel, abra o projeto **celeste** e clique em **Logs**, no menu lateral.
2. Na busca, digite `play_integrity_rejected`.
3. Cada recusa aparece assim: `{"event":"play_integrity_rejected","reason":"stale","googleStatus":null}`. A linha nunca mostra o token, o texto, a sessão nem a chave.
4. Olhe logo depois do teste. A Vercel guarda esses logs por pouco tempo: 1 hora no plano Hobby, 1 dia no Pro.

| `reason` (motivo) | Causa provável | O que fazer |
|---|---|---|
| `no_credentials` | A chave do Google não está na Vercel, está com o nome errado ou não é um JSON de conta de serviço. Ou o deploy é anterior a ela. | Refaça os passos 5 e 6 e o deploy do passo 8. |
| `auth_http_400` ou `auth_http_401` | O Google recusou a chave da conta de serviço: chave apagada, trocada ou colada pela metade. | Crie outra chave (passos 4 a 6) e faça o deploy (passo 8). |
| `auth_http_` com outro número, ou `auth_invalid_response` | O login da conta de serviço falhou do lado do Google. | Espere alguns minutos e teste de novo. Se continuar, me chame. |
| `decode_http_403` | Falta permissão: a conta de serviço não é do projeto vinculado, ou a Play Integrity API não está ligada nesse projeto. | Confira se os passos 2, 3 e 4 usaram o mesmo projeto. Se estiver tudo certo, me chame. |
| `decode_http_400` | O Google não reconheceu o token: app modificado ou token cortado no caminho. | No seu celular de teste, instale de novo pela Play. Vindo de outro celular, é tentativa de abuso: nada a fazer. |
| `decode_http_429` | Acabou a cota diária de verificações do Google. | Passo 3b (alerta e aumento). A cota volta no dia seguinte. |
| `decode_http_500` a `decode_http_599`, `timeout` ou `network_error` | O Google ficou fora do ar ou demorou mais de 5 segundos. | Nada: passa sozinho. Se durar mais de uma hora, me chame. |
| `decode_http_` com outro número, ou `decode_invalid_response` | O Google recusou por outro motivo ou respondeu sem o resultado. | Me chame e diga o número. |
| `package_mismatch` ou `app_package_mismatch` | O token é de outro app. | Nada: é tentativa de abuso ou cópia do app. |
| `hash_mismatch` | O token não é deste pedido: o pedido mudou depois do token, o token veio de outra sessão (reaproveitado), ou o app e o servidor estão em versões diferentes. | No seu celular: faça o deploy do servidor e gere um AAB novo com o mesmo código (passo 8). Vindo de outro celular, nada a fazer. |
| `stale` | O token chegou com mais de 2 minutos: internet muito lenta ou relógio do celular atrasado. | Ligue data e hora automáticas no celular e teste de novo. |
| `future` | O horário do token está no futuro: relógio do celular adiantado. | Ligue data e hora automáticas no celular e teste de novo. |
| `not_play_recognized` | O app não veio da Play (APK do EAS, build "preview", cabo), ou o mesmo token foi usado duas vezes. | Instale pela trilha interna, pela Play Store (item 1 deste passo). |
| `device_integrity_missing` | Emulador, celular com root ou com o bootloader desbloqueado. | Esperado: teste num celular comum. |
| `no_token` | Pedido que diz vir do Android, mas sem a verificação. O app oficial não envia pedido assim. | Nada: não é o app. |
| `client_not_supported` | Pedido que diz vir do iPhone. | Nada: o iPhone não tem a voz nem os textos em nuvem nesta versão. |
| `operation_not_allowed` | Pedido do Android para outra coisa além da voz, dos textos e da tradução da cena (imagem, sonho ou Espelho Vivo). | Nada: no Android só a voz, os textos e a tradução da cena (pelo Google Gemini, quando ela troca o idioma) vão para a nuvem. |
| `unknown` | Erro inesperado no servidor. | Me chame. |

**Opcional:** em **Protected with Play → Play Integrity API → Manage → Testing → Create new test**, o Play Console permite escolher respostas de teste para os e-mails dos testadores. Serve para ver de propósito o caminho da voz do celular.

## Se a chave vazar

1. No Google Cloud, abra a conta de serviço → aba **Keys** → apague a chave.
2. Crie outra (passos 4 e 5).
3. Na Vercel, edite a variável (menu de três pontos → **Edit**), cole o valor novo e salve.
4. Faça um deploy novo (passo 8, item 1).

## O que eu não consegui verificar

- Os nomes dos menus com o Play Console e o Google Cloud em português.
- O caminho exato no menu até **Service accounts** no Google Cloud (a documentação só dá o link direto).
- Se a conta de serviço precisa de algum papel (role). Pela documentação, não precisa.
- Se o vínculo do passo 3 aparece antes do primeiro AAB enviado.
- Se a cota da Play Integrity aparece em **Quotas & System Limits** para criar o alerta do passo 3b.
- As causas da tabela do passo 9 são as prováveis; o Google não lista todas as causas de cada código.
- O comando `eas env:set` não foi rodado.

## Fontes oficiais

- Configuração da Play Integrity (cota e pedido de aumento): https://developer.android.com/google/play/integrity/setup
- Alertas de cota no Google Cloud: https://docs.cloud.google.com/docs/quotas/set-up-quota-alerts
- Logs da Vercel (onde ver e por quanto tempo ficam): https://vercel.com/docs/logs/runtime
- Pedido padrão e decodificação no servidor (conta de serviço): https://developer.android.com/google/play/integrity/standard
- Respostas (veredictos): https://developer.android.com/google/play/integrity/verdicts
- Dados tratados pela Play Integrity: https://developer.android.com/google/play/integrity/terms
- Ajuda do Play Console (Protected with Play, vínculo e testes): https://support.google.com/googleplay/android-developer/answer/11395166
- Criar conta de serviço: https://docs.cloud.google.com/iam/docs/service-accounts-create
- Criar chave JSON e a política que bloqueia chaves: https://docs.cloud.google.com/iam/docs/keys-create-delete
- Variáveis Secret na Vercel: https://vercel.com/docs/environment-variables/sensitive-environment-variables
- Variáveis na Vercel valem só em deploy novo: https://vercel.com/docs/environment-variables
- Variáveis no EAS: https://docs.expo.dev/eas/environment-variables/manage/
