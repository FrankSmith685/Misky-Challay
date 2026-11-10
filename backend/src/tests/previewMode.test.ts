import assert from 'node:assert/strict';
import { test } from 'node:test';
import webpush from 'web-push';

test('preview mode serves reads and rejects order creation before reaching routes', async () => {
  const vapid = webpush.generateVAPIDKeys();
  const overrides: Record<string, string> = {
    NODE_ENV: 'production',
    PREVIEW_MODE: 'true',
    CORS_ORIGIN: 'https://preview.example.test',
    FRONTEND_URL: 'https://preview.example.test',
    DB_USER: 'preview',
    DB_PASSWORD: 'preview-only-password',
    DB_AUTO_CREATE: 'false',
    DB_SYNC: 'false',
    DB_ALTER: 'false',
    DB_FORCE: 'false',
    SEED_DEMO_DATA: 'false',
    SEED_MISKY_CATALOG: 'false',
    ADMIN_PASSWORD_RESET: 'false',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    ADMIN_EMAIL: 'preview@invalid.test',
    ADMIN_PASSWORD: 'preview-only-password',
    MOCK_WEBHOOK_SECRET: 'c'.repeat(48),
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: 'mailto:preview@invalid.test',
    SETTINGS_ENCRYPTION_KEY: 'd'.repeat(48),
    STRIPE_SECRET_KEY: '',
    STRIPE_WEBHOOK_SECRET: '',
    MERCADOPAGO_ACCESS_TOKEN: '',
    MERCADOPAGO_WEBHOOK_SECRET: '',
    MERCADOPAGO_MODE: '',
    MAIL_HOST: 'smtp.invalid',
    BUSINESS_LEGAL_NAME: 'Misky Challay (datos legales pendientes)',
    BUSINESS_RUC: '20600000000',
    BUSINESS_EMAIL: 'contacto@ejemplo.com',
    TRUST_PROXY: '1',
    MOBILE_RETURN_BASE_URL: '',
  };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  const { createApp } = await import('../app');
  const server = createApp().listen(0, '127.0.0.1');

  try {
    await new Promise<void>((resolve) => {
      if (server.listening) resolve();
      else server.once('listening', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;

    const read = await fetch(`${base}/`);
    assert.equal(read.status, 200);
    assert.equal(read.headers.get('x-robots-tag'), 'noindex, nofollow');

    const write = await fetch(`${base}/api/v1/checkout/place`, { method: 'POST' });
    assert.equal(write.status, 503);
    assert.match((await write.json() as { message: string }).message, /pedidos y cambios desactivados/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
