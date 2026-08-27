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

- [ ] autenticar chamadas nativas ao backend; a política de `Origin` atual foi
  validada apenas na web;
- [ ] substituir os rascunhos web por screenshots dos builds nativos;
- [ ] gravar preview nativo, localizar legendas e criar thumbnail;
- [ ] validar voz, notificações, consentimentos e fallback local no binário;
- [ ] testar AlarmKit em iPhone compatível antes de anunciá-lo;
- [ ] incluir mecanismo de denúncia para conteúdo gerado inadequado;
- [ ] ocultar a Comunidade no build de loja ou concluir conta, moderação,
  denúncia, bloqueio, exclusão e documentos próprios;
- [ ] conferir todos os SDKs e permissões do arquivo enviado;
- [ ] gerar builds assinados com versão e número de build definitivos.

## Titular e páginas públicas

- [ ] informar nome legal, copyright e email público de suporte;
- [ ] publicar política de privacidade em HTTPS;
- [ ] publicar página de suporte em HTTPS com contato real;
- [ ] preencher `store-listing/urls.json`;
- [ ] confirmar disponibilidade do nome composto nas duas lojas;
- [ ] confirmar preço, territórios e forma de liberação;
- [ ] decidir público-alvo inicial e faixas etárias;
- [ ] fornecer contato do revisor Apple;
- [ ] definir conta de demonstração somente se login entrar no build;
- [ ] registrar origem e direitos de mascote, vídeo, fontes, ícones e áudio.

## App Store Connect

- [ ] criar registro com bundle ID `com.lenda.celeste`;
- [ ] escolher `Health & Fitness` e `Lifestyle`;
- [ ] preencher classificação indicativa pelo comportamento do binário;
- [ ] preencher App Privacy com contratos e retenção confirmados;
- [ ] responder direitos de conteúdo e export compliance;
- [ ] enviar screenshots e preview nativos por idioma;
- [ ] associar build, notas de revisão e forma de liberação;
- [ ] conferir acessibilidade antes de selecionar rótulos públicos.

## Google Play Console

- [ ] criar app com package `com.lenda.celeste`;
- [ ] escolher `Health & Fitness` e até cinco tags disponíveis;
- [ ] informar website, email de suporte e política de privacidade;
- [ ] preencher público-alvo, IARC e declarações de conteúdo;
- [ ] preencher Health Apps Declaration;
- [ ] preencher Data Safety com o binário final;
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
