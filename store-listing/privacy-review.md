# App Privacy e Data Safety

Esta e uma matriz de engenharia, nao uma declaracao juridica final. Conferir com
os contratos dos provedores e com a versao exata enviada para as lojas.

## Fluxos observados no produto

| Fluxo | Origem | Destino | Finalidade | Controle atual |
|---|---|---|---|---|
| Cena personalizada | respostas selecionadas | backend Celeste e Gemini | gerar Cena-Âncora | consentimento adulto separado |
| Narracao | texto final, idioma e narrador | backend Celeste e Gemini TTS | devolver audio solicitado | play manual e consentimento separado |
| Sonho em nuvem | transcricao, sentimento e tema | backend Celeste e Gemini | criar reflexao e afirmacao | consentimento separado; fallback local |
| Espelho Vivo | cena anterior e progresso estruturado | backend Celeste e Gemini | criar novo capitulo | acao explicita; rastros completos ficam fora |
| Pratica local | manifestacoes, sonhos e historico | aparelho | continuidade do produto | edicao, exclusao e reset local |
| Comunidade | rascunho escolhido | local hoje; Supabase planejado | envio moderado futuro | nao anunciar como publico nesta versao |

## Pontos a declarar ou confirmar

- Conteudo do usuario enviado para gerar cenas, sonhos e voz.
- Nome e dados de perfil que permanecem locais versus campos realmente enviados.
- Retencao e uso dos dados por Gemini conforme o contrato pago ativo.
- Supabase, autenticacao e dados sociais somente quando forem habilitados.
- Logs operacionais, IP, protecao contra abuso e prazos de retencao na Vercel.
- Qualquer analytics, crash reporting ou attribution adicionado ao build nativo.
- Permissoes de notificacao, microfone/reconhecimento de fala e AlarmKit.

## Respostas que nao podem ser presumidas

- `Dados nao coletados`: nao marcar sem revisar a definicao especifica de cada loja.
- `Dados nao compartilhados`: processamento por provedor precisa ser classificado
  conforme finalidade, retencao e papel contratual.
- `Criptografado em transito`: confirmar em todos os endpoints do build final.
- `Exclusao disponivel`: hoje existe reset local; se contas forem ativadas, as
  lojas exigem exclusao da conta e dos dados associados.

## Bloqueios antes da revisao

- publicar uma pagina externa de privacidade;
- publicar uma pagina de suporte com contato real;
- adicionar mecanismo para denunciar conteudo gerado inadequado;
- validar permissoes e manifests do build nativo;
- preencher App Privacy e Data Safety a partir do binario final;
- se Comunidade for ativada, publicar regras, moderacao, denuncia e bloqueio;
- se contas forem ativadas, oferecer exclusao dentro do app e pela web.

Fontes:

- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- https://developer.apple.com/app-store/review/guidelines/
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/13985936
- https://support.google.com/googleplay/android-developer/answer/9876937
