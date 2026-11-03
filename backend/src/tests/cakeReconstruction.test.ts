import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { cakeReconstructionService, createCakeReconstructionService, referenceHash, validateReconstructedGlb } from '../modules/cakes/cakeReconstruction.service';
import reconstructionRoutes from '../modules/cakes/cakeReconstruction.routes';
import { errorHandler } from '../middlewares/error.middleware';

const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJX0AAAAASUVORK5CYII=';
const folders: string[] = [];
const validGlb = (uri?: string) => {
  const json = JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: 36, ...(uri ? { uri } : {}) }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 1] }] });
  const length = Math.ceil(Buffer.byteLength(json) / 4) * 4;
  const result = Buffer.alloc(12 + 8 + length + 8 + 36, 0);
  result.write('glTF'); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(length, 12); result.writeUInt32LE(0x4e4f534a, 16); result.fill(32, 20, 20 + length); result.write(json, 20);
  result.writeUInt32LE(36, 20 + length); result.writeUInt32LE(0x004e4942, 24 + length);
  return result;
};
const setup = async (provider: 'disabled' | 'meshy' | 'hunyuan' | 'triposr' | 'sf3d' | 'hunyuanmini' = 'meshy', limits: { hourlyLimit?: number; maxActive?: number } = {}) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'misky-reconstruction-test-')); folders.push(directory);
  let time = Date.now(); let submissions = 0; let lookups = 0; let status = 'IN_PROGRESS'; let modelUrl = 'https://assets.meshy.ai/test/model.glb'; let submitFailure = false;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith('/health')) return Response.json({ status: 'ready', engine: provider, weightsReady: true });
    if (url.endsWith('/image-to-3d') || url.endsWith('/send')) { submissions++; if (submitFailure) throw new Error('Provider unavailable'); return Response.json(provider !== 'meshy' ? { uid: 'gpu-task' } : { result: 'provider-task' }); }
    if (url.endsWith('model.glb')) return new Response(new Uint8Array(validGlb()));
    lookups++;
    return Response.json(provider !== 'meshy' ? { status: status === 'SUCCEEDED' ? 'completed' : status === 'TEXTURE' ? 'texturing' : status === 'FAILED' ? 'error' : 'processing', ...(status === 'LOADING' ? { stage: 'loading' } : status === 'BACKGROUND' ? { stage: 'background' } : {}), ...(status === 'SUCCEEDED' ? { model_base64: validGlb().toString('base64') } : {}) } : { status, progress: 37, model_urls: { glb: modelUrl } });
  }) as typeof fetch;
  const configuration = () => ({ provider, meshyKey: 'test-key', hunyuanUrl: 'http://gpu.test:8081', triposrUrl: 'http://127.0.0.1:8091', sf3dUrl: 'http://127.0.0.1:8092', hunyuanMiniUrl: 'http://127.0.0.1:8093', maxActive: 2, ...limits });
  const service = createCakeReconstructionService({ directory, configuration, fetcher, now: () => time });
  return { service, directory, calls, stats: () => ({ submissions, lookups }), tick: (milliseconds = 5000) => { time += milliseconds; }, setStatus: (value: string) => { status = value; }, setUrl: (url: string) => { modelUrl = url; },
    setSubmitFailure: (value: boolean) => { submitFailure = value; },
    restart: () => createCakeReconstructionService({ directory, configuration, fetcher, now: () => time }) };
};
afterEach(async () => {
  mock.restoreAll();
  for (const directory of folders.splice(0)) {
    assert(path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + 'misky-reconstruction-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('no finge convertir una foto si el motor no está configurado', async () => {
  const { service, stats } = await setup('disabled');
  assert.equal(service.capabilities().enabled, false);
  await assert.rejects(service.create(photo, randomUUID()), /no está disponible/);
  assert.equal(stats().submissions, 0);
});
test('una solicitud repetida crea una sola generación y no guarda la foto ni la clave', async () => {
  const { service, stats, directory } = await setup();
  const id = randomUUID();
  const [first, second] = await Promise.all([service.create(photo, id), service.create(photo, id)]);
  assert.equal(first.token, second.token); assert.equal(first.sourceHash, referenceHash(photo)); assert.equal(stats().submissions, 1);
  const record = await readFile(path.join(directory, `${first.token}.json`), 'utf8');
  assert(!record.includes('test-key')); assert(!record.includes('data:image')); assert(!JSON.stringify(first).includes('provider-task'));
  await assert.rejects(service.create(photo.replace('CAAAAC0l', 'CAAAAC1l'), id), /otra imagen/);
});

test('el cupo por cliente cuenta generaciones nuevas y permite recuperar una solicitud con el cupo lleno', async () => {
  const fixture = await setup('triposr', { hourlyLimit: 1, maxActive: 10 });
  const id = randomUUID();
  const first = await fixture.service.create(photo, id, 'client-a');
  assert.equal((await fixture.service.create(photo, id, 'client-a')).token, first.token);
  await assert.rejects(fixture.service.create(photo, randomUUID(), 'client-a'), (error: unknown) => {
    const limit = error as { code: string; details: { retryAfterSeconds: number } };
    assert.equal(limit.code, 'MODEL_QUOTA_EXCEEDED');
    assert.equal(limit.details.retryAfterSeconds, 3600);
    return true;
  });
  assert.equal(fixture.stats().submissions, 1);
  await fixture.service.create(photo, randomUUID(), 'client-b');
  assert.equal(fixture.stats().submissions, 2);
  fixture.setStatus('SUCCEEDED');
  assert.equal((await fixture.service.get(first.token)).status, 'SUCCEEDED');
  fixture.tick(60 * 60 * 1000);
  await fixture.service.create(photo, randomUUID(), 'client-a');
  assert.equal(fixture.stats().submissions, 3);
});

test('solicitudes simultáneas respetan el cupo sin enviar trabajo extra al motor', async () => {
  const fixture = await setup('triposr', { hourlyLimit: 1, maxActive: 10 });
  const results = await Promise.allSettled([fixture.service.create(photo, randomUUID(), 'client'), fixture.service.create(photo, randomUUID(), 'client')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(fixture.stats().submissions, 1);
});

test('un envío fallido no consume el cupo y la configuración local permite más de tres conversiones', async () => {
  const fixture = await setup('triposr', { hourlyLimit: 1, maxActive: 10 });
  fixture.setSubmitFailure(true);
  assert.equal((await fixture.service.create(photo, randomUUID(), 'client')).status, 'FAILED');
  fixture.setSubmitFailure(false);
  assert.equal((await fixture.service.create(photo, randomUUID(), 'client')).status, 'PENDING');
  const local = await setup('triposr', { hourlyLimit: 30, maxActive: 10 });
  for (let i = 0; i < 4; i++) await local.service.create(photo, randomUUID(), 'client');
  assert.equal(local.stats().submissions, 4);
});

test('la ruta acepta una cuarta foto y devuelve Retry-After solo para generaciones nuevas fuera del cupo', async () => {
  const fixture = await setup('triposr', { hourlyLimit: 4, maxActive: 10 });
  mock.method(cakeReconstructionService, 'create', (...args: Parameters<typeof fixture.service.create>) => fixture.service.create(...args));
  const app = express();
  app.use(express.json());
  app.use('/reconstructions', reconstructionRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/reconstructions`;
  const firstId = randomUUID();
  const post = (requestId: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ referenceDataUrl: photo, requestId }) });
  try {
    for (const id of [firstId, randomUUID(), randomUUID(), randomUUID()]) assert.equal((await post(id)).status, 202);
    const blocked = await post(randomUUID());
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '3600');
    assert.equal((await blocked.json() as { code: string }).code, 'MODEL_QUOTA_EXCEEDED');
    assert.equal((await post(firstId)).status, 202);
    assert.equal(fixture.stats().submissions, 4);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
test('consulta progreso real, descarga GLB y retoma tras reiniciar sin otro cargo', async () => {
  const fixture = await setup(); const job = await fixture.service.create(photo, randomUUID());
  const progress = await fixture.service.get(job.token);
  assert.equal(progress.status, 'IN_PROGRESS'); assert.equal(progress.progress, 37);
  await fixture.service.get(job.token); assert.equal(fixture.stats().lookups, 1);
  fixture.tick(); fixture.setStatus('SUCCEEDED');
  const restarted = fixture.restart();
  const ready = await restarted.get(job.token);
  assert.equal(ready.status, 'SUCCEEDED'); assert.equal(fixture.stats().submissions, 1);
  assert.deepEqual(await restarted.model(job.token), validGlb());
  await restarted.retain(job.token, referenceHash(photo));
  await assert.rejects(restarted.retain(job.token, '0'.repeat(64)), /no corresponde/);
});
test('Hunyuan usa generación de forma y texturas, con etapas y sin porcentajes inventados', async () => {
  const fixture = await setup('hunyuan'); const job = await fixture.service.create(photo, randomUUID());
  assert.equal(fixture.calls[0].url, 'http://gpu.test:8081/send');
  assert.equal(JSON.parse(fixture.calls[0].init?.body as string).texture, true);
  assert.equal((await fixture.service.get(job.token)).progress, null);
  fixture.tick(); fixture.setStatus('TEXTURE'); assert.equal((await fixture.service.get(job.token)).stage, 'texture');
  fixture.tick(); fixture.setStatus('SUCCEEDED'); assert.equal((await fixture.service.get(job.token)).status, 'SUCCEEDED');
  assert.deepEqual(await fixture.service.model(job.token), validGlb());
});
test('fallos, caducidad y límite global no producen modelos ficticios', async () => {
  const fixture = await setup(); const job = await fixture.service.create(photo, randomUUID());
  await assert.rejects(fixture.service.model(job.token), /no está listo/);
  await fixture.service.create(photo, randomUUID());
  await assert.rejects(fixture.service.create(photo, randomUUID()), /ocupadas/);
  fixture.setStatus('FAILED'); assert.equal((await fixture.service.get(job.token)).status, 'FAILED');
  fixture.tick(31 * 24 * 60 * 60 * 1000); await assert.rejects(fixture.service.get(job.token), /venció/);
  await fixture.service.create(photo, randomUUID());
  assert.equal((await readdir(fixture.directory)).filter(file => file.endsWith('.json')).length, 1);
});
test('TripoSR utiliza el servicio local y devuelve una malla sin una cuenta externa', async () => {
  const fixture = await setup('triposr');
  const job = await fixture.service.create(photo, randomUUID());
  assert.equal(fixture.calls[0].url, 'http://127.0.0.1:8091/send');
  assert(!('Authorization' in (fixture.calls[0].init?.headers ?? {})));
  assert.equal((await fixture.service.availability()).enabled, true);
  assert.equal((await fixture.service.get(job.token)).stage, 'shape');
  fixture.tick(); fixture.setStatus('SUCCEEDED');
  assert.equal((await fixture.service.get(job.token)).status, 'SUCCEEDED');
  assert.deepEqual(await fixture.service.model(job.token), validGlb());
});
test('un servicio local apagado se detecta antes de iniciar una conversión', async () => {
  const fixture = await setup('triposr');
  const service = createCakeReconstructionService({ directory: fixture.directory, configuration: () => ({ provider: 'triposr', triposrUrl: 'http://127.0.0.1:8091', maxActive: 1 }), fetcher: (async () => { throw new Error('offline'); }) as typeof fetch });
  assert.deepEqual(await service.availability(), { enabled: false, provider: 'triposr' });
});

test('SF3D conserva el modelo privado tras reiniciar sin reenviar la foto ni credenciales HF', async () => {
  const fixture = await setup('sf3d');
  assert.deepEqual(await fixture.service.availability(), { enabled: true, provider: 'sf3d' });
  const job = await fixture.service.create(photo, randomUUID());
  const submission = fixture.calls.find(call => call.url.endsWith('/send'))!;
  assert.equal(submission.url, 'http://127.0.0.1:8092/send');
  assert(!('Authorization' in (submission.init?.headers ?? {})));
  fixture.setStatus('TEXTURE');
  assert.equal((await fixture.service.get(job.token)).stage, 'texture');
  fixture.tick(); fixture.setStatus('SUCCEEDED');
  assert.equal((await fixture.restart().get(job.token)).status, 'SUCCEEDED');
  assert.deepEqual(await fixture.restart().model(job.token), validGlb());
  assert.equal(fixture.stats().submissions, 1);
});

test('SF3D no se anuncia disponible si el puerto pertenece al motor anterior', async () => {
  const fixture = await setup('sf3d');
  const service = createCakeReconstructionService({
    directory: fixture.directory,
    configuration: () => ({ provider: 'sf3d', sf3dUrl: 'http://127.0.0.1:8091', maxActive: 1 }),
    fetcher: (async () => Response.json({ status: 'ready', engine: 'triposr', weightsReady: true })) as typeof fetch,
  });
  assert.deepEqual(await service.availability(), { enabled: false, provider: 'sf3d' });
});

test('Hunyuan Mini conserva las etapas reales y reanuda el modelo privado sin otra conversión', async () => {
  const fixture = await setup('hunyuanmini');
  assert.deepEqual(await fixture.service.availability(), { enabled: true, provider: 'hunyuanmini' });
  const job = await fixture.service.create(photo, randomUUID());
  const submission = fixture.calls.find(call => call.url.endsWith('/send'))!;
  assert.equal(submission.url, 'http://127.0.0.1:8093/send');
  assert(!('Authorization' in (submission.init?.headers ?? {})));
  fixture.setStatus('LOADING');
  const loading = await fixture.service.get(job.token);
  assert.equal(loading.stage, 'preparing'); assert.equal(loading.progress, null);
  fixture.tick(); fixture.setStatus('BACKGROUND');
  assert.equal((await fixture.service.get(job.token)).stage, 'background');
  fixture.tick(); fixture.setStatus('TEXTURE');
  assert.equal((await fixture.service.get(job.token)).stage, 'texture');
  fixture.tick(); fixture.setStatus('SUCCEEDED');
  assert.equal((await fixture.restart().get(job.token)).status, 'SUCCEEDED');
  assert.deepEqual(await fixture.restart().model(job.token), validGlb());
  assert.equal(fixture.stats().submissions, 1);
});

test('Hunyuan Mini no usa un servicio de otro motor aunque sus pesos estén disponibles', async () => {
  const fixture = await setup('hunyuanmini');
  const service = createCakeReconstructionService({
    directory: fixture.directory,
    configuration: () => ({ provider: 'hunyuanmini', hunyuanMiniUrl: 'http://127.0.0.1:8093', maxActive: 1 }),
    fetcher: (async () => Response.json({ status: 'ready', engine: 'sf3d', weightsReady: true })) as typeof fetch,
  });
  assert.deepEqual(await service.availability(), { enabled: false, provider: 'hunyuanmini' });
});
test('rechaza redirecciones de modelos a redes privadas y GLB con recursos externos', async () => {
  const fixture = await setup(); const job = await fixture.service.create(photo, randomUUID()); fixture.setStatus('SUCCEEDED'); fixture.setUrl('https://127.0.0.1/model.glb');
  assert.equal((await fixture.service.get(job.token)).status, 'FAILED');
  assert.equal(fixture.calls.filter(call => call.url.includes('127.0.0.1')).length, 0);
  assert.throws(() => validateReconstructedGlb(validGlb('https://private.test/data.bin')));
  assert.throws(() => validateReconstructedGlb(Buffer.from('not a model')));
});
