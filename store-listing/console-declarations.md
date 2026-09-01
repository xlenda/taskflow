# Declarações dos consoles

Guia de preenchimento para a versão `1.0.0`. Respostas marcadas como
`confirmar` não devem ser copiadas para produção sem comparar com o binário e
os contratos vigentes dos provedores.

Para o Google Play, usar como fonte principal
`google-play-console-prefill.md`. A primeira v1 Android tem uma fronteira mais
restrita do que o site e o iOS; as tabelas multiplataforma deste arquivo não
devem ser copiadas para o Data Safety Android sem aplicar essa fronteira.

## Identidade e distribuição

| Campo | Resposta preparada | Estado |
|---|---|---|
| Tipo | App | pronto |
| Idioma principal | Português (Brasil) | pronto |
| Idioma adicional | Inglês (Estados Unidos) | pronto |
| Bundle ID / package | `com.lenda.celeste` | pronto |
| Versão | `1.0.0` | pronto |
| Categoria | Saúde e fitness / Health & Fitness | pronto |
| Categoria Apple secundária | Estilo de vida / Lifestyle | pronto |
| Login obrigatório | Não, na versão atual | pronto |
| Anúncios | Nenhum SDK de anúncios identificado | confirmar no binário |
| Compra ou assinatura | Não ativa nesta versão | confirmar antes do envio |
| Público inicial | Recomendação: somente 18 anos ou mais | decisão do titular |
| Países, preço e liberação | Não definidos | conta da loja |
| Direitos e copyright | Titular ainda não informado | bloqueado |

## Classificação indicativa

Respostas candidatas para o questionário vigente de cada console:

- violência, conteúdo sexual, drogas, apostas e linguagem imprópria: não há
  conteúdo editorial desse tipo no produto atual;
- comunicação direta entre pessoas: não;
- conteúdo público criado por usuários: não nesta submissão; a Comunidade deve
  permanecer privada/desativada;
- conteúdo gerado/personalizado: sim; na v1 Android a criação paga em nuvem
  fica bloqueada, o conteúdo local permanece disponível e existe denúncia
  dentro do app;
- saúde: reflexão e bem-estar, sem diagnóstico, tratamento ou aconselhamento
  médico;
- acesso irrestrito à web: não;
- compras, ativos financeiros, empréstimos ou negociação: não;
- anúncios: não no código auditado.

O console pode usar rótulos diferentes. Responda pelo comportamento do binário,
não apenas pelo texto desta lista.

## Google Play: declarações adicionais

| Declaração | Resposta candidata | Verificação final |
|---|---|---|
| Público-alvo | 18+ | titular e política da conta |
| App de notícias | Não | binário final |
| App governamental | Não | binário final |
| Recursos financeiros | Não | binário final |
| Criação de conta | Não; a sessão anônima de denúncia não é uma conta visível | manter login e Supabase social fora do Android |
| Exclusão de conta | Não se aplica nesta v1 | a pergunta separada de exclusão de dados deve ser respondida |
| Health Apps Declaration | `Stress management, relaxation, mental acuity`; não médico | conferir no AAB e salvar no console |
| Foreground service | Não na v1 Android | confirmar no AAB que `FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_MEDIA_PLAYBACK` estão ausentes |
| Acesso do revisor | Fluxo inteiro sem login | testar build de produção |
| IARC | Sem categorias maduras conhecidas | preencher no console |

Tags candidatas: `Personal growth`, `Mindfulness`, `Journal`, `Meditation` e
`Well-being`. A taxonomia disponível varia no console; selecionar somente tags
que apareçam e descrevam o app real.

## Apple App Privacy e Google Data Safety

### Fronteira Data Safety da v1 Android

No Android, as APIs pagas de Anthropic, OpenAI, Gemini e ElevenLabs falham antes
de criar sessão ou fazer a chamada. O único fluxo intencional para fora do
aparelho é a denúncia opcional de conteúdo, que envia ao Supabase um UUID
pseudônimo, o conteúdo escolhido, motivo, nota opcional e metadados mínimos da
geração. O preenchimento exato está em `google-play-console-prefill.md`.

O Plano Celeste pede microfone somente após um toque e usa reconhecimento no
dispositivo quando suportado. A pessoa lê a afirmação que continua visível e a
repete duas vezes (`1/2` e `2/2`). Áudio e transcrição são descartados sem envio
ou armazenamento; somente um recibo mínimo fica local. Validar essa fronteira
novamente no AAB assinado e no tráfego de um Android físico.

As tabelas abaixo continuam sendo o inventário para web/iOS e para uma futura
release que habilite provedores em nuvem; não representam a v1 Android.

### Dados transmitidos fora do aparelho

| Tipo provável | Quando | Finalidade | Obrigatório | Tracking | Estado |
|---|---|---|---|---|---|
| Nome próprio | personalização em nuvem autorizada | funcionalidade do app | opcional | não identificado | Anthropic; OpenAI somente como failover; confirmar retenção |
| Respostas e desejos | geração de cena autorizada | funcionalidade do app | opcional | não identificado | Anthropic; OpenAI somente como failover |
| Cena salva e contexto visual reduzido | tradução ou imagem autorizada | funcionalidade do app | opcional | não identificado | Google Gemini |
| Texto da narração, idioma e narrador | toque em Play com consentimento | gerar áudio | opcional | não identificado | ElevenLabs TTS |
| Relato de sonho | reflexão em nuvem autorizada | gerar reflexão e afirmação | opcional | não identificado | Google Gemini; fallback local disponível |
| Sentimento e tema do sonho | reflexão/Espelho Vivo autorizados | personalização | opcional | não identificado | confirmar retenção |
| Cena anterior e contagens de progresso | novo capítulo do Espelho Vivo | personalização | opcional | não identificado | texto de Rastro não é enviado |
| IP, sinais de abuso e logs técnicos | chamadas ao backend | segurança e operação | técnico | não identificado | confirmar Vercel/BotID |

### Dados que permanecem locais no desenho atual

- manifestações, afirmações e histórico de prática;
- relato completo dos Rastros de Mudança;
- favoritos e visões salvas;
- configuração local do lembrete e do alarme;
- horários, dias, seleção e recibos mínimos do Plano Celeste, sem áudio ou
  transcrição reconhecida;
- nomes de filhos, pessoas importantes e pessoa específica nos campos próprios;
- áudio bruto de ditado: a Celeste recebe a transcrição fornecida pelo sistema,
  não envia a gravação por conta própria.
- áudio e transcrição do Plano Celeste: efêmeros e locais; a prática não faz
  fallback silencioso para reconhecimento em nuvem.

### Respostas que ainda dependem de contrato ou binário

- se cada dado é retido por Anthropic, OpenAI, Google Gemini, ElevenLabs,
  Vercel ou BotID e por quanto tempo;
- se o processamento pode ser marcado como efêmero;
- se a transferência ao provedor se qualifica como compartilhamento em cada
  loja;
- se dados técnicos ou identificadores são vinculados à pessoa;
- confirmação de criptografia em trânsito em todas as rotas;
- SDKs efetivamente incluídos no binário e suas coletas automáticas;
- política de exclusão quando contas ou comunidade pública forem ativadas.

Não marcar `dados não coletados`, `dados não compartilhados` ou
`processamento efêmero` por inferência. A revisão final deve usar o binário
assinado e os contratos ativos.

## Acessibilidade Apple

Preparar evidência no build nativo antes de selecionar os rótulos:

- VoiceOver e nomes acessíveis nos controles;
- Voice Control;
- texto ampliado sem corte;
- contraste suficiente;
- redução de movimento respeitada na abertura;
- legendas no preview da loja;
- áudio não ser o único meio de receber uma afirmação.
- afirmação permanecer visível durante a escuta e conclusão manual acessível
  existir quando o reconhecimento local não puder ser usado.

## Acesso para revisão

1. Escolher português ou inglês e concluir o questionário.
2. Usar a opção local para testar sem processadores de conteúdo em nuvem.
3. Abrir Cena-Âncora, Ponte de Hoje e Ritual de Um Minuto.
4. Registrar um sonho curto e gerar a afirmação local.
5. Ativar consentimento adulto separado para testar cena, sonho e narração em
   nuvem.
6. Testar notificações no app instalado.
7. Abrir o Plano Celeste, tocar para iniciar o microfone e ler a afirmação
   visível duas vezes; conferir `1/2`, `2/2`, cancelamento, `Agora não`,
   `Adiar 10 min` e conclusão manual.
8. Testar o despertador somente em iPhone compatível com o módulo nativo; ele é
   separado dos lembretes comuns do Plano Celeste.
