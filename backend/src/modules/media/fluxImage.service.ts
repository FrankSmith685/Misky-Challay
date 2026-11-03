import { env } from '@config/env';
import { ApiError } from '@shared/errors/ApiError';
import { decodeCakeOrderReference } from '@modules/cakes/cakeOrderReference';

const MODEL = '@cf/black-forest-labs/flux-1-schnell';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

const imageType = (bytes: Buffer): ImageMimeType | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
};

const readLimitedJson = async (response: Response): Promise<unknown> => {
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_RESPONSE_BYTES) throw new ApiError(502, 'Cloudflare devolvio una imagen demasiado grande', 'IMAGE_PROVIDER_ERROR');
  if (!response.body) throw new ApiError(502, 'Cloudflare no devolvio una imagen', 'IMAGE_PROVIDER_ERROR');

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ApiError(502, 'Cloudflare devolvio una imagen demasiado grande', 'IMAGE_PROVIDER_ERROR');
    }
    chunks.push(Buffer.from(value));
  }
  try {
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8')) as unknown;
  } catch {
    throw new ApiError(502, 'Cloudflare devolvio una respuesta invalida', 'IMAGE_PROVIDER_ERROR');
  }
};

export const fluxImageService = {
  isConfigured(): boolean {
    return Boolean(env.CLOUDFLARE_ACCOUNT_ID?.trim() && env.CLOUDFLARE_API_TOKEN?.trim());
  },

  async generateCakePreview(prompt: string, referenceDataUrl?: string): Promise<{ dataUrl: string; mimeType: ImageMimeType }> {
    if (!this.isConfigured()) throw new ApiError(503, 'La vista con IA no está configurada en este momento', 'IMAGE_GENERATION_NOT_CONFIGURED');
    const form = new FormData();
    form.append('prompt', prompt.trim());
    form.append('width', '768');
    form.append('height', '768');
    if (referenceDataUrl) {
      const reference = decodeCakeOrderReference(referenceDataUrl);
      const extension = reference.mime === 'image/png' ? 'png' : reference.mime === 'image/webp' ? 'webp' : 'jpg';
      form.append('input_image_0', new Blob([Uint8Array.from(reference.bytes)], { type: reference.mime }), `referencia.${extension}`);
    }
    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID!)}/ai/run/@cf/black-forest-labs/flux-2-klein-4b`;
    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, body: form, signal: AbortSignal.timeout(60_000) });
    } catch { throw new ApiError(502, 'No pudimos conectar con el generador de imágenes', 'IMAGE_PROVIDER_ERROR'); }
    if (response.status === 429) throw ApiError.tooManyRequests('El generador alcanzó su límite. Inténtalo más tarde');
    if (!response.ok) throw new ApiError(502, 'No se pudo generar la vista. Inténtalo de nuevo', 'IMAGE_PROVIDER_ERROR');
    const payload = await readLimitedJson(response) as { success?: boolean; result?: { image?: unknown } };
    const base64 = payload?.result?.image;
    if (payload?.success !== true || typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) throw new ApiError(502, 'El generador no devolvió una imagen válida', 'IMAGE_PROVIDER_ERROR');
    const bytes = Buffer.from(base64, 'base64');
    const mimeType = imageType(bytes);
    if (!mimeType || bytes.length > MAX_IMAGE_BYTES) throw new ApiError(502, 'El generador devolvió un formato incompatible', 'IMAGE_PROVIDER_ERROR');
    return { dataUrl: `data:${mimeType};base64,${base64}`, mimeType };
  },

  async generate(prompt: string): Promise<{ dataUrl: string; mimeType: ImageMimeType }> {
    if (!this.isConfigured()) {
      throw new ApiError(503, 'Configura CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN en el servidor para generar imagenes', 'IMAGE_GENERATION_NOT_CONFIGURED');
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID!)}/ai/run/${MODEL}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: prompt.trim(), steps: 4 }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new ApiError(502, 'No pudimos conectar con Cloudflare. Intentalo de nuevo', 'IMAGE_PROVIDER_ERROR');
    }

    if (response.status === 429) throw ApiError.tooManyRequests('Cloudflare alcanzo su limite de generacion. Intentalo mas tarde');
    if (response.status === 401 || response.status === 403) {
      throw new ApiError(502, 'Cloudflare rechazo las credenciales de Workers AI. Revisa el token y los permisos del servidor', 'IMAGE_PROVIDER_ERROR');
    }
    if (!response.ok) throw new ApiError(502, 'Cloudflare no pudo generar la imagen. Intentalo de nuevo', 'IMAGE_PROVIDER_ERROR');

    let payload: { success?: unknown; result?: { image?: unknown } };
    try {
      payload = await readLimitedJson(response) as typeof payload;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, 'Se interrumpio la descarga de la imagen generada', 'IMAGE_PROVIDER_ERROR');
    }
    const base64 = payload?.result?.image;
    if (payload?.success !== true || typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 4) {
      throw new ApiError(502, 'Cloudflare no devolvio una imagen valida', 'IMAGE_PROVIDER_ERROR');
    }
    const bytes = Buffer.from(base64, 'base64');
    const mimeType = imageType(bytes);
    if (!mimeType || bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
      throw new ApiError(502, 'La imagen generada no es compatible o supera 5 MB', 'IMAGE_PROVIDER_ERROR');
    }
    return { dataUrl: `data:${mimeType};base64,${base64}`, mimeType };
  },
};
