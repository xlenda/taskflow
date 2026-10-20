# Registro de origem dos assets

Inventário técnico para a resposta de direitos de conteúdo. O titular ainda
precisa guardar comprovantes e confirmar uso comercial antes da submissão.

| Asset | Arquivo/origem | Uso | Estado |
|---|---|---|---|
| Mascote Celi | `assets/mascot/celi.png`, fornecido no projeto | app e camada adaptativa Android | propriedade/licença a confirmar |
| Ícone Celeste v2 | gerado com OpenAI ImageGen em 26/08/2026 a partir da Celi | ícone e materiais de loja | termos da conta e aprovação do titular a arquivar |
| Ícones de interface | Ionicons via `@expo/vector-icons` | controles do app | registrar licença da versão instalada |
| Fontes | fontes do sistema definidas no app e nos renders | interface e screenshots | sem arquivo de fonte próprio identificado |
| Vídeo de abertura | `public/video/celeste-abertura.mp4`, criação Higgsfield fornecida pelo titular | abertura do app | plano, licença comercial e prompt a arquivar |
| Poster do vídeo | `public/video/celeste-abertura-poster.jpg` | fallback da abertura | confirmar como derivado do vídeo autorizado |
| Screenshots | interface real com dados sintéticos controlados | rascunhos ASO | substituir por captura nativa antes do envio |
| Feature graphic | composição automatizada da UI e do ícone Celeste v2 | Google Play | derivado dos assets acima |
| Vozes | vozes da ElevenLabs configuradas no backend | áudio sob demanda | confirmar termos comerciais da conta ElevenLabs ativa |
| Cenas prontas | 42 × `assets/scenes/*.jpg`, FLUX.1 [schnell] no Cloudflare Workers AI, 20/10/2026 | revelação, cards e o que é compartilhado quando não há imagem pessoal | **gerado por IA**; termos conferidos (seção abaixo); declarar IA na ficha |
| Prévias de voz | 12 × `assets/audio/previews/*.wav`, texto para fala da ElevenLabs, 27/08/2026 | prévia do narrador no site; os arquivos também vão no app | **gerado por IA**; plano da conta e tipo de 3 vozes a confirmar |

## Registro da geração do ícone

- Ferramenta: OpenAI ImageGen.
- Método: edição/recriação visual baseada no arquivo local da Celi.
- Direção usada: retrato aproximado e reconhecível da mesma mascote, brilho azul
  e dourado, estrela frontal, fundo azul limpo, composição quadrada, sem texto.
- Resultado mestre: `assets/icon-celeste-v2.png` (`1254 x 1254`).
- Derivados: `store-listing/assets/final/icons/apple-icon-1024.png` e
  `store-listing/assets/final/icons/google-play-icon-512.png`.

## Antes de responder Content Rights

1. Guardar recibos, termos do plano e data de criação do vídeo e das imagens.
2. Confirmar que nenhuma referência enviada à ferramenta contém material sem
   autorização.
3. Arquivar licenças das dependências de ícones.
4. Confirmar os termos comerciais da ElevenLabs para a conta que gera áudio.
5. Atualizar `submission-readiness.json` com o caminho das evidências.

## Evidência técnica atualizada em 02/09/2026

- `@expo/vector-icons` 15.1.1: licença MIT arquivada na dependência instalada
  (`node_modules/@expo/vector-icons/LICENSE`). A interface usa Ionicons por esse
  pacote; a licença permite uso e distribuição com preservação do aviso.
- O app usa fontes do sistema; a inspeção do repositório não encontrou arquivo
  de fonte próprio distribuído no binário.
- SHA-256 da mascote `assets/mascot/celi.png`:
  `C8DD343B2533F28919365D3D5D67541084625D0F482E1113F956C559B470D96E`.
- SHA-256 do ícone `assets/icon-celeste-v2.png`:
  `05C1F374055F4BECA21AF8A8EE6C72E027BFC2DFCFB66A122B2F204DE5136671`.
- SHA-256 do vídeo `public/video/celeste-abertura.mp4`:
  `39155E3EADAEB0BAC0B054921E7B68D28950407E7C1537A0240C91A105BE3D99`.
- SHA-256 do poster `public/video/celeste-abertura-poster.jpg`:
  `03F4B5DD189411C3CF5AE15457B53DB337940F9A4947B2ACC5A9C508ACA34446`.

Esses hashes identificam exatamente os arquivos auditados, mas não substituem
os comprovantes comerciais da Celi, do vídeo, do ícone gerado por IA e das
vozes. Essa confirmação continua sendo responsabilidade da titular.

## Cenas prontas e prévias de voz (registro de 20/10/2026)

Os dois conjuntos são **gerados por IA**. A Play pede autodeclaração de IA em
cada imagem ou vídeo enviado à ficha
(https://support.google.com/googleplay/android-developer/answer/17262077):
marcar "gerado por IA" nas capturas e artes que mostrarem as cenas prontas.

### Cenas prontas (`assets/scenes/`, 42 JPEG 720 x 900)

- Gerador: `C:\Users\Sanches\.claude\zeus-imagem.js`, que chama a API do
  Cloudflare Workers AI com o modelo `@cf/black-forest-labs/flux-1-schnell`
  (FLUX.1 [schnell], da Black Forest Labs), `steps: 4`, na cota grátis (Workers
  Free) da conta Cloudflare usada pelo Zeus. O script de lote da Task 1 só passou
  prompt e arquivo de saída, então valeu esse modelo padrão.
- Processo: 60 gerações em 20/10/2026, 42 aprovadas uma a uma. Prompts sem
  pessoas, sem texto e sem marcas, seguindo `api/gerar-visual.js`; recorte
  central 4:5 e escala para 720 x 900 com ffmpeg. Em `home-Career.jpg`, a marca
  de um lápis foi coberta com pixels da própria imagem. Os prompts de cada
  tentativa estão no relatório local da Task 1
  (`.superpowers/sdd/2026-10-20-celeste-despertar-compartilhar-cena-viva/task-1-report.md`,
  fora do git); arquivar junto com os comprovantes.
- Versão exata dos arquivos: commit `b39a40e`.
- Termos conferidos nas páginas oficiais em 20/10/2026:
  - Cloudflare, termos do Developer Platform, item "Cloudflare Workers AI; AI
    Gateway": as saídas são Customer Content e o cliente mantém os direitos sobre
    entradas e saídas; os modelos são produtos de terceiros e valem os termos
    padrão do fornecedor do modelo
    (https://www.cloudflare.com/service-specific-terms-developer-platform/).
  - A página do modelo na Cloudflare aponta "Terms and License" para os termos da
    Black Forest Labs
    (https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/ e
    https://bfl.ai/legal/terms-of-service). Neles a BFL não reivindica a
    propriedade do Output (1.2(a)) e proíbe apresentá-lo como feito só por
    pessoas ou como foto real de um fato real, e também usá-lo para treinar
    outros modelos.
  - Os pesos do FLUX.1 [schnell] têm licença Apache-2.0 (repositório oficial
    https://github.com/black-forest-labs/flux, `model_licenses/LICENSE-FLUX1-schnell`).
- A confirmar: comprovante da conta Cloudflare usada e cópia datada desses termos.

### Prévias de voz (`assets/audio/previews/`, 12 WAV)

- Arquivos: 6 narradores × pt/en, PCM 16 bits, 24 kHz, mono, de 4,6 s a 7,1 s
  (cabeçalhos conferidos). Entraram no commit `483c2ae` (27/08/2026) junto com
  `scripts/capture-narrator-previews.js`.
- Como foram feitas: o script chama `/api/gerar-audio` no modo `preview`, com
  texto fixo e sem dado pessoal. Em pt: "Respire com calma. A vida que você está
  construindo começa no próximo passo possível."; em en: "Take a calm breath. The
  life you are building begins with the next possible step." Nesse commit a rota
  usa o texto para fala da ElevenLabs (`https://api.elevenlabs.io/v1/text-to-speech`,
  saída `pcm_24000` embrulhada em WAV), com o modelo de `ELEVENLABS_TTS_MODEL` ou
  o padrão `eleven_multilingual_v2`. O WAV não guarda o provedor: a origem vem do
  código desse commit e da decisão registrada em
  `docs/DOSSIE-MESTRE-PRODUTO-CELESTE.md` ("Decisão de voz fechada em
  25/08/2026"). O valor da variável no dia da captura não ficou registrado.
- Vozes, pelos nomes no código de 27/08: Aurora = "Livia - Warmth You Can Hear";
  Rio = "River - Relaxed, Neutral, Informative"; Atlas = "Brian - Deep, Resonant
  and Comforting"; Serena = "Melodie narradora"; Luma = "Keren - Young Brazilian
  Female"; Nilo = "Daniel - Steady Broadcaster". A confirmar na conta quais são
  vozes padrão da ElevenLabs e quais vêm da Voice Library.
- Termos conferidos em 20/10/2026 (https://elevenlabs.io/terms-of-use, versão de
  09/10/2026): usuário grátis só pode usar para fins não comerciais; usuário de
  plano pago pode usar comercialmente; entre o usuário e a ElevenLabs, quem gerou
  mantém os direitos sobre o Output. Pelo Voice Library Addendum
  (https://elevenlabs.io/vla, versão de 06/03/2026), o que foi gerado com uma voz
  da biblioteca antes do fim do prazo de aviso continua disponível para uso
  mesmo se a voz for retirada.
- A confirmar: o plano da conta ElevenLabs em 27/08/2026. Se era o grátis, as 12
  prévias não servem para uso comercial e precisam ser geradas de novo num plano
  pago (`node scripts/capture-narrator-previews.js --force`).
