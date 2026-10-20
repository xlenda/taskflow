# Notas para revisao

Modelo interno. Completar dados de contato e caminhos exatos no build final.

## Acesso

- A versao atual nao exige conta para concluir o onboarding e usar a pratica local.
- Se login for ativado antes do envio, fornecer uma conta de demonstracao que nao expire.

## Conteudo personalizado

- A Celeste funciona sem personalizacao em nuvem por meio do gerador local.
- O onboarding cria a primeira Cena-Âncora no aparelho e deixa o processamento
  em nuvem desligado; não existe pergunta de consentimento no fim do questionário.
- Os textos de cenas usam Anthropic, com OpenAI como failover; se nenhum deles
  estiver configurado e o processamento aprovado do Gemini estiver disponível,
  o Gemini também poderá gerar a cena. Traducoes, imagens e interpretacoes de
  sonhos usam Google Gemini; narracoes neurais sob demanda usam ElevenLabs.
- Esses processadores so sao usados depois de confirmacao adulta e ativação do
  controle único de processamento em nuvem.
- O app nao apresenta afirmacoes ou sonhos como previsao, diagnostico ou garantia.

## Dados locais

- Manifestacoes, afirmacoes, sonhos e Rastros ficam armazenados no aparelho.
- A pessoa pode editar itens individuais e usar `Recomeçar minha jornada` para
  remover a pratica local.
- No Plano Celeste, audio e transcricao captados pelo microfone sao descartados.
  Somente um recibo minimo da pratica fica localmente, sem o texto reconhecido.
- O backup é um JSON legível e sem criptografia. O app abre a folha de
  compartilhamento do sistema e a web baixa o arquivo; ele não inclui denúncias
  enviadas, consentimentos do aparelho, notificações agendadas nem arquivos de imagem.
- A denúncia contém somente a saída gerada escolhida (ou referência visual),
  motivo, nota opcional e metadados mínimos. Usa identificador pseudônimo
  antiabuso, fica por no máximo 180 dias e pode ser excluída no Perfil enquanto
  a sessão da instalação existir.

## Recursos por plataforma

- O despertador com conteúdo pessoal usa AlarmKit e so deve ser revisado em
  iPhone compativel. Ele aceita afirmação, visão, Cena-Âncora, frase de sonho ou
  frase própria. A web e o Android nao anunciam nem simulam esse alarme do sistema.
- O lembrete do Ritual de Um Minuto usa notificacao local quando permitido.
- O Plano Celeste usa de um a quatro lembretes locais comuns; nao e alarme exato
  e pode sofrer atraso do sistema. Ele nao bloqueia o aparelho.
- A imagem e o texto da visão ou Cena-Âncora ficam visíveis durante a prática.
  A narração completa começa somente quando a pessoa toca em ouvir. Se o
  consentimento de nuvem já estiver ativo e a plataforma oferecer esse recurso,
  a Celeste pode usar ElevenLabs; caso contrário, usa o sintetizador do sistema
  ou navegador, que não deve ser descrito como necessariamente offline sem
  validação do ambiente.
- Depois da narração, ou da confirmação acessível de leitura integral da visão,
  a afirmação permanece visível e são liberadas duas
  repetições, com progresso `1/2` e `2/2`. O microfone começa somente após outro
  toque e o app aceita apenas reconhecimento no dispositivo quando suportado;
  caso contrário, oferece conclusão manual acessível. Áudio e transcrição
  captados pelo microfone não são salvos.
- `Agora nao` e `Adiar 10 min` permanecem disponiveis sem exigir fala.

## Comunidade

- Nao declarar comunidade publica nesta submissao enquanto o backend moderado
  nao estiver ativado. A tela atual preserva rascunhos locais e explica esse estado.

## Passos sugeridos ao revisor

1. Abrir o app e escolher portugues ou ingles.
2. Concluir o questionario; a primeira Cena-Âncora é criada no aparelho, com a
   nuvem desligada e sem pergunta de consentimento no onboarding.
3. Abrir a Cena-Âncora, a Ponte de Hoje e o Ritual de Um Minuto.
4. Em Sonhos, registrar um relato curto e gerar a afirmacao local.
5. Em Perfil, conferir privacidade e reset. O Android não gera conteúdo com IA e
   não mostra controles de voz nem de nuvem; a voz é a do aparelho.
6. Abrir o Plano Celeste pela Inicio, escolher uma visao ou Cena-Âncora e uma afirmacao e
   testar um lembrete comum.
7. Conferir a imagem e o texto, tocar em `Ouvir visão completa` e esperar a
   narração terminar. Se o áudio não estiver disponível, ler a visão inteira e
   usar `Li a visão completa`. Depois, tocar para iniciar o microfone, ler a frase
   visível duas vezes e conferir o progresso `1/2` e `2/2`; testar também falha
   de narração, cancelamento, adiamento e conclusão manual.

## Caminhos de teste

- Voz (somente no site; no Android a voz é a do aparelho): `Perfil > Voz da narração`;
  escolher um narrador e tocar a prévia.
- Cena: `Manifestar > abrir manifestacao > Sua narrativa em audio`.
- Sonhos: `Inicio > Conte seu sonho`; escrever, escolher sentimento e tema e
  tocar `Transformar em afirmacao`.
- Ritual: `Inicio > Seu minuto Celeste`; o lembrete local aparece nas opcoes do
  ritual quando o build suporta notificacoes.
- Plano Celeste: `Inicio > Plano Celeste`; a imagem, a visão ou Cena-Âncora e a
  afirmação permanecem na tela. A narração é iniciada por toque e precisa
  terminar, ou a leitura integral precisa ser confirmada pela alternativa
  acessível, antes das duas repetições. O áudio e a transcrição do microfone não
  são retidos nem enviados. O sintetizador do sistema ou navegador pode seguir
  as regras do respectivo fornecedor e deve ser validado no binário final.
- Meu despertar: `Inicio > Meu despertar`; adicionar a Cena-Âncora, uma visão ou
  afirmação, escolher o horário e ligar o lembrete. No Android é uma notificação
  comum com som, sem alarme exato, que abre a sequência; a voz do aparelho toca
  depois de um toque. No iPhone compatível, o despertador do sistema usa AlarmKit,
  aceita afirmação, visão, Cena-Âncora, frase de sonho ou frase própria e pede
  permissão de Alarmes.
- Compartilhar: abrir uma afirmação, visão ou a Cena-Âncora, tocar em Compartilhar,
  conferir a prévia da imagem ou do vídeo de 8 segundos e enviar pela folha de
  compartilhamento do sistema.
- Avaliação: depois da revelação da Cena-Âncora, a janela padrão de avaliação da
  Google Play pode aparecer uma vez; não há pergunta antes nem botão próprio.
- Privacidade: `Perfil > Privacidade e dados`.
- Denúncias: `Perfil > Excluir denúncias de conteúdo de IA enviadas`.
- Backup: `Jornada > Cópia de segurança`; no app, conferir a share sheet.
- Reset: `Jornada > Recomeçar minha jornada`.
