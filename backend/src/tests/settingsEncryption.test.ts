import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptSetting, encryptSetting } from '@shared/security/settingsEncryption';

test('cifra secretos de configuracion sin conservar el texto plano', () => {
  const secret = 'smtp-password-for-test';
  const encrypted = encryptSetting(secret);

  assert.notEqual(encrypted, secret);
  assert.equal(encrypted.includes(secret), false);
  assert.equal(decryptSetting(encrypted), secret);
});

test('usa un nonce diferente para el mismo secreto', () => {
  const first = encryptSetting('same-secret');
  const second = encryptSetting('same-secret');

  assert.notEqual(first, second);
  assert.equal(decryptSetting(first), decryptSetting(second));
});
