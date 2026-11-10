import crypto from 'node:crypto';
import { env } from '@config/env';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const randomBase32 = (bytes = 20): string => {
  const buffer = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
};

const decodeBase32 = (value: string): Buffer => {
  let bits = 0;
  let current = 0;
  const output: number[] = [];
  for (const char of value.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Secreto TOTP invalido');
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(output);
};

export const totpCode = (secret: string, timestamp = Date.now()): string => {
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
};

export const verifyTotp = (secret: string, code: string): boolean => {
  const normalized = code.trim().replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  return [-1, 0, 1].some((offset) => {
    const expected = totpCode(secret, Date.now() + offset * 30_000);
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(normalized));
  });
};

const encryptionKey = (): Buffer => crypto.createHash('sha256').update(env.JWT_ACCESS_SECRET).digest();

export const encryptTotpSecret = (secret: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`;
};

export const decryptTotpSecret = (value: string): string => {
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Secreto MFA invalido');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64')), decipher.final()]).toString('utf8');
};
