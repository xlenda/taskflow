# Celeste - ponto de retomada

Atualizado em 28/08/2026 (America/Sao_Paulo).

## Estado seguro

- Codigo salvo e enviado ao GitHub no commit `a9c20d5` (`master`).
- Producao continua na versao anterior estavel em `https://celeste-jet-two.vercel.app`.
- A nova versao nao ficou parcialmente publicada: a esteira reprovou o teste real e fez rollback automatico.
- A migration `supabase/migrations/006_generation_reservations.sql` ainda nao foi aplicada.
- O arquivo temporario que continha credenciais do banco foi apagado de `D:\Temp\User`.

## O que esta pronto no codigo

- Afirmações organizadas em Amor, Prosperidade, Carreira, Saude, Confianca e Paz.
- Os temas sao fixos apenas para navegacao; textos e imagens continuam personalizados por respostas, sonhos, memoria e idioma.
- Base Celeste interna com 39 cartoes e 27 fontes; ela orienta a geracao e nao aparece como catalogo pronto para o usuario.
- Onboarding com multipla escolha, autorrelato interpretado em portugues natural e respostas nao informativas ignoradas.
- Cena local aparece imediatamente; Claude melhora o mesmo item em segundo plano sem duplicar ou apagar progresso, visual ou edicoes.
- Claude: provider ate 30 s; cena ate 48 s; cliente em background ate 56 s; Vercel com limite de 60 s.
- Gemini continua responsavel por imagens e ElevenLabs por voz.
- Correcao do armazenamento de imagem no Safari usando `ArrayBuffer` no IndexedDB.
- Comunidade local-first, Perfil visivel, Sonhos e Despertador organizados.
- Reserva de creditos em duas fases para cena e visual, com liberacao em falha e recuperacao apos cinco minutos.

## Publicacao pendente

1. Rodar `npm run deploy:web` em `D:\Projetos\TaskFlow`.
2. Confirmar que o teste ao vivo devolve texto com provider `anthropic`, imagem JPEG do Gemini e voz funcionando.
3. Somente depois do deploy compativel, aplicar `supabase/migrations/006_generation_reservations.sql`.
4. Rodar `npm run deploy:web -- --validate-production` para validar a producao com a migration nova.
5. Conferir `git status`, registrar qualquer ajuste final e enviar ao GitHub.

## Historico da ultima tentativa

- Primeiro candidato falhou porque os novos utilitarios do backend nao entraram no pacote Vercel. O empacotador foi corrigido e ganhou teste.
- Segundo candidato passou pacote e APIs, mas Claude excedeu o timeout antigo de 18 s. O rollback automatico restaurou a producao anterior.
- O codigo salvo em `a9c20d5` ja contem o novo orçamento de tempo e a experiencia local-first.

## Observacao local

As alteracoes restantes em `scripts/e2e-shots/*.png` sao capturas nao deterministicas geradas pelos testes. Nao fazem parte do produto e nao devem entrar no proximo commit.
