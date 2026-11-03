import assert from 'node:assert/strict';
import { test } from 'node:test';
import { whatsappRecipient } from '../shared/utils/whatsappPhone';

test('convierte celulares peruanos sin cambiar números internacionales explícitos', () => {
  assert.equal(whatsappRecipient('987 654 321'), '51987654321');
  assert.equal(whatsappRecipient('+51 987 654 321'), '51987654321');
  assert.equal(whatsappRecipient('+1 415 555 2671'), '14155552671');
});

test('rechaza teléfonos incompletos o prefijos internacionales ambiguos', () => {
  assert.equal(whatsappRecipient('123456'), null);
  assert.equal(whatsappRecipient('4155552671'), null);
  assert.equal(whatsappRecipient(''), null);
  assert.equal(whatsappRecipient('+51 999 999 999'), null);
});
