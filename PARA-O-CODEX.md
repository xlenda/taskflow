# Celeste - estado da entrega

Atualizado em 28/08/2026 (America/Sao_Paulo).

## Estado final

- Producao publicada em `https://celeste-jet-two.vercel.app`.
- Bundle validado: `AppEntry-67745d0af3ce0203087ce3111de5c969.js`.
- Codigo de produto salvo no GitHub ate o commit `71b865a` antes deste registro final.
- Migration `supabase/migrations/006_generation_reservations.sql` aplicada e revalidada.
- Arquivos temporarios de ambiente usados na publicacao e migration foram apagados.

## Experiencia entregue

- Afirmacoes organizadas em Amor, Prosperidade, Carreira, Saude, Confianca e Paz.
- Os temas sao apenas navegacao: textos e imagens sao personalizados pelas respostas, sonhos, memoria, jornada e idioma de cada pessoa.
- Base Celeste interna com 39 cartoes e 27 fontes para orientar a geracao, sem expor um catalogo generico ao usuario.
- Onboarding com multipla escolha, autorrelato reescrito em linguagem natural e respostas sem informacao util ignoradas.
- Cena personalizada local aparece imediatamente; Claude melhora o mesmo item em segundo plano sem duplicar nem apagar progresso, visual ou edicoes.
- Claude cria textos, Gemini traduz e gera imagens, ElevenLabs narra na voz escolhida.
- Perfil, Sonhos, Despertador, Comunidade e Jornada estao acessiveis e organizados.
- Imagens personalizadas persistem no Safari por `ArrayBuffer` no IndexedDB.
- Reproducao de audio inclui progresso e velocidade.

## Seguranca e custos

- Cena e imagem usam reserva de credito em duas fases: reserva, confirmacao no sucesso e liberacao em falha ou timeout.
- Reservas abandonadas sao recuperadas depois de cinco minutos.
- Limites ativos: 64 unidades por usuario/dia e 1.200 unidades globais/dia.
- `anon` e `authenticated` nao podem executar a funcao de finalizacao; somente `service_role` pode.
- BotID bloqueou cliente nu no teste de producao.
- Chaves permanecem somente no backend/Vercel e nao foram adicionadas ao Git.

## Provas da publicacao

- Deploy completo aprovado e promovido pelo Vercel.
- Texto real aprovado com `anthropic/claude-sonnet-5`.
- Traducao aprovada com `gemini-3.7-flash`.
- Imagem JPEG real aprovada com `gemini-3.1-flash-image`.
- E2E de onboarding, persistencia, idempotencia, audio, despertador, sonhos, perfil, comunidade, afirmacoes e navegacao aprovado.
- PT e EN sem vazamento entre idiomas.
- Abertura, video, som por toque, transicoes, mascote, recuperacao de storage e estado legado aprovados.
- Smoke em 390x844 confirmou as seis categorias e toda a navegacao, sem erros de console, JavaScript, HTTP ou overflow.
- Validacao em 4G e CPU 4x mais lenta ficou dentro do limite aceito.
- Producao foi revalidada depois da migration sem nova publicacao.

## Observacao local

As alteracoes em `scripts/e2e-shots/*.png` sao capturas nao deterministicas regeneradas pelos testes. Elas nao fazem parte da entrega e nao devem ser incluidas no commit.
