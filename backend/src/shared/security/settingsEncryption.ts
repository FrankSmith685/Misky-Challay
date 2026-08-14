import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '@config/env';

const key = (): Buffer =>
  createHash('sha256')
    .update(env.SETTINGS_ENCRYPTION_KEY || env.JWT_REFRESH_SECRET)
    .digest();

/** AES-GCM protege secretos administrados desde la web antes de escribirlos en MySQL. */
export const encryptSetting = (plainText: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
};

export const decryptSetting = (value: string): string => {
  const [version, iv, tag, encrypted] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !encrypted) throw new Error('Formato de secreto no reconocido');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]).toString('utf8');
};
