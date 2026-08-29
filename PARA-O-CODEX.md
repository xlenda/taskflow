# Celeste - estado da entrega

Atualizado em 29/08/2026 (America/Sao_Paulo).

## Producao e codigo

- Aplicacao publicada em `https://celeste-jet-two.vercel.app`.
- Deploy aprovado: `dpl_9Cagv7GR47Smvkejc8dBcxfnK61c`.
- Bundle validado: `AppEntry-e78da52d65cf198b0e2f21c743ecd557.js`.
- Repositorio: `https://github.com/xlenda/taskflow`.
- Correcao atual de funil e midia: commit `cace228`.

## Experiencia entregue

- O onboarding mostra somente uma barra continua de progresso. O total de perguntas nao aparece; leitores de tela recebem apenas a porcentagem atual.
- A Cena-Ancora preserva todas as respostas relevantes do onboarding e fica acessivel novamente dentro do app.
- Visoes e Afirmacoes sao conjuntos separados, com seis itens pessoais cada: Amor, Prosperidade, Carreira, Saude, Confianca e Paz.
- Visoes descrevem futuros concretos; Afirmacoes usam o presente. Cada item tem contexto visual proprio e nao reutiliza uma imagem generica como regra.
- Visoes e Afirmacoes mantem imagem e audio independentes: carregar ou falhar uma midia nao derruba a outra. O mesmo botao inicia, pausa e retoma a narracao correta, inclusive no estado `ready` do Safari.
- O Espelho Vivo usa desejos, obstaculos, sonhos e passos concluidos para evoluir a proxima cena sem expor uma cronologia bruta ao provedor.
- Sonhos priorizam o relato atual e usam a Ancora apenas como contexto secundario. A saida oferece interpretacao prudente, reflexao positiva e afirmacao, sem diagnostico, previsao, simbolos universais, memoria recuperada ou repeticao grafica.
- O historico de sonhos pode ser reaberto. Falha de nuvem aparece de forma visivel e oferece nova tentativa; existe uma alternativa local segura.
- O Despertador e uma area propria. A pessoa escolhe qualquer afirmacao, confirma os dias e o horario e so entao pede permissao ao aparelho.
- O Ritual de Um Minuto, lembrete diario, barra de progresso, tempo e velocidades de audio estao integrados.
- Seis narradores possuem 12 amostras PT/EN empacotadas. Narracoes pessoais usam sempre a voz escolhida, sao geradas sob demanda e podem ser reutilizadas por um cache privado no aparelho.
- Perfil, privacidade, Sonhos, Despertador e Comunidade estao acessiveis sem criar uma fileira desorganizada de novos icones.
- A Comunidade usa os seis Circulos existentes e os formatos Acao, Evidencia e Celebracao. Ha previa, filtro de dados pessoais/dinheiro e exclusao local.
- A Comunidade remota permanece desligada. Hoje, relatos ficam apenas no aparelho e o texto da tela deixa isso explicito; nao existem depoimentos inventados, ranking ou publicacao silenciosa.
- PT e EN possuem paridade. No idioma alternativo, o app usa conteudo local generico ate a criacao remota ser autorizada, evitando mostrar uma traducao pessoal incorreta.
- Estados de carregamento, falha e nova tentativa existem na Ancora, nas Visoes e no player.

## Arquitetura de IA

- Anthropic `claude-sonnet-5`: escritor principal das cenas e dos conjuntos pessoais.
- OpenAI `gpt-5.6-terra`: fallback unico e controlado para texto quando a falha do provedor primario permite troca segura.
- Google Gemini `gemini-3.7-flash`: traducao e transformacao prudente de sonhos.
- Google Gemini `gemini-3.1-flash-image`: imagens pessoais com area protegida para legibilidade do texto.
- ElevenLabs: texto para fala na voz escolhida.
- Base Celeste V2: 39 cartoes e 27 fontes autorizadas. Ela orienta recuperacao, lentes, qualidade e seguranca; os livros nao sao copiados nem exibidos como catalogo pronto.
- Cada chamada recebe apenas os campos necessarios para aquela operacao. O aplicativo nao envia o perfil inteiro por conveniencia.

## Consentimento, seguranca e custo

- O consentimento de nuvem e explicito, exclusivo para maiores de 18 anos e versionado como `celeste-cloud-processors-v1`.
- Consentimentos antigos nao sao promovidos automaticamente. Exportar/importar dados remove a autorizacao de nuvem e exige nova escolha.
- As cinco rotas pagas exigem Origin permitido, Vercel BotID valido, identidade anonima/autenticada, consentimento atual, payload minimo e cota atomica no Supabase.
- WAF da Vercel: 12 requisicoes por minuto, combinando IP e JA4, nas cinco rotas pagas.
- Limites agregados atuais: 960 unidades por ator/dia, 480 por usuario/dia e 1.200 globais/dia.
- Limites por operacao e usuario: cena 32, visual 128, audio 320, sonho 24 e traducao 24 unidades/dia. Imagem e audio nao disputam mais um teto pequeno compartilhado.
- O ator usa HMAC no servidor; IP bruto nao e armazenado no Supabase.
- Migration `008_generation_actor_quota.sql` instala a contabilizacao por ator.
- Migration `009_disable_legacy_generation_reserve.sql` foi aplicada em producao.
- Migration `010_generation_operation_quotas.sql` instala cotas atomicas por operacao e converge os valores quando reaplicada, preservando o kill switch operacional.
- Estado comprovado depois da publicacao: schema `10`, ator `960`, usuario `480`, global `1.200`, `operationQuota: true` e `legacyReserveDisabled: true`.
- A assinatura antiga de reserva sempre falha com `actor_required`; somente `service_role` pode executa-la.
- Cota e comprometida antes de cada tentativa faturavel. Falhas anteriores ao envio ao provedor nao queimam a reserva.
- TTS aceita no maximo 800 caracteres por chamada e cobra unidades proporcionais.
- O WAV pessoal usa chave SHA-256 sem texto legivel, limite local de 64 MiB/40 itens, LRU e remocao periodica apos 30 dias sem uso. Reiniciar a jornada limpa esse cache antes de apagar o restante.
- Respostas pessoais usam `no-store`; chaves ficam somente no backend/Vercel e nao estao no Git.
- Auditoria em `security-audit/run-1`: zero vulnerabilidades abertas validadas; `findings.json` esta vazio.

## Provas executadas

- Contratos das APIs de cena, traducao, imagem, sonho e audio.
- Claude primario, fallback OpenAI, reparo de qualidade, timeout e bloqueio de respostas truncadas/recusadas.
- Gemini e ElevenLabs em chamadas reais no navegador protegido.
- Smoke real de producao confirmou WAV `RIFF/WAVE` da ElevenLabs; o E2E isolado confirmou imagem visivel e iniciar/pausar/retomar audio em Visoes e Afirmacoes sem fazer chamada paga.
- Cliente nu bloqueado pelo BotID antes de gasto.
- Cinco rotas pagas retornaram `403` sem Origin/BotID depois da migration 009.
- Home retornou `200` com CSP, HSTS, `X-Frame-Options`, `nosniff` e politica estrita de referencia.
- E2E completo local e em producao: abertura, onboarding, multipla escolha, Ancora, persistencia, Visoes, seis Afirmacoes, audio, Despertador, Sonhos, Perfil, Comunidade, Jornada e recuperacao.
- Sonho remoto real salvo com origem `celeste-dream-v3` somente depois do consentimento; zero tentativas pagas antes da confirmacao.
- PT/EN sem vazamento entre idiomas.
- Layout aprovado em 320x480, 390x844, paisagem e desktop, sem overflow importante.
- Abertura full screen, autoplay mudo, ativacao de som por toque, transicoes e mascote aprovados.
- Recuperacao de armazenamento pendente, corrompido, legado e arrays malformados aprovada.
- Simulacao 4G com CPU 4x mais lenta: 755 KB em cinco arquivos, primeiro pixel em 324 ms e carregamento total em 7.109 ms.

## Limites honestos antes das lojas

- O site esta pronto e publicado; a submissao final para App Store e Google Play ainda nao foi feita.
- O despertador real depende do build nativo. AlarmKit precisa ser testado em iPhone fisico; alarmes exatos, notificacao, reboot e audio precisam ser testados em Android fisico.
- O site nao pode substituir um despertador nativo do sistema. No navegador ele salva e permite testar o rascunho, mas nao promete acordar o aparelho.
- Antes da submissao faltam URLs publicas definitivas de privacidade e suporte, capturas finais das lojas e evidencias em aparelhos reais.
- Chamadas pagas nos builds nativos devem permanecer desligadas ate App Attest, Play Integrity ou protecao equivalente estar implementada e testada.
- O teto global de 1.200 unidades comporta aproximadamente duas jornadas completas de pior caso por dia. Ele e um freio intencional de pre-lancamento e precisa ser ligado ao plano pago/volume real antes de aquisicao em escala.
- A Comunidade remota deve continuar desligada ate existir moderacao, antispam, filtro de PII no servidor, cotas atomicas e procedimento de incidentes.

## Acao urgente de credenciais

- Revogar e gerar novamente a chave da ElevenLabs que foi colada nesta conversa.
- Revogar e gerar novamente as credenciais MEXC que foram coladas nesta conversa.
- Guardar as substitutas apenas na Vercel/cofre de segredos; nunca em chat, codigo, imagem ou arquivo versionado.

## Observacao local

As alteracoes em `scripts/e2e-shots/*.png` sao capturas regeneradas pelos testes. Elas nao fazem parte da entrega, nao devem ser commitadas e nao devem ser revertidas automaticamente porque podem ser evidencias locais do usuario.
