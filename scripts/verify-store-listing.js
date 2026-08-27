const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'store-listing');
const FINAL = path.join(STORE, 'assets', 'final');
const failures = [];
const warnings = [];
const submissionMode = process.argv.includes('--submission');

function fail(message) {
  failures.push(message);
}

function read(relative) {
  const file = path.join(STORE, relative);
  if (!fs.existsSync(file)) {
    fail(`missing file: ${relative}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8').trim();
}

function assertMax(label, value, max) {
  if (!String(value).trim()) fail(`${label}: must not be empty`);
  if (value.length > max) fail(`${label}: ${value.length}/${max} characters`);
}

function assertBytes(label, value, max) {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > max) fail(`${label}: ${bytes}/${max} bytes`);
}

function normalizedWords(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
}

function imageSize(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    const colorType = buffer[25];
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      type: 'png',
      hasAlpha: colorType === 4 || colorType === 6,
    };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
          type: 'jpeg',
        };
      }
      if (!Number.isFinite(length) || length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

function assertImage(relative, width, height, { maxBytes, alpha } = {}) {
  const file = path.join(FINAL, relative);
  if (!fs.existsSync(file)) {
    fail(`missing asset: ${relative}`);
    return;
  }
  const size = imageSize(file);
  if (!size) {
    fail(`unreadable image: ${relative}`);
    return;
  }
  if (size.width !== width || size.height !== height) {
    fail(`${relative}: ${size.width}x${size.height}, expected ${width}x${height}`);
  }
  const expectedType = path.extname(relative).toLowerCase() === '.jpg' ? 'jpeg' : 'png';
  if (size.type !== expectedType) fail(`${relative}: encoded as ${size.type}, expected ${expectedType}`);
  if (alpha === true && size.hasAlpha !== true) fail(`${relative}: PNG must include an alpha channel`);
  if (alpha === false && size.hasAlpha === true) fail(`${relative}: PNG must not include transparency`);
  if (maxBytes && fs.statSync(file).size > maxBytes) {
    fail(`${relative}: ${fs.statSync(file).size} bytes, max ${maxBytes}`);
  }
}

const forbidden = [
  /(?:^|\s)#1\b/i,
  /\b(best|melhor|top)\b/i,
  /\b(guaranteed results?|resultados? garantidos?|guarantees? manifestation|garante manifesta[cç][aã]o)\b/i,
  /\b(cures?|cura) (anxiety|depression|ansiedade|depress[aã]o)\b/i,
  /\b(stella|thinkup|co-star|nebula)\b/i,
];

for (const locale of ['pt-BR', 'en-US']) {
  const appleBase = `${locale}/apple`;
  const googleBase = `${locale}/google-play`;
  const apple = {
    name: read(`${appleBase}/name.txt`),
    subtitle: read(`${appleBase}/subtitle.txt`),
    keywords: read(`${appleBase}/keywords.txt`),
    promotional: read(`${appleBase}/promotional_text.txt`),
    description: read(`${appleBase}/description.txt`),
  };
  const google = {
    title: read(`${googleBase}/title.txt`),
    short: read(`${googleBase}/short_description.txt`),
    description: read(`${googleBase}/full_description.txt`),
  };
  const release = {
    apple: read(`${appleBase}/whats_new.txt`),
    google: read(`${googleBase}/release_notes.txt`),
  };

  assertMax(`${locale} Apple name`, apple.name, 30);
  assertMax(`${locale} Apple subtitle`, apple.subtitle, 30);
  assertBytes(`${locale} Apple keywords`, apple.keywords, 100);
  assertMax(`${locale} Apple promotional text`, apple.promotional, 170);
  assertMax(`${locale} Apple description`, apple.description, 4000);
  assertMax(`${locale} Google title`, google.title, 30);
  assertMax(`${locale} Google short description`, google.short, 80);
  assertMax(`${locale} Google full description`, google.description, 4000);
  assertMax(`${locale} Apple what's new`, release.apple, 4000);
  assertMax(`${locale} Google release notes`, release.google, 500);

  if (apple.name !== google.title) warnings.push(`${locale}: Apple and Google titles differ intentionally`);
  const occupied = new Set(normalizedWords(`${apple.name} ${apple.subtitle}`));
  const repeated = normalizedWords(apple.keywords).filter((word) => occupied.has(word));
  if (repeated.length) fail(`${locale} Apple keywords repeat name/subtitle: ${[...new Set(repeated)].join(', ')}`);

  const publicCopy = [apple.name, apple.subtitle, apple.promotional, apple.description, google.short, google.description].join('\n');
  for (const pattern of forbidden) {
    if (pattern.test(publicCopy)) fail(`${locale}: forbidden or unsupported claim matched ${pattern}`);
  }

  process.stdout.write(
    `${locale}: title ${apple.name.length}/30, subtitle ${apple.subtitle.length}/30, ` +
      `keywords ${Buffer.byteLength(apple.keywords, 'utf8')}/100 bytes, short ${google.short.length}/80\n`
  );
}

const screenshotFile = path.join(STORE, 'screenshots.json');
let screenshotSpec = null;
try {
  screenshotSpec = JSON.parse(fs.readFileSync(screenshotFile, 'utf8'));
} catch (error) {
  fail(`screenshots.json is invalid: ${error.message}`);
}

if (screenshotSpec) {
  if (!Array.isArray(screenshotSpec.items) || screenshotSpec.items.length !== 8) {
    fail('screenshots.json must contain exactly 8 primary screenshots');
  } else {
    const ids = new Set();
    screenshotSpec.items.forEach((item, index) => {
      if (item.order !== index + 1) fail(`screenshot order mismatch at ${item.id || index}`);
      if (!item.id || ids.has(item.id)) fail(`duplicate or empty screenshot id: ${item.id}`);
      if (!item.source) fail(`screenshot ${item.order}: source must not be empty`);
      if (!/^#[0-9A-F]{6}$/i.test(item.accent || '')) fail(`screenshot ${item.order}: invalid accent color`);
      ids.add(item.id);
      for (const locale of ['pt-BR', 'en-US']) {
        const localized = item[locale] || {};
        assertMax(`${locale} screenshot ${item.order} headline`, localized.headline || '', 48);
        assertMax(`${locale} screenshot ${item.order} alt`, localized.alt || '', 140);
      }
    });
  }
}

if (screenshotSpec && Array.isArray(screenshotSpec.items)) {
  for (const platform of ['apple', 'google-play']) {
    const dimensions = platform === 'apple' ? [1290, 2796] : [1080, 1920];
    for (const locale of ['pt-BR', 'en-US']) {
      for (const item of screenshotSpec.items) {
        assertImage(
          path.join(platform, locale, `${String(item.order).padStart(2, '0')}-${item.id}.jpg`),
          dimensions[0],
          dimensions[1]
        );
      }
    }
  }
}

for (const locale of ['pt-BR', 'en-US']) {
  assertImage(path.join('google-play', 'feature-graphic', `${locale}.jpg`), 1024, 500);
}
assertImage(path.join('icons', 'apple-icon-1024.png'), 1024, 1024, { alpha: false });
assertImage(path.join('icons', 'google-play-icon-512.png'), 512, 512, {
  maxBytes: 1024 * 1024,
  alpha: true,
});

try {
  const urls = JSON.parse(fs.readFileSync(path.join(STORE, 'urls.json'), 'utf8'));
  for (const key of ['privacy', 'support']) {
    if (!urls[key]) warnings.push(`${key} URL still needs a public owner-approved page`);
    else if (!/^https:\/\//i.test(urls[key])) fail(`${key} URL must use HTTPS`);
    if (submissionMode && !urls[key]) fail(`${key} URL is required for store submission`);
  }
} catch (error) {
  fail(`urls.json is invalid: ${error.message}`);
}

let consoleFields = null;
try {
  consoleFields = JSON.parse(fs.readFileSync(path.join(STORE, 'console-fields.json'), 'utf8'));
} catch (error) {
  fail(`console-fields.json is invalid: ${error.message}`);
}

const appConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (appConfig.expo.icon !== './assets/icon-celeste-v2.png') {
  fail('app.json is not using icon-celeste-v2.png');
}
if (appConfig.expo.android?.adaptiveIcon?.foregroundImage !== './assets/mascot/celi.png') {
  fail('Android adaptive icon is not using the transparent Celeste mascot foreground');
} else {
  const foreground = path.join(ROOT, appConfig.expo.android.adaptiveIcon.foregroundImage);
  const foregroundSize = fs.existsSync(foreground) ? imageSize(foreground) : null;
  if (!foregroundSize || foregroundSize.type !== 'png' || foregroundSize.hasAlpha !== true) {
    fail('Android adaptive foreground must be a readable PNG with an alpha channel');
  }
}

if (!/^~57\./.test(packageJson.dependencies?.expo || '')) {
  fail('package.json must use the supported Expo SDK 57 release line');
}
if (
  packageJson.dependencies?.react !== '19.2.3' ||
  packageJson.dependencies?.['react-native'] !== '0.86.3'
) {
  fail('React and React Native must match the Expo SDK 57 compatibility matrix');
}
if (!/^\d+(?:\.\d+){0,2}$/.test(appConfig.expo.ios?.buildNumber || '')) {
  fail('iOS buildNumber must use a valid numeric version');
}
if (!Number.isInteger(appConfig.expo.android?.versionCode) || appConfig.expo.android.versionCode < 1) {
  fail('Android versionCode must be a positive integer');
}
if (appConfig.expo.android?.allowBackup !== false) {
  fail('Android backups must be disabled for local private app data');
}
const blockedAndroidPermissions = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];
for (const permission of blockedAndroidPermissions) {
  if (!appConfig.expo.android?.blockedPermissions?.includes(permission)) {
    fail(`unused Android permission must be blocked: ${permission}`);
  }
}
if (appConfig.expo.ios?.config?.usesNonExemptEncryption !== false) {
  fail('iOS export compliance must declare that the app does not use non-exempt encryption');
}
const audioPlugin = appConfig.expo.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-audio'
);
if (
  !audioPlugin ||
  audioPlugin[1]?.microphonePermission !== false ||
  audioPlugin[1]?.recordAudioAndroid !== false
) {
  fail('expo-audio must be configured for playback without microphone permission');
}
if (!appConfig.expo.plugins?.includes('expo-notifications')) {
  fail('expo-notifications config plugin is required for daily reminders');
}
const splashPlugin = appConfig.expo.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
);
if (!splashPlugin || splashPlugin[1]?.backgroundColor !== '#E6EFF8') {
  fail('expo-splash-screen must preserve the Celeste launch background');
}

try {
  const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
  if (eas.cli?.appVersionSource !== 'remote') fail('EAS appVersionSource must be remote');
  if (eas.build?.preview?.distribution !== 'internal') {
    fail('EAS preview build must use internal distribution');
  }
  if (eas.build?.production?.autoIncrement !== true) fail('EAS production build must auto-increment');
  if (eas.build?.production?.distribution !== 'store') {
    fail('EAS production build must use store distribution');
  }
  if (!eas.submit?.production || typeof eas.submit.production !== 'object') {
    fail('EAS production submit profile is missing');
  }
} catch (error) {
  fail(`eas.json is invalid: ${error.message}`);
}

if (consoleFields) {
  if (consoleFields.app?.version !== appConfig.expo.version) {
    fail('console-fields app version differs from app.json');
  }
  if (consoleFields.apple?.bundleId !== appConfig.expo.ios?.bundleIdentifier) {
    fail('console-fields Apple bundle ID differs from app.json');
  }
  if (consoleFields.googlePlay?.packageName !== appConfig.expo.android?.package) {
    fail('console-fields Google package name differs from app.json');
  }
}

try {
  const readiness = JSON.parse(fs.readFileSync(path.join(STORE, 'submission-readiness.json'), 'utf8'));
  const checks = readiness && readiness.checks;
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) {
    fail('submission-readiness.json must contain a checks object');
  } else {
    for (const [key, check] of Object.entries(checks)) {
      if (!check || typeof check !== 'object' || !String(check.note || '').trim()) {
        fail(`submission readiness check is incomplete: ${key}`);
        continue;
      }
      if (check.ready !== true) {
        warnings.push(`submission evidence pending: ${key}`);
        if (submissionMode) fail(`submission evidence is required: ${key}`);
      } else if (!String(check.evidence || '').trim()) {
        fail(`submission readiness check has no evidence: ${key}`);
      }
    }
  }
} catch (error) {
  fail(`submission-readiness.json is invalid: ${error.message}`);
}

warnings.forEach((message) => console.warn(`WARN: ${message}`));
if (failures.length) {
  console.error(`\nStore listing verification failed (${failures.length}):`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log(
  submissionMode
    ? '\nStore listing package is ready for submission.'
    : warnings.length
    ? '\nStore listing draft passed; resolve the warnings before submission.'
    : '\nStore listing metadata and assets are valid.'
);
