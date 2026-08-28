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
