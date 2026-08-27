# Pesquisa científica e base de conhecimento da Celeste

> Revisão concluída em 25/08/2026 a partir dos dois briefings recebidos,
> estudos originais, meta-análises, revisões e diretrizes. Este material orienta
> um produto de reflexão e bem-estar; não transforma a Celeste em psicoterapia,
> diagnóstico ou tratamento.

## 1. Decisão executiva

O material recebido acerta ao pedir uma base estruturada, em vez de livros
inteiros dentro de um prompt. A tese mais defensável é:

**usar as palavras da própria pessoa para ligar um desejo significativo a uma
identidade plausível, uma visualização de processo e uma ação escolhida por ela.**

O ciclo de conhecimento é:

1. desejo;
2. valor: por que isso importa;
3. evidência pessoal: força ou capacidade já reconhecida;
4. futuro plausível e cotidiano;
5. obstáculo que pode voltar a aparecer;
6. plano `se–então`;
7. retorno sem culpa para observar fricção e ajustar o passo.

A implementação versionada usada pelo gerador está em
[`knowledge/celeste-core-v2.json`](../knowledge/celeste-core-v2.json). A V2 tem
39 cartões atômicos e 27 entradas no registro de fontes. Ela foi sintetizada
somente a partir da V1 e dos dois documentos autorizados do projeto; não contém
livros integrais nem representa todo o corpus de dezenas de livros citado em
conversa.

## 2. Autoafirmação não é frase positiva absoluta

Na literatura, self-affirmation costuma significar refletir sobre valores
pessoais e preservar uma visão mais ampla da própria integridade. Não é sinônimo
de repetir “já é meu” ou “sou perfeita”.

- Uma meta-análise encontrou efeitos pequenos sobre aceitação de mensagens de
  saúde, intenção e comportamento. [Epton et al., 2015](https://doi.org/10.1037/hea0000116).
- Uma meta-análise de 2025, com 129 testes e 17.748 participantes, encontrou
  efeitos pequenos em percepção de si, bem-estar e comportamento; todos os
  intervalos de predição cruzaram zero, mostrando forte dependência do contexto.
  [Wang et al., 2025](https://doi.org/10.1037/amp0001591).
- Num experimento pequeno, repetir uma afirmação muito positiva piorou o estado
  de alguns participantes com baixa autoestima. É um alerta, não uma proibição
  universal. [Wood et al., 2009](https://doi.org/10.1111/j.1467-9280.2009.02370.x).

Regra da Celeste: toda frase deve ser autoral, crível, controlável e editável.

| Evitar | Preferir |
|---|---|
| “Eu já tenho tudo o que desejo.” | “Eu posso dar um passo possível na direção do que importa.” |
| “Isso está vindo para mim.” | “Escolho construir esse caminho porque…” |
| “Nada pode me impedir.” | “O obstáculo pode aparecer, e eu posso preparar uma resposta.” |
| “Eu nunca sinto ansiedade.” | “Posso sentir desconforto e ainda escolher um passo cuidadoso.” |

## 3. WOOP e contraste mental

O número do briefing está correto: a meta-análise de 2021 reuniu 21 artigos, 24
efeitos independentes e 15.907 participantes, com `g = 0,336`, IC95%
`0,229–0,443`. A qualificação é indispensável: houve heterogeneidade e indícios
de viés de publicação; o ajuste trim-and-fill reduziu a estimativa a `g = 0,242`.
Dois estudos MOOC concentravam 87,44% da amostra e tiveram efeitos de `0,09` e
`0,06`. [Wang et al., 2021](https://doi.org/10.3389/fpsyg.2021.565202).

Uso correto:

- efeito médio pequeno, não promessa individual;
- `g = 0,336` não significa 33,6% de melhora nem chance de sucesso;
- obstáculo vem da pessoa; a IA não inventa conflito interno;
- meta de baixa viabilidade pode ser reduzida, reformulada ou estacionada;
- WOOP é uma ferramenta de planejamento, não prova de manifestação externa.

O exemplo “validar em 30 dias e conquistar três clientes” só pode ser gerado se
a pessoa escolher esses números. O sistema não transforma um desejo vago em
prazo e métrica inventados.

## 4. Planos `se–então`

A meta-análise clássica reuniu 94 testes e estimou `d = 0,65`.
[Gollwitzer e Sheeran, 2006](https://doi.org/10.1016/S0065-2601(06)38002-1).
Uma atualização com 642 testes encontrou `d = 0,36` na análise convencional,
`d = 0,27` para comportamento e aproximadamente `d = 0,15` após ajuste robusto a
viés. [Sheeran et al., 2024](https://doi.org/10.1080/10463283.2024.2334563).

Contrato:

```text
Se eu notar [sinal reconhecível escolhido pela pessoa],
então vou [ação específica, pequena e sob meu controle].
```

O plano é editável e não garante execução automática. Quando não houver sinal,
a Celeste pode oferecer opções, mas não finge que uma hora ou lugar foi escolhido.

## 5. Autonomia, competência e vínculo

A Self-Determination Theory sustenta autonomia, competência e vínculo como
necessidades relevantes à motivação e ao bem-estar. Metas autoconcordantes se
relacionam a esforço e realização, mas isso não prova que uma frase personalizada
isolada altere motivação.
[Ryan e Deci, 2000](https://doi.org/10.1037/0003-066X.55.1.68),
[Sheldon e Elliot, 1999](https://doi.org/10.1037/0022-3514.76.3.482).

A base deve orientar perguntas como:

- “Isso é realmente uma escolha sua?”
- “Por que isso importa para você?”
- “Qual parte você já sabe fazer ou pode aprender?”
- “Quem pode apoiar sem controlar sua decisão?”

O app preserva escolha, não ocupa o lugar de relações reais e não trata aprovação
externa como falha moral.

## 6. Hábitos sem prazo mágico

No estudo de Lally, o tempo estimado para chegar perto do platô de automaticidade
variou de 18 a 254 dias; 66 dias foi mediana, não regra.
[Lally et al., 2010](https://doi.org/10.1002/ejsp.674). Hábitos dependem de
repetição em contexto relativamente estável.
[Wood e Rünger, 2016](https://doi.org/10.1146/annurev-psych-122414-033417).

Consequências:

- 21 dias é um ciclo de prática da Celeste, não prazo de formação de hábito;
- perder um dia não apaga progresso nem identidade;
- a retomada é “volte no próximo sinal”;
- ação mínima é uma heurística para reduzir fricção, não lei científica;
- medir contexto e fricção é mais útil que medir somente sequência.

## 7. Psicologia positiva com limites

### PERMA

PERMA funciona melhor como menu de reflexão do que como tratamento. Numa
comparação, PERMA e bem-estar subjetivo chegaram a correlação latente de `r =
0,98`, levantando dúvida sobre serem construtos distintos.
[Goodman et al., 2018](https://doi.org/10.1080/17439760.2017.1388434).

### Gratidão

Os efeitos médios são modestos e culturalmente variáveis. Uma síntese global
recente encontrou `g = 0,19`, com intervalo de predição cruzando zero.
[Davis et al., 2025](https://doi.org/10.1073/pnas.2425193122). Contra controles
psicologicamente ativos, benefícios podem desaparecer.
[Davis et al., 2016](https://doi.org/10.1037/cou0000107).

Gratidão é opcional, pode coexistir com dor e nunca significa dívida, perdão
obrigatório ou substituição de tratamento.

### Autocompaixão

Meta-análises encontram benefícios médios, mas heterogeneidade, viés e vantagem
menor contra controles ativos exigem cautela.
[Ferrari et al., 2019](https://doi.org/10.1007/s12671-019-01134-6),
[Han e Kim, 2023](https://doi.org/10.1007/s12671-023-02148-x).

Resposta correta à falha:

```text
O plano não aconteceu hoje. Isso não vira uma identidade.
O que atrapalhou, e qual versão menor faria sentido no próximo sinal?
```

## 8. Identidade e futuro possível

Identidade narrativa conecta passado reconstruído e futuro imaginado. Agência,
vínculo, coerência e significado se associam a bem-estar, mas não está provado
que impor uma narrativa cause recuperação.
[McAdams e McLean, 2013](https://doi.org/10.1177/0963721413475622),
[Gehrt et al., 2023](https://doi.org/10.1080/09658211.2023.2218632).

Future selves são mais úteis quando parecem conectados, plausíveis e ligados a
estratégias presentes. O foco produtivo é “o que essa versão faz”, não somente
“quem ela é”. [Hershfield, 2011](https://doi.org/10.1111/j.1749-6632.2011.06201.x),
[Oyserman e Horowitz, 2023](https://www.sciencedirect.com/science/article/pii/S2215091922000141/pdf).

O passado é opcional. A IA não inventa memória, motivo, trauma ou redenção.

## 9. Visualização e áudio

Simulação de processo melhorou planejamento e desempenho num estudo acadêmico e
foi superior à fantasia apenas do resultado.
[Pham e Taylor, 1999](https://doi.org/10.1177/0146167299025002010). Fantasias
positivas idealizadas, sem contato com realidade e ação, podem reduzir energia e
esforço. [Kappes e Oettingen, 2011](https://doi.org/10.1016/j.jesp.2011.02.003).

A Cena-Âncora mantém beleza e sensação, mas mostra comportamento cotidiano,
reconhece o obstáculo e termina numa Ponte de Hoje. Áudio é um formato sensorial;
não é frequência, reprogramação subconsciente ou aprendizagem passiva no sono.
Fitas subliminares não melhoraram memória ou autoestima além da expectativa num
estudo clássico. [Greenwald et al., 1991](https://doi.org/10.1111/j.1467-9280.1991.tb00112.x).

## 10. Sonhos sem dicionário de símbolos

Sonhos podem refletir probabilisticamente preocupações e emoções da vida desperta.
Isso não valida símbolos universais nem diagnóstico individual.
[Schredl e Hofmann, 2003](https://doi.org/10.1016/S1053-8100%2802%2900072-7).
Pessoas deixam crenças sobre sonhos influenciarem decisões, tornando uma leitura
autoritária arriscada. [Morewedge e Norton, 2009](https://doi.org/10.1037/a0013264).

O bônus de sonho deve:

1. guardar o relato exato separadamente;
2. extrair somente uma imagem literal não gráfica;
3. perguntar como a pessoa acordou;
4. deixar a pessoa escolher o significado;
5. no automático, usar só o sentimento informado;
6. dizer que não é previsão nem diagnóstico;
7. não repetir conteúdo gráfico em áudio;
8. permitir editar e excluir.

Pesadelos recorrentes com sofrimento ou prejuízo pertencem a protocolos e
profissionais próprios; afirmação não equivale a imagery rehearsal therapy.
[AASM](https://doi.org/10.5664/jcsm.7178).

## 11. Perfil estruturado dentro do app

O segundo briefing acerta ao não guardar apenas respostas soltas. A base organiza:

- identidade: descrição, forças e evidências reais;
- direção: desejo, valor, emoção desejada, prazo escolhido e plausibilidade;
- contexto: trabalho, relações, lugar, apoio e cena cotidiana;
- ação: obstáculo, sinal, passo pequeno, fallback e fricção;
- experiência: estilo, crença, voz, ambiente e tópicos proibidos;
- sonho: relato exato, sentimento, significado escolhido, recorrência e impacto.

Dados demográficos não entram só para “parecer personalizado”. Nome de criança,
terceiro ou pessoa romântica específica não entra na nuvem nem na afirmação.

## 12. Quatro produtos por desejo

```text
Afirmação curta
  desejo + valor/evidência + agência plausível

Visualização narrada
  cena cotidiana + detalhes fornecidos + processo

Ação do dia
  pequena + mensurável + controlável + editável

Plano de obstáculo
  Se/Quando [sinal], então vou [ação]
```

A implementação atual reúne os quatro na Cena-Âncora e registra quais campos
foram realmente usados.

## 13. Arquitetura de conhecimento

A arquitetura atual separa cinco responsabilidades:

1. **registro de fontes:** origem e papel de cada referência autorizada;
2. **cartões versionados:** sinais, princípio, aplicação, limites, proibições e
   pista curta para o prompt;
3. **recuperação:** escolhe somente os cartões relevantes ao escopo e ao momento;
4. **contratos editoriais:** credibilidade, autonomia, privacidade e segurança;
5. **validadores:** fundamentação, promessa, terceiros, ação, continuidade e
   dependência.

Livros não são colocados integralmente no prompt. Artigos, diretrizes e sínteses
próprias formam a base científica; livros de hábito e negócios são heurísticas;
livros espirituais são apenas estilo opcional. Conteúdo protegido só entra com
direito de uso.

O fluxo completo de Base + Memória + Jornada está resumido em
[`ARQUITETURA-CEREBRO-CELESTE.md`](./ARQUITETURA-CEREBRO-CELESTE.md).

## 14. Contrato de geração

### Questionário

```text
Intenção: direção concisa.
Afirmação: desejo + âncora pessoal segura + linguagem crível.
Cena: futuro cotidiano + fatos fornecidos + processo.
Identidade: prática atual, não resultado já possuído.
Ponte: ação curta; com obstáculo, plano se–então.
Recibo: campos que realmente aparecem no texto.
```

### Sonho

```text
Imagem literal segura
+ sentimento selecionado
+ significado escolhido ou sugerido somente pelo sentimento
+ primeira pessoa sem profecia
+ aviso de que não é previsão nem diagnóstico
```

### Validação

- primeira pessoa e idioma correto;
- desejo e âncora segura verificáveis;
- nenhuma promessa, prazo inventado, cura ou resultado já possuído;
- obstáculo não vira identidade e fundamenta o plano condicional;
- ação de até dez minutos sob controle da pessoa;
- nenhum nome de terceiro ou demografia;
- sonho sem interpretação por palavra-chave;
- conteúdo intenso fora do áudio.

## 15. O que nunca entra

- diagnóstico ou tratamento automatizado;
- garantia de cura, riqueza, amor, emprego ou prazo;
- culpa espiritual ou “baixa vibração” como causa de abuso, pobreza ou doença;
- controle de outra pessoa;
- paranoia, destino especial ou mensagem oculta confirmados;
- sonho usado como profecia, diagnóstico ou memória recuperada;
- gratidão usada para apagar perigo, luto ou injustiça;
- substituição de medicação, terapia ou apoio humano;
- retenção baseada em medo, solidão ou perda de sequência;
- prova social, comunidade ou depoimento inventados.

## 16. Uso real no produto

No código-fonte de 27/08/2026:

- a base `celeste-knowledge-v2` é carregada no servidor em cada nova
  Cena-Âncora criada com Gemini, inclusive depois do onboarding;
- o prompt `celeste-scene-v7` recebe uma seleção de quatro a oito cartões, nunca
  os 39 cartões ou os documentos completos;
- o prompt de sonho em nuvem `celeste-dream-v2` recebe somente cartões do escopo
  e os dados mínimos autorizados;
- frases locais deixaram de declarar que o resultado já existe ou está a caminho;
- obstáculo gera Ponte `se–então` no gerador local e é validado na nuvem;
- `dream-local-v3` usa imagem literal, sentimento e escolha, sem dicionário de
  símbolos; essa versão local é independente do prompt de nuvem V2;
- a resposta do servidor registra `promptVersion` e `knowledgeVersion`;
- o deploy empacota e verifica a mesma base usada nos testes;
- afirmação, cena, sonho e check-in possuem escopos e contratos separados dentro
  da mesma cronologia, sem criar um catálogo de novas funções na interface.

## 17. Métricas honestas

Evidência média da literatura não prova a eficácia da IA da Celeste. Medir:

- “isso parece verdadeiro para mim?”;
- aceitação, edição, rejeição e pulo;
- plano criado, executado e reduzido;
- fricção e contexto;
- retorno sem culpa;
- invenção ou vazamento de detalhe;
- clareza e autonomia relatadas;
- desconforto e outros eventos adversos, não apenas engajamento.

O primeiro experimento deve comparar frase genérica, frase baseada em valor e
frase baseada em valor + Ponte, medindo credibilidade imediata e execução em 24
horas e sete dias. “Manifestou ou não” não é desfecho científico suficiente.

## 18. Síntese

O diferencial não é tornar a frase mais absoluta. É a pessoa reconhecer:

**“Isso veio das minhas palavras, respeita o que sinto e me devolve uma escolha
que eu realmente posso fazer.”**

Forma curta da base:

**valor pessoal → futuro plausível → obstáculo reconhecido → plano escolhido →
registro honesto.**
