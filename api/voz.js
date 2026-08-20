// Locução sob demanda: gera o áudio de um texto QUE NÃO EXISTE no catálogo —
// a afirmação e a cena criadas a partir do sonho de cada pessoa.
//
// Por que existe: o conteúdo fixo (afirmações, visões, histórias) é o mesmo
// para todo mundo e foi gravado uma vez em public/audio/. Mas a manifestação
// que a pessoa escreve é única dela — e era justamente a parte mais pessoal do
// app que sobrava com voz de robô.
//
// Custo: as vozes neurais da Microsoft são gratuitas e sem cota. O que evita
// gasto de CPU é o cache: a resposta é imutável e endereçada pelo hash do
// texto, então a CDN devolve as repetições sem executar esta função de novo.
//
// GET /api/voz?t=<texto>&lang=pt   → audio/mpeg
// O require de msedge-tts fica DENTRO do handler de propósito: no topo, o
// empacotador do app tenta resolvê-lo junto com as telas e o export estoura a
// memória ("heap out of memory"). Aqui só o servidor carrega a biblioteca.
const crypto = require('crypto');

const VOZ = {
  pt: 'pt-BR-AntonioNeural',
  en: 'en-US-AndrewNeural',
};
// Mesmo ritmo dos arquivos gravados, para a voz soar contínua entre as telas.
const RITMO = '-8%';
const MAX_CHARS = 600;

// Trava simples por instância: este endpoint gasta CPU, então não pode virar
// gerador aberto de áudio para quem apontar um script nele.
const janela = new Map();
function excedeuLimite(ip) {
  const agora = Date.now();
  const registro = janela.get(ip) || { n: 0, desde: agora };
  if (agora - registro.desde > 60_000) {
    registro.n = 0;
    registro.desde = agora;
  }
  registro.n += 1;
  janela.set(ip, registro);
  if (janela.size > 5000) janela.clear(); // não crescer sem limite
  return registro.n > 20; // 20 gerações por minuto por IP
}

module.exports = async (req, res) => {
  try {
    const texto = String((req.query && req.query.t) || '').trim();
    const langRaw = String((req.query && req.query.lang) || 'pt').toLowerCase();
    const lang = langRaw.startsWith('pt') ? 'pt' : 'en';

    if (!texto) {
      res.status(400).json({ erro: 'texto obrigatório' });
      return;
    }
    if (texto.length > MAX_CHARS) {
      res.status(413).json({ erro: `texto acima de ${MAX_CHARS} caracteres` });
      return;
    }

    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'desconhecido';
    if (excedeuLimite(ip)) {
      res.status(429).json({ erro: 'muitas gerações seguidas, tente em instantes' });
      return;
    }

    const etag = '"' + crypto.createHash('sha1').update(`${lang}|${texto}`).digest('hex') + '"';
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
    const tts = new MsEdgeTTS();
    await tts.setMetadata(VOZ[lang], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(texto, { rate: RITMO });

    const partes = [];
    const buffer = await new Promise((resolve, reject) => {
      const limite = setTimeout(() => reject(new Error('tempo esgotado na geração')), 20_000);
      audioStream.on('data', (c) => partes.push(c));
      audioStream.on('end', () => {
        clearTimeout(limite);
        resolve(Buffer.concat(partes));
      });
      audioStream.on('error', (e) => {
        clearTimeout(limite);
        reject(e);
      });
    });

    if (!buffer.length) throw new Error('áudio vazio');

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('ETag', etag);
    // Imutável: a URL carrega o próprio texto, então o conteúdo nunca muda.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(buffer);
  } catch (e) {
    // O app cai na voz do aparelho quando isto falha — nunca fica mudo.
    res.status(503).json({ erro: 'narração indisponível' });
  }
};
