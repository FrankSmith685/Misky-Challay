import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { env } from '@config/env';
import { ApiError } from '@shared/errors/ApiError';
import { fluxImageService } from '../modules/media/fluxImage.service';

const originalAccountId = env.CLOUDFLARE_ACCOUNT_ID;
const originalToken = env.CLOUDFLARE_API_TOKEN;

afterEach(() => {
  env.CLOUDFLARE_ACCOUNT_ID = originalAccountId;
  env.CLOUDFLARE_API_TOKEN = originalToken;
  mock.restoreAll();
});

test('no intenta llamar a Cloudflare si faltan credenciales', async () => {
  env.CLOUDFLARE_ACCOUNT_ID = '';
  env.CLOUDFLARE_API_TOKEN = '';
  const fetchMock = mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected fetch'); });

  await assert.rejects(fluxImageService.generate('Una torta de chocolate sobre fondo blanco'), (error: unknown) =>
    error instanceof ApiError && error.statusCode === 503);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('envia el prompt a FLUX y devuelve una imagen valida para previsualizar', async () => {
  env.CLOUDFLARE_ACCOUNT_ID = 'account-test';
  env.CLOUDFLARE_API_TOKEN = 'token-test';
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({
    success: true,
    result: { image: bytes.toString('base64') },
  }));

  const result = await fluxImageService.generate('  Torta de chocolate sobre fondo blanco  ');

  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(result.dataUrl, `data:image/jpeg;base64,${bytes.toString('base64')}`);
  const [url, options] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.match(url, /accounts\/account-test\/ai\/run\/@cf\/black-forest-labs\/flux-1-schnell$/);
  assert.deepEqual(JSON.parse(String(options.body)), { prompt: 'Torta de chocolate sobre fondo blanco', steps: 4 });
  assert.equal((options.headers as Record<string, string>).Authorization, 'Bearer token-test');
});

test('rechaza datos que no sean una imagen aunque Cloudflare marque exito', async () => {
  env.CLOUDFLARE_ACCOUNT_ID = 'account-test';
  env.CLOUDFLARE_API_TOKEN = 'token-test';
  mock.method(globalThis, 'fetch', async () => Response.json({ success: true, result: { image: Buffer.from('no-image').toString('base64') } }));

  await assert.rejects(fluxImageService.generate('Una torta con fresas y fondo claro'), (error: unknown) =>
    error instanceof ApiError && error.statusCode === 502);
});

test('informa el limite de Cloudflare sin filtrar detalles del proveedor', async () => {
  env.CLOUDFLARE_ACCOUNT_ID = 'account-test';
  env.CLOUDFLARE_API_TOKEN = 'token-test';
  mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));

  await assert.rejects(fluxImageService.generate('Una torta con fresas y fondo claro'), (error: unknown) =>
    error instanceof ApiError && error.statusCode === 429);
});

test('envía la foto de referencia como imagen multipart para la vista de la torta', async () => {
  env.CLOUDFLARE_ACCOUNT_ID = 'account-test';
  env.CLOUDFLARE_API_TOKEN = 'token-test';
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  const fetchMock = mock.method(globalThis, 'fetch', async () => Response.json({ success: true, result: { image: bytes.toString('base64') } }));
  const reference = `data:image/jpeg;base64,${bytes.toString('base64')}`;

  const result = await fluxImageService.generateCakePreview('Torta de chocolate con relleno de fresa', reference);

  assert.equal(result.mimeType, 'image/jpeg');
  const [url, options] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
  assert.match(url, /flux-2-klein-4b$/);
  assert.equal((options.headers as Record<string, string>).Authorization, 'Bearer token-test');
  assert.equal((options.headers as Record<string, string>)['Content-Type'], undefined);
  const form = options.body as FormData;
  assert.equal(form.get('prompt'), 'Torta de chocolate con relleno de fresa');
  assert.equal(form.get('width'), '768');
  assert.deepEqual(Buffer.from(await (form.get('input_image_0') as Blob).arrayBuffer()), bytes);
});
