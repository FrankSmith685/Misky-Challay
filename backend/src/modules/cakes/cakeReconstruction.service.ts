import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@config/env';
import { ApiError } from '@shared/errors/ApiError';
import { decodeCakeOrderReference } from './cakeOrderReference';

export type ReconstructionProvider = 'meshy' | 'hunyuan' | 'triposr' | 'sf3d' | 'hunyuanmini';
export interface ReconstructionJob {
  token: string;
  sourceHash: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
  stage: 'queued' | 'preparing' | 'background' | 'shape' | 'texture' | 'download' | 'ready' | 'failed';
  progress: number | null;
  createdAt: string;
  expiresAt: string;
  error?: string;
}
interface StoredJob extends ReconstructionJob { provider: ReconstructionProvider; taskId: string | null; checkedAt: number }
interface Configuration { provider: 'disabled' | ReconstructionProvider; meshyKey?: string; hunyuanUrl?: string; hunyuanKey?: string; triposrUrl?: string; sf3dUrl?: string; hunyuanMiniUrl?: string; maxActive: number; hourlyLimit?: number }
const MAX_MODEL_BYTES = 40 * 1024 * 1024;
const RETENTION = 30 * 24 * 60 * 60 * 1000;
const GENERATION_TIMEOUT = 30 * 60 * 1000;
export const reconstructionToken = /^[A-Za-z0-9_-]{32}$/;
export const referenceHash = (source: string) => createHash('sha256').update(source).digest('hex');

const providerError = () => new ApiError(502, 'No se pudo completar la conversión de la foto a 3D. Puedes reanudar la consulta.', 'MODEL_PROVIDER_ERROR');
const limitedBody = async (response: globalThis.Response, limit: number): Promise<Buffer> => {
  if (!response.ok || !response.body) throw providerError();
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    if (Number(response.headers.get('content-length')) > limit) throw providerError();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw providerError();
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, size);
  } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
};

/** Only self-contained GLB files are served; loaders must never fetch a provider-supplied URI. */
export const validateReconstructedGlb = (bytes: Buffer) => {
  if (bytes.length < 24 || bytes.length > MAX_MODEL_BYTES || bytes.toString('ascii', 0, 4) !== 'glTF'
    || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a) throw providerError();
  const length = bytes.readUInt32LE(12);
  if (length < 2 || length > 4 * 1024 * 1024 || length + 20 > bytes.length) throw providerError();
  let json: unknown;
  try { json = JSON.parse(bytes.toString('utf8', 20, 20 + length)); } catch { throw providerError(); }
  const inspect = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'uri') throw providerError();
      inspect(child);
    }
  };
  inspect(json);
  const document = json as { asset?: { version?: string }; meshes?: unknown[]; extensionsRequired?: string[] };
  if (document.asset?.version !== '2.0' || !document.meshes?.length
    || document.extensionsRequired?.some((extension) => ['KHR_draco_mesh_compression', 'KHR_texture_basisu', 'EXT_meshopt_compression'].includes(extension))) throw providerError();
};

/** Persistent capability-addressed jobs. Polling resumes after a Node restart without starting another generation. */
export const createCakeReconstructionService = (options: { directory: string; configuration: () => Configuration; fetcher?: typeof fetch; now?: () => number }) => {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const pending = new Map<string, Promise<ReconstructionJob>>();
  const quotas = new Map<string, { used: number; resetAt: number }>();
  let creation = Promise.resolve();
  const file = (token: string, extension: 'json' | 'glb') => {
    if (!reconstructionToken.test(token)) throw ApiError.notFound('Modelo 3D no encontrado');
    return path.join(options.directory, `${token}.${extension}`);
  };
  const save = async (job: StoredJob) => {
    const destination = file(job.token, 'json');
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(job), { mode: 0o600 });
    await rename(temporary, destination);
  };
  const load = async (token: string): Promise<StoredJob> => {
    const location = file(token, 'json');
    let job: StoredJob;
    try { job = JSON.parse(await readFile(location, 'utf8')) as StoredJob; }
    catch { throw ApiError.notFound('El modelo 3D venció o no existe'); }
    if (new Date(job.expiresAt).getTime() <= now()) throw ApiError.notFound('El modelo 3D venció. Vuelve a convertir la foto.');
    return job;
  };
  const publicJob = ({ token, sourceHash, status, stage, progress, createdAt, expiresAt, error }: StoredJob): ReconstructionJob =>
    ({ token, sourceHash, status, stage, progress, createdAt, expiresAt, ...(error ? { error } : {}) });
  const json = async (url: string, init?: RequestInit, large = false): Promise<Record<string, unknown>> => {
    let response: globalThis.Response;
    try { response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(large ? 90_000 : 15_000) }); }
    catch { throw providerError(); }
    if (response.status === 429) throw ApiError.tooManyRequests('El motor 3D está ocupado. Reanuda la consulta en unos segundos.');
    const bytes = await limitedBody(response, large ? Math.ceil(MAX_MODEL_BYTES * 4 / 3) + 1024 : 128 * 1024);
    try { return JSON.parse(bytes.toString('utf8')) as Record<string, unknown>; } catch { throw providerError(); }
  };
  const gpuProvider = (configuration: Configuration, provider: ReconstructionProvider) => {
    const base = provider === 'triposr' ? configuration.triposrUrl : provider === 'sf3d' ? configuration.sf3dUrl : provider === 'hunyuanmini' ? configuration.hunyuanMiniUrl : configuration.hunyuanUrl;
    if (!base) throw providerError();
    return { base: base.replace(/\/$/, ''), headers: { 'Content-Type': 'application/json', ...(provider === 'hunyuan' && configuration.hunyuanKey ? { Authorization: `Bearer ${configuration.hunyuanKey}` } : {}) } };
  };
  const fail = async (job: StoredJob, message: string) => {
    job.status = 'FAILED'; job.stage = 'failed'; job.error = message; job.progress = null;
    await save(job); return publicJob(job);
  };
  const service = {
    capabilities() {
      const configuration = options.configuration();
      const enabled = configuration.provider === 'meshy' ? Boolean(configuration.meshyKey) : configuration.provider === 'hunyuan' ? Boolean(configuration.hunyuanUrl) : configuration.provider === 'sf3d' ? Boolean(configuration.sf3dUrl) : configuration.provider === 'hunyuanmini' ? Boolean(configuration.hunyuanMiniUrl) : configuration.provider === 'triposr' && Boolean(configuration.triposrUrl);
      return { enabled, provider: enabled ? configuration.provider : null };
    },
    async availability() {
      const configured = service.capabilities();
      if (!configured.enabled || !['triposr', 'sf3d', 'hunyuanmini'].includes(configured.provider ?? '')) return configured;
      const engine = configured.provider as 'triposr' | 'sf3d' | 'hunyuanmini';
      try {
        const provider = gpuProvider(options.configuration(), engine);
        const response = await fetcher(`${provider.base}/health`, { redirect: 'error', signal: AbortSignal.timeout(2000) });
        const health = JSON.parse((await limitedBody(response, 16_384)).toString('utf8')) as { status?: string; engine?: string; weightsReady?: boolean };
        return { enabled: health.status === 'ready' && health.engine === engine && health.weightsReady === true, provider: engine };
      } catch { return { enabled: false, provider: engine }; }
    },
    async create(source: string, requestId: string, clientId = 'shared'): Promise<ReconstructionJob> {
      decodeCakeOrderReference(source);
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw ApiError.badRequest('Identificador de conversión inválido');
      const token = createHash('sha256').update(requestId).digest('base64url').slice(0, 32);
      const hash = referenceHash(source);
      // Serialize creation so the global GPU limit and idempotency also cover concurrent requests.
      const prior = creation;
      let release!: () => void;
      creation = new Promise<void>((resolve) => { release = resolve; });
      await prior;
      try {
        await mkdir(options.directory, { recursive: true });
        try {
          const existing = await load(token);
          if (existing.sourceHash !== hash) throw ApiError.conflict('Esta conversión corresponde a otra imagen');
          return publicJob(existing);
        } catch (error) { if (!(error instanceof ApiError) || error.statusCode !== 404) throw error; }
        const configuration = options.configuration();
        if (!service.capabilities().enabled) throw new ApiError(503, 'La conversión de fotos a 3D todavía no está disponible en esta tienda. Puedes conservar tu referencia y continuar el pedido.', 'MODEL_GENERATION_NOT_CONFIGURED');
        // Existing requests return above, even if the client's hourly quota is full.
        // Failed submissions and a busy GPU do not consume a generation slot.
        for (const [key, value] of quotas) if (value.resetAt <= now()) quotas.delete(key);
        const hourlyLimit = configuration.hourlyLimit ?? 6;
        const quota = quotas.get(clientId);
        if (hourlyLimit > 0 && quota && quota.used >= hourlyLimit) {
          const retryAfterSeconds = Math.max(1, Math.ceil((quota.resetAt - now()) / 1000));
          throw new ApiError(429, `Alcanzaste las ${hourlyLimit} conversiones de esta hora. Tu foto está guardada; podrás volver a intentarlo cuando termine la espera.`, 'MODEL_QUOTA_EXCEEDED', { retryAfterSeconds });
        }
        let active = 0;
        for (const name of await readdir(options.directory)) {
          if (!/^[A-Za-z0-9_-]{32}\.json$/.test(name)) continue;
          const job = await load(name.slice(0, -5)).catch(() => null);
          if (!job) {
            await Promise.all(['json', 'glb'].map((extension) => unlink(file(name.slice(0, -5), extension as 'json' | 'glb')).catch(() => undefined)));
          } else if (['PENDING', 'IN_PROGRESS'].includes(job.status) && now() - new Date(job.createdAt).getTime() < GENERATION_TIMEOUT) active++;
        }
        if (active >= configuration.maxActive) throw ApiError.tooManyRequests('Las conversiones 3D están ocupadas. Inténtalo en unos minutos.');
        const job: StoredJob = { token, sourceHash: hash, provider: configuration.provider as ReconstructionProvider, taskId: null,
          status: 'PENDING', stage: 'queued', progress: null, createdAt: new Date(now()).toISOString(), expiresAt: new Date(now() + RETENTION).toISOString(), checkedAt: 0 };
        // Save before contacting a billable provider. An interrupted submission must never silently submit twice.
        await writeFile(file(token, 'json'), JSON.stringify(job), { flag: 'wx', mode: 0o600 });
        try {
          if (job.provider === 'meshy') {
            const data = await json('https://api.meshy.ai/openapi/v1/image-to-3d', { method: 'POST', headers: { Authorization: `Bearer ${configuration.meshyKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ image_url: source, ai_model: 'meshy-6', should_texture: true, enable_pbr: true, should_remesh: true, target_polycount: 30000, target_formats: ['glb'] }) });
            if (typeof data.result !== 'string') throw providerError();
            job.taskId = data.result;
          } else {
            const provider = gpuProvider(configuration, job.provider);
            const data = await json(`${provider.base}/send`, { method: 'POST', headers: provider.headers,
              body: JSON.stringify({ image: source.split(',')[1], texture: true, remove_background: true, type: 'glb', face_count: 30000 }) });
            if (typeof data.uid !== 'string') throw providerError();
            job.taskId = data.uid;
          }
          await save(job);
          if (hourlyLimit > 0) quotas.set(clientId, { used: (quota?.used ?? 0) + 1, resetAt: quota?.resetAt ?? now() + 60 * 60 * 1000 });
        } catch {
          return fail(job, 'No se pudo iniciar la conversión. Comprueba el servicio antes de volver a generar.');
        }
        return publicJob(job);
      } finally { release(); }
    },
    async get(token: string): Promise<ReconstructionJob> {
      if (pending.has(token)) return pending.get(token)!;
      const operation = (async () => {
        const job = await load(token);
        if (job.status === 'SUCCEEDED' || job.status === 'FAILED') return publicJob(job);
        if (now() - new Date(job.createdAt).getTime() >= GENERATION_TIMEOUT) return fail(job, 'La conversión superó el tiempo de espera. Puedes intentarlo otra vez.');
        if (!job.taskId) {
          if (now() - new Date(job.createdAt).getTime() > 60_000) return fail(job, 'La solicitud se interrumpió al iniciar. Revisa el servicio antes de generar otra vez.');
          return publicJob(job);
        }
        if (now() - job.checkedAt < 4_000) return publicJob(job);
        const configuration = options.configuration();
        let model: Buffer | null = null;
        if (job.provider === 'meshy') {
          const data = await json(`https://api.meshy.ai/openapi/v1/image-to-3d/${encodeURIComponent(job.taskId)}`, { headers: { Authorization: `Bearer ${configuration.meshyKey}` } });
          if (['FAILED', 'CANCELED'].includes(String(data.status))) return fail(job, 'El motor no pudo reconstruir esta foto. Prueba una foto nítida de una sola torta.');
          job.status = data.status === 'PENDING' ? 'PENDING' : 'IN_PROGRESS';
          job.progress = typeof data.progress === 'number' ? Math.min(99, Math.max(0, data.progress)) : null;
          job.stage = job.status === 'PENDING' ? 'queued' : (job.progress ?? 0) < 60 ? 'shape' : 'texture';
          if (data.status === 'SUCCEEDED') {
            const source = (data.model_urls as { glb?: unknown } | undefined)?.glb;
            if (typeof source !== 'string') return fail(job, 'El motor no devolvió un modelo GLB compatible.');
            const url = new URL(source);
            if (url.protocol !== 'https:' || url.hostname !== 'assets.meshy.ai' || url.username || url.password || (url.port && url.port !== '443')) return fail(job, 'El motor devolvió una dirección de modelo incompatible.');
            job.stage = 'download'; await save(job);
            model = await limitedBody(await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(90_000) }), MAX_MODEL_BYTES);
          }
        } else {
          const provider = gpuProvider(configuration, job.provider);
          const data = await json(`${provider.base}/status/${encodeURIComponent(job.taskId)}`, { headers: provider.headers }, true);
          if (data.status === 'error' || data.status === 'failed') return fail(job, 'El motor no pudo reconstruir esta foto. Prueba otra imagen.');
          job.status = 'IN_PROGRESS'; job.progress = null;
          job.stage = data.stage === 'loading' ? 'preparing' : data.stage === 'background' ? 'background' : data.stage === 'queued' ? 'queued' : data.status === 'texturing' ? 'texture' : 'shape';
          if (data.status === 'completed') {
            if (typeof data.model_base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.model_base64)) return fail(job, 'El motor devolvió un modelo incompatible.');
            model = Buffer.from(data.model_base64, 'base64');
          }
        }
        if (model) {
          try { validateReconstructedGlb(model); }
          catch { return fail(job, 'El modelo generado no es compatible con el visor. Prueba otra foto.'); }
          await writeFile(file(token, 'glb'), model, { mode: 0o600 });
          job.status = 'SUCCEEDED'; job.stage = 'ready'; job.progress = 100;
        }
        job.checkedAt = now(); await save(job); return publicJob(job);
      })();
      pending.set(token, operation);
      try { return await operation; } finally { pending.delete(token); }
    },
    async model(token: string): Promise<Buffer> {
      const job = await load(token);
      if (job.status !== 'SUCCEEDED') throw ApiError.conflict('El modelo 3D todavía no está listo');
      try { return await readFile(file(token, 'glb')); } catch { throw ApiError.notFound('El archivo 3D ya no está disponible'); }
    },
    async retain(token: string, hash: string): Promise<void> {
      const job = await load(token);
      if (job.status !== 'SUCCEEDED' || job.sourceHash !== hash) throw ApiError.unprocessable('El modelo 3D no corresponde a la imagen o todavía no está listo');
      job.expiresAt = new Date(Math.max(new Date(job.expiresAt).getTime(), now() + 8 * 24 * 60 * 60 * 1000)).toISOString();
      await save(job);
    },
  };
  return service;
};

export const cakeReconstructionService = createCakeReconstructionService({
  directory: path.resolve(__dirname, '../../../uploads/private-cake-3d'),
  configuration: () => ({ provider: env.CAKE_3D_PROVIDER, meshyKey: env.MESHY_API_KEY, hunyuanUrl: env.HUNYUAN_3D_URL, hunyuanKey: env.HUNYUAN_3D_API_KEY, triposrUrl: env.TRIPOSR_3D_URL, sf3dUrl: env.SF3D_3D_URL, hunyuanMiniUrl: env.HUNYUAN_MINI_3D_URL, maxActive: env.CAKE_3D_MAX_ACTIVE, hourlyLimit: env.CAKE_3D_HOURLY_LIMIT }),
});
