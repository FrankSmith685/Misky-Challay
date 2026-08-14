import assert from 'node:assert/strict';
import test from 'node:test';
import { forgotPasswordSchema } from '../modules/auth/auth.validation';

test('la recuperación móvil conserva el canal que abrirá la app', () => {
  const parsed = forgotPasswordSchema.parse({
    body: { email: 'cliente@verdebowl.pe', client: 'MOBILE' },
  });

  assert.equal(parsed.body.client, 'MOBILE');
  assert.equal(parsed.body.email, 'cliente@verdebowl.pe');
});

test('la recuperación web sigue siendo el valor predeterminado', () => {
  const parsed = forgotPasswordSchema.parse({ body: { email: 'cliente@verdebowl.pe' } });
  assert.equal(parsed.body.client, 'WEB');
});

test('rechaza canales de recuperación inventados por el cliente', () => {
  const result = forgotPasswordSchema.safeParse({
    body: { email: 'cliente@verdebowl.pe', client: 'WHATSAPP' },
  });
  assert.equal(result.success, false);
});
