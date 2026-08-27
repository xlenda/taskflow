# Arquitetura do Cérebro Celeste

Atualizado em 27/08/2026.

## Verdade da base

A Base Celeste V2 contém **39 cartões atômicos** e **27 entradas no registro de
fontes**. Ela foi sintetizada somente a partir de três artefatos autorizados:

- o precursor `knowledge/celeste-core-v1.json`;
- a pesquisa científica de personalização da Celeste;
- o dossiê mestre de produto da Celeste.

Os 27 registros incluem estudos e diretrizes citados nesses artefatos. Eles não
são 27 livros. A base não guarda livros integrais e ainda não representa todo o
corpus de dezenas de livros mencionado em conversa. Esse limite deve continuar
visível em produto, documentação e avaliação.

## Uma inteligência, três camadas

### Base

Cada cartão informa escopos, domínios, sinais de uso, nível de evidência,
princípio, aplicação, limites, proibições, fontes e uma pista curta de escrita.
O cérebro seleciona de quatro a oito cartões relevantes. O modelo nunca recebe
os 39 cartões nem documentos completos em toda geração.

### Memória

A memória implementada é um resumo estruturado e consentido do que pode mudar
o próximo capítulo: fatos fornecidos, edições explícitas, dias praticados,
quantidade de evidências privadas, passos concluídos, capítulos anteriores e,
somente com opt-in, tema e sentimento escolhidos no relato de sonho. Texto
íntimo bruto não é reenviado por padrão, e texto criado pelo modelo nunca vira
fato biográfico.

Aceitação, rejeição e fricção ainda não têm controles explícitos no produto.
Esses campos permanecem como contrato futuro da Base V2 e não podem ser
inferidos de tempo de tela, sequência, abertura do app ou qualquer outro sinal
passivo.

### Jornada

As três camadas aparecem para a pessoa como uma única cronologia simples:

1. **Entender:** organizar desejo, motivo, âncoras e preferências permitidas.
2. **Criar:** entregar uma afirmação ou cena pessoal e uma ponte opcional.
3. **Observar:** registrar o que aconteceu, não aconteceu ou precisa de ajuste.
4. **Evoluir:** criar o próximo capítulo com continuidade e sem repetição.

Essas etapas acontecem por trás das superfícies existentes. Não exigem quatro
novos menus nem transformam a Home em um catálogo de ferramentas.

## Fluxo de geração

1. O servidor monta um mapa somente com fatos permitidos.
2. Escopo, sinais, domínio e memória escolhem os cartões relevantes.
3. O prompt recebe o mapa minimizado, os cartões e o contrato do escopo.
4. O modelo devolve saída estruturada e um recibo de personalização.
5. O validador mede fundamentação, personalização, credibilidade, agência,
   emoção, continuidade e segurança.
6. Conteúdo inseguro ou genérico é reparado uma vez; falha repetida usa fallback
   conservador e nunca expõe a resposta reprovada.
7. A geração registra versões e IDs dos cartões usados para auditoria.

## Direção visual personalizada

Quando há consentimento adulto para personalização em nuvem, cada nova
manifestação pode receber uma fotografia editorial 4:5 criada a partir do
desejo e de um conjunto mínimo permitido: local desejado, tipo de casa,
trabalho e motivo declarado. Campos de nome, rosto, histórico bruto, notas e
texto de sonho ficam fora do payload; nomes de terceiros já cadastrados também
são generalizados. O prompt proíbe pessoas, marcas, letras e fatos inventados.

O Gemini devolve somente a imagem. A afirmação continua sendo renderizada pelo
próprio app sobre um véu central escuro, com texto branco e sombra leve. Assim a
frase permanece legível mesmo sobre praia, cabana, fazenda ou outra cena clara.
A imagem é gerada em segundo plano: falha ou lentidão conserva o gradiente
local e nunca bloqueia o questionário.

No iOS e Android, o JPEG fica no diretório privado de documentos do app; na
web, fica em IndexedDB. O estado guarda apenas uma chave de cache e o recibo da
geração. Arquivos de imagem não entram em AsyncStorage nem no backup JSON e são
apagados em remoção, redefinição, reparo ou importação de dados.

## Versões vigentes

| Camada | Versão |
|---|---|
| Base estruturada | `celeste-knowledge-v2` |
| Cérebro e recuperação | `celeste-brain-v1` |
| Prompt de cena | `celeste-scene-v7` |
| Prompt de sonho em nuvem | `celeste-dream-v2` |
| Fallback local de sonho | `dream-local-v3` |

O fallback local possui ciclo de versão próprio. `dream-local-v3` não é uma
referência antiga ao prompt de sonho em nuvem.

## Limites obrigatórios

- sem diagnóstico, tratamento, profecia ou memória recuperada;
- sem promessa de dinheiro, cura, relacionamento ou prazo;
- sem controle ou exposição de terceiros;
- sem inventar fatos para parecer pessoal;
- sem retenção por medo, culpa, exclusividade ou dependência da Celeste;
- sem transformar espiritualidade em evidência científica;
- sem usar engajamento como prova de bem-estar.

Novos livros ou pesquisas entram somente como sínteses originais e rastreáveis,
com direitos de uso, fonte, nível de evidência, cartões novos ou revisados e uma
nova versão auditável da base.
