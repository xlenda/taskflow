# Celeste store listing

Pacote de ASO da Celeste para App Store e Google Play, preparado em 26/08/2026.

## O que esta pronto

- posicionamento, mapa de busca e regras de copy;
- metadados completos em `pt-BR` e `en-US`;
- oito screenshots planejados e localizados;
- textos alternativos para Google Play;
- roteiro de video de 25 segundos;
- matriz de privacidade, declaracoes dos consoles e checklist de publicacao;
- mapa de palavras-chave, notas de versao e plano de experimentos;
- gerador de rascunhos visuais e validador automatico.

## Estrutura

```text
store-listing/
  pt-BR/{apple,google-play}/   textos prontos para os consoles
  en-US/{apple,google-play}/   textos prontos para os consoles
  strategy.md                  posicionamento e mapa de palavras
  screenshots.json             ordem, headlines e alt text
  preview-video.md             roteiro do video da loja
  requirements.md              especificacoes oficiais
  privacy-review.md            declaracoes a confirmar antes do envio
  console-fields.json          campos comuns preparados para os consoles
  console-declarations.md      respostas candidatas de conteudo e dados
  google-play-console-prefill.md respostas exatas da fronteira Android v1
  keyword-map.csv              portfolio inicial de termos por intencao
  experiments.md               testes de conversao apos o lancamento
  launch-checklist.md          caminho completo ate a submissao
  submission-readiness.json    provas exigidas pelo validador final
  asset-rights.md              origem e licencas a confirmar
  assets/                      materiais gerados pelo script
```

## Comandos

```powershell
npm run capture:store
npm run render:store
npm run verify:store
npm run verify:store:submission
```

`capture:store` produz rascunhos honestos a partir da interface real do app web,
sem chamar Gemini nem gerar audio pago. Antes do envio final, substitua os raws
por capturas do build nativo em iPhone e Android e rode novamente `render:store`.

`verify:store` valida o pacote de trabalho e mostra bloqueios externos como
avisos. `verify:store:submission` transforma esses bloqueios em falhas; use-o
antes de enviar a ficha as lojas.

## Bloqueios externos

Os arquivos nao inventam dados que ainda nao existem. Antes da publicacao, o
responsavel pela conta precisa fornecer:

- nome legal e email publico de suporte;
- URLs publicas de privacidade e suporte;
- disponibilidade do nome composto no App Store Connect;
- formularios finais de App Privacy e Data Safety;
- capturas nativas e teste do despertador em iPhone compativel;
- credenciais e acesso aos consoles Apple e Google.

Nao divulgar Comunidade como recurso publico enquanto conta, moderacao, denuncia,
bloqueio e documentos proprios nao estiverem ativos. Nao divulgar despertador na
Google Play: a implementacao atual e exclusiva de iPhone compativel.
