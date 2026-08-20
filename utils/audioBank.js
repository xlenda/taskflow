// Registro dos áudios neurais pré-gerados (Antonio pt-BR / Andrew en-US).
//
// Os arquivos vivem em public/audio/<lang>/<id>.mp3 e o Expo copia a pasta
// public/ inteira para a raiz do site no export — o caminho servido é
// /audio/pt/a-1.mp3, sem passar pelo bundler (não incha o JS).
//
// Cada item guarda { url, dur } — `dur` é a duração REAL em segundos, lida do
// arquivo com ffprobe. O app anunciava "2:51 de narração" para áudios de 28s
// porque o número vinha escrito à mão no content.js; agora quem tem áudio
// mostra o tempo verdadeiro.
//
// GERADO por scripts/gerar-audios.js. Id sem arquivo → o app narra com a voz do
// aparelho automaticamente e nunca fica mudo.
export const AUDIO_BANK = {
  "pt": {
    "a-1": {
      "url": "/audio/pt/a-1.mp3",
      "dur": 6
    },
    "a-10": {
      "url": "/audio/pt/a-10.mp3",
      "dur": 6
    },
    "a-11": {
      "url": "/audio/pt/a-11.mp3",
      "dur": 5
    },
    "a-12": {
      "url": "/audio/pt/a-12.mp3",
      "dur": 6
    },
    "a-2": {
      "url": "/audio/pt/a-2.mp3",
      "dur": 7
    },
    "a-3": {
      "url": "/audio/pt/a-3.mp3",
      "dur": 5
    },
    "a-4": {
      "url": "/audio/pt/a-4.mp3",
      "dur": 5
    },
    "a-5": {
      "url": "/audio/pt/a-5.mp3",
      "dur": 4
    },
    "a-6": {
      "url": "/audio/pt/a-6.mp3",
      "dur": 5
    },
    "a-7": {
      "url": "/audio/pt/a-7.mp3",
      "dur": 5
    },
    "a-8": {
      "url": "/audio/pt/a-8.mp3",
      "dur": 5
    },
    "a-9": {
      "url": "/audio/pt/a-9.mp3",
      "dur": 4
    },
    "fy-1": {
      "url": "/audio/pt/fy-1.mp3",
      "dur": 28
    },
    "fy-10": {
      "url": "/audio/pt/fy-10.mp3",
      "dur": 23
    },
    "fy-11": {
      "url": "/audio/pt/fy-11.mp3",
      "dur": 27
    },
    "fy-12": {
      "url": "/audio/pt/fy-12.mp3",
      "dur": 24
    },
    "fy-2": {
      "url": "/audio/pt/fy-2.mp3",
      "dur": 28
    },
    "fy-3": {
      "url": "/audio/pt/fy-3.mp3",
      "dur": 28
    },
    "fy-4": {
      "url": "/audio/pt/fy-4.mp3",
      "dur": 23
    },
    "fy-5": {
      "url": "/audio/pt/fy-5.mp3",
      "dur": 22
    },
    "fy-6": {
      "url": "/audio/pt/fy-6.mp3",
      "dur": 27
    },
    "fy-7": {
      "url": "/audio/pt/fy-7.mp3",
      "dur": 22
    },
    "fy-8": {
      "url": "/audio/pt/fy-8.mp3",
      "dur": 22
    },
    "fy-9": {
      "url": "/audio/pt/fy-9.mp3",
      "dur": 27
    },
    "v-1": {
      "url": "/audio/pt/v-1.mp3",
      "dur": 28
    },
    "v-2": {
      "url": "/audio/pt/v-2.mp3",
      "dur": 21
    },
    "v-3": {
      "url": "/audio/pt/v-3.mp3",
      "dur": 23
    },
    "v-4": {
      "url": "/audio/pt/v-4.mp3",
      "dur": 24
    },
    "v-5": {
      "url": "/audio/pt/v-5.mp3",
      "dur": 22
    },
    "v-6": {
      "url": "/audio/pt/v-6.mp3",
      "dur": 22
    }
  },
  "en": {
    "a-1": {
      "url": "/audio/en/a-1.mp3",
      "dur": 5
    },
    "a-10": {
      "url": "/audio/en/a-10.mp3",
      "dur": 5
    },
    "a-11": {
      "url": "/audio/en/a-11.mp3",
      "dur": 4
    },
    "a-12": {
      "url": "/audio/en/a-12.mp3",
      "dur": 3
    },
    "a-2": {
      "url": "/audio/en/a-2.mp3",
      "dur": 6
    },
    "a-3": {
      "url": "/audio/en/a-3.mp3",
      "dur": 6
    },
    "a-4": {
      "url": "/audio/en/a-4.mp3",
      "dur": 4
    },
    "a-5": {
      "url": "/audio/en/a-5.mp3",
      "dur": 3
    },
    "a-6": {
      "url": "/audio/en/a-6.mp3",
      "dur": 4
    },
    "a-7": {
      "url": "/audio/en/a-7.mp3",
      "dur": 5
    },
    "a-8": {
      "url": "/audio/en/a-8.mp3",
      "dur": 4
    },
    "a-9": {
      "url": "/audio/en/a-9.mp3",
      "dur": 3
    },
    "fy-1": {
      "url": "/audio/en/fy-1.mp3",
      "dur": 23
    },
    "fy-10": {
      "url": "/audio/en/fy-10.mp3",
      "dur": 18
    },
    "fy-11": {
      "url": "/audio/en/fy-11.mp3",
      "dur": 21
    },
    "fy-12": {
      "url": "/audio/en/fy-12.mp3",
      "dur": 20
    },
    "fy-2": {
      "url": "/audio/en/fy-2.mp3",
      "dur": 22
    },
    "fy-3": {
      "url": "/audio/en/fy-3.mp3",
      "dur": 20
    },
    "fy-4": {
      "url": "/audio/en/fy-4.mp3",
      "dur": 18
    },
    "fy-5": {
      "url": "/audio/en/fy-5.mp3",
      "dur": 18
    },
    "fy-6": {
      "url": "/audio/en/fy-6.mp3",
      "dur": 19
    },
    "fy-7": {
      "url": "/audio/en/fy-7.mp3",
      "dur": 17
    },
    "fy-8": {
      "url": "/audio/en/fy-8.mp3",
      "dur": 17
    },
    "fy-9": {
      "url": "/audio/en/fy-9.mp3",
      "dur": 19
    },
    "v-1": {
      "url": "/audio/en/v-1.mp3",
      "dur": 17
    },
    "v-2": {
      "url": "/audio/en/v-2.mp3",
      "dur": 15
    },
    "v-3": {
      "url": "/audio/en/v-3.mp3",
      "dur": 17
    },
    "v-4": {
      "url": "/audio/en/v-4.mp3",
      "dur": 17
    },
    "v-5": {
      "url": "/audio/en/v-5.mp3",
      "dur": 16
    },
    "v-6": {
      "url": "/audio/en/v-6.mp3",
      "dur": 16
    }
  }
};

function entrada(id, lang) {
  const banco = AUDIO_BANK[lang] || AUDIO_BANK.en || {};
  return banco[id] || null;
}

export function audioUrl(id, lang = 'pt') {
  const e = entrada(id, lang);
  if (!e) return null;
  return typeof e === 'string' ? e : e.url || null;
}

// Duração real da locução, em segundos. null quando não há áudio para o id —
// quem chama decide o que mostrar (nunca inventar número).
export function audioDur(id, lang = 'pt') {
  const e = entrada(id, lang);
  if (!e || typeof e === 'string') return null;
  return typeof e.dur === 'number' ? e.dur : null;
}

export function audioCount(lang) {
  if (lang) return Object.keys(AUDIO_BANK[lang] || {}).length;
  return Object.keys(AUDIO_BANK.pt).length + Object.keys(AUDIO_BANK.en).length;
}
