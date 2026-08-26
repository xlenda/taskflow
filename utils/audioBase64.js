const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function isWav(bytes) {
  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  );
}

export function wavBytesToBase64(bytes) {
  if (!(bytes instanceof Uint8Array) || !isWav(bytes)) {
    throw new TypeError('invalid_wav_bytes');
  }

  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;
    const value = (first << 16) | (second << 8) | third;

    encoded += BASE64_ALPHABET[(value >>> 18) & 0x3f];
    encoded += BASE64_ALPHABET[(value >>> 12) & 0x3f];
    encoded += hasSecond ? BASE64_ALPHABET[(value >>> 6) & 0x3f] : '=';
    encoded += hasThird ? BASE64_ALPHABET[value & 0x3f] : '=';
  }

  return encoded;
}
