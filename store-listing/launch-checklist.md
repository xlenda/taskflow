# Checklist de publicação

## Pacote ASO

- [x] nome, subtítulo, keywords e descrição Apple em `pt-BR` e `en-US`;
- [x] título, descrição curta e descrição completa Google nos dois idiomas;
- [x] oito screenshots localizados por loja;
- [x] textos alternativos e ordem narrativa das imagens;
- [x] ícone Apple, ícone Google com canal alfa e feature graphic;
- [x] mapa de palavras-chave sem números de volume inventados;
- [x] roteiro de preview de 25 segundos;
- [x] categorias, tags candidatas e plano de experimentos;
- [x] notas para revisão e declarações preliminares dos consoles;
- [x] validação automática de limites, dimensões e formatos.

## Produto e build

- [x] fechar as chamadas nativas pagas sem atestação antes de criar sessão ou
  acessar o backend; a v1 Android usa somente o fallback local;
- [ ] substituir os rascunhos web por screenshots dos builds nativos;
- [ ] gravar preview nativo, localizar legendas e criar thumbnail;
- [ ] validar lembrete comum, denúncia de IA, armazenamento, tráfego e fallback
  local no AAB instalado em Android físico;
- [ ] validar Plano Celeste em Android e iPhone físicos: visão e Cena-Âncora como
  alternativas, afirmação sempre visível, toque para microfone, duas leituras
  da afirmação (`1/2` e `2/2`), reconhecedor local
  disponível/ausente, permissão negada, conclusão manual, cancelamento,
  `Agora não` e `Adiar 10 min`;
- [ ] confirmar por inspeção de tráfego, logs e backup que áudio e transcrição
  do Plano Celeste não são armazenados nem enviados e que o app nunca bloqueia
  o aparelho;
- [ ] testar AlarmKit em iPhone compatível com afirmação, visão, Cena-Âncora,
  frase de sonho e frase própria antes de anunciá-lo;
- [x] incluir mecanismo de denúncia para conteúdo gerado inadequado nas quatro
  superfícies e validar o envio real no Supabase de produção;
- [ ] validar no build final a exclusão confirmada de todas as denúncias pelo
  Perfil, o estado sem sessão e a expiração automática em até 180 dias;
- [ ] validar o backup JSON legível: share sheet no app, download/restauração na
  web e ausência de denúncias, consentimentos, notificações e arquivos de imagem;
- [x] sincronizar as migrations Supabase `001` a `011`; o smoke live da denúncia
  passou e removeu a denúncia e o usuário criados para o teste;
- [x] ocultar aba, atalho e deep link da Comunidade na v1 Android e manter as
  políticas remotas desabilitadas por padrão;
- [x] excluir da v1 Android o despertador exato, seu módulo nativo e suas
  permissões, além da geração/narração paga em nuvem;
- [ ] regenerar o prebuild a partir da árvore final do Plano Celeste e confirmar SDK 57 com
  `compileSdk`/`targetSdk` 36, package, `versionCode`, autolinking do módulo de
  voz, `RECORD_AUDIO` e remoções explícitas de alarmes exatos, overlay e
  armazenamento legado, além da ausência de foreground service de áudio;
- [ ] conferir todos os SDKs e permissões do arquivo enviado;
- [ ] gerar builds assinados com versão e número de build definitivos.

## Titular e páginas públicas

- [ ] informar nome legal e copyright; e-mail público confirmado: `suporte@celestegroup.biz`;
- [ ] publicar política de privacidade em HTTPS;
- [ ] publicar página de suporte em HTTPS com contato real;
- [x] preencher `store-listing/urls.json` com os caminhos públicos preparados;
- [ ] confirmar disponibilidade do nome composto nas duas lojas;
- [ ] confirmar preço, territórios e forma de liberação;
- [ ] decidir público-alvo inicial e faixas etárias;
- [ ] fornecer contato do revisor Apple;
- [ ] definir conta de demonstração somente se login entrar no build;
- [ ] registrar origem e direitos de mascote, vídeo, fontes, ícones e áudio.

## App Store Connect

- [ ] criar registro com bundle ID `com.celesteapp.affirmations`;
- [ ] escolher `Health & Fitness` e `Lifestyle`;
- [ ] preencher classificação indicativa pelo comportamento do binário;
- [ ] preencher App Privacy com contratos e retenção confirmados;
- [ ] conferir descrições de uso de microfone e reconhecimento de fala e
  explicar nas notas que o Plano Celeste usa processamento local e efêmero;
- [ ] responder direitos de conteúdo e export compliance;
- [ ] enviar screenshots e preview nativos por idioma;
- [ ] associar build, notas de revisão e forma de liberação;
- [ ] conferir acessibilidade antes de selecionar rótulos públicos.

## Google Play Console

- [x] verificação da organização concluída em 03/09/2026 segundo relato do
  titular; conferir visualmente no Play Console quando houver login disponível,
  sem solicitar ou registrar novamente o D-U-N-S;
- [ ] criar app com package `com.celesteapp.affirmations`;
- [ ] escolher `Health & Fitness` e até cinco tags disponíveis;
- [ ] informar website, email de suporte e política de privacidade;
- [ ] preencher público-alvo, IARC e declarações de conteúdo;
- [ ] preencher Health Apps Declaration;
- [ ] preencher Data Safety com o binário final;
- [ ] declarar e justificar `RECORD_AUDIO`; confirmar que o fluxo local não
  adiciona `Audio files` coletado/compartilhado e que não há permissão de alarme
  exato;
- [ ] declarar ausência de anúncios, contas e compras somente após confirmar;
- [ ] enviar ícone, feature graphic, screenshots e vídeo localizado;
- [ ] concluir teste fechado exigido para o tipo da conta, quando aplicável;
- [ ] revisar países, preço e rollout antes de publicar.

## Validação

Durante a preparação:

```powershell
npm run verify:store
```

Antes do envio, o comando abaixo deve terminar sem avisos nem falhas:

```powershell
npm run verify:store:submission
```
