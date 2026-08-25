#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public', 'audio', 'narrators');
const MODEL = 'eleven_multilingual_v2';
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 30000;

const NARRATORS = [
  {
    id: 'aurora',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    settings: { stability: 0.54, similarity_boost: 0.78, style: 0.12, use_speaker_boost: true, speed: 0.94 },
  },
  {
    id: 'rio',
    voiceId: 'SAz9YHcvj6GT2YYXdXww',
    settings: { stability: 0.62, similarity_boost: 0.72, style: 0.05, use_speaker_boost: true, speed: 0.9 },
  },
  {
    id: 'atlas',
    voiceId: 'JBFqnCBsd6RMkjVDRZzb',
    settings: { stability: 0.58, similarity_boost: 0.78, style: 0.1, use_speaker_boost: true, speed: 0.88 },
  },
];

const SAMPLES = {
  pt: 'Respire fundo. A vida que você está construindo começa a ganhar forma, e hoje você dá o próximo passo.',
  en: 'Take a slow breath. The life you are building is beginning to take shape, and today you take the next step.',
};

function cleanKey(value) {
  return typeof value === 'string' ? value.trim().slice(0, 512) : '';
}

async function generateSample({ narrator, lang, apiKey, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(narrator.voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        signal: controller.signal,
        body: JSON.stringify({
          text: SAMPLES[lang],
          model_id: MODEL,
          language_code: lang,
          voice_settings: narrator.settings,
        }),
      }
    );
    if (!response.ok) throw new Error(`elevenlabs_http_${response.status}`);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('audio/mpeg')) throw new Error('invalid_audio_content_type');
    const declaredBytes = Number(response.headers.get('content-length') || 0);
    if (declaredBytes > MAX_AUDIO_BYTES) throw new Error('audio_too_large');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error('invalid_audio_size');
    return bytes;
  } finally {
    clearTimeout(timer);
  }
}

function writeAtomically(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.rmSync(target, { force: true });
  fs.renameSync(temporary, target);
}

async function main() {
  const apiKey = cleanKey(process.env.ELEVENLABS_API_KEY);
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY ausente');
  for (const narrator of NARRATORS) {
    for (const lang of ['pt', 'en']) {
      const bytes = await generateSample({ narrator, lang, apiKey });
      const filename = `${narrator.id}-${lang}-v1.mp3`;
      writeAtomically(path.join(OUTPUT_DIR, filename), bytes);
      console.log(`${filename}: ${bytes.length} bytes`);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.message ? error.message : 'sample_generation_failed');
    process.exitCode = 1;
  });
}

module.exports = { NARRATORS, SAMPLES, generateSample };
