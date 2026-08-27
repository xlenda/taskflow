# Notas para revisao

Modelo interno. Completar dados de contato e caminhos exatos no build final.

## Acesso

- A versao atual nao exige conta para concluir o onboarding e usar a pratica local.
- Se login for ativado antes do envio, fornecer uma conta de demonstracao que nao expire.

## Conteudo personalizado

- A Celeste funciona sem personalizacao em nuvem por meio do gerador local.
- Gemini so e usado depois de confirmacao adulta e consentimento explicito por finalidade.
- Cena, sonho e narracao possuem consentimentos separados.
- O app nao apresenta afirmacoes ou sonhos como previsao, diagnostico ou garantia.

## Dados locais

- Manifestacoes, afirmacoes, sonhos e Rastros ficam armazenados no aparelho.
- A pessoa pode editar itens individuais e usar `Recomeçar minha jornada` para
  remover a pratica local.

## Recursos por plataforma

- O despertador com afirmacao usa AlarmKit e so deve ser revisado em iPhone
  compativel. A web e o Android nao anunciam nem simulam esse alarme do sistema.
- O lembrete do Ritual de Um Minuto usa notificacao local quando permitido.

## Comunidade

- Nao declarar comunidade publica nesta submissao enquanto o backend moderado
  nao estiver ativado. A tela atual preserva rascunhos locais e explica esse estado.

## Passos sugeridos ao revisor

1. Abrir o app e escolher portugues ou ingles.
2. Concluir o questionario usando `Criar no aparelho` para testar sem nuvem.
3. Abrir a Cena-Âncora, a Ponte de Hoje e o Ritual de Um Minuto.
4. Em Sonhos, registrar um relato curto e gerar a afirmacao local.
5. Em Perfil, conferir os controles de voz, privacidade e reset.

## Caminhos de teste

- Voz: `Perfil > Voz das suas cenas`; escolher um narrador e tocar a previa.
- Cena: `Manifestar > abrir manifestacao > Sua narrativa em audio`.
- Sonhos: `Inicio > Conte seu sonho`; escrever, escolher sentimento e tema e
  tocar `Transformar em afirmacao`.
- Ritual: `Inicio > Seu minuto Celeste`; o lembrete local aparece nas opcoes do
  ritual quando o build suporta notificacoes.
- Despertador: `Inicio > Despertador com afirmacao`; requer app instalado em
  iPhone compativel e permissao de Alarmes. Nao testar como recurso Android.
- Privacidade: `Perfil > Privacidade e dados`.
- Reset: `Jornada > Recomeçar minha jornada`.
