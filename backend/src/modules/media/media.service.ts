import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { Op, type Order } from 'sequelize';
import { BuilderPreset, CustomizationOption, MediaAsset, Product } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';

const MEDIA_DIR = path.resolve(process.cwd(), 'uploads', 'media');
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const isPrivateAddress = (address: string): boolean => {
  const normalized = address.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7));
  if (isIP(normalized) !== 4) return false;
  const [a, b] = normalized.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168);
};

/** Evita que la importacion por URL pueda leer servicios privados del servidor. */
const assertPublicHttpsUrl = async (value: string): Promise<URL> => {
  let url: URL;
  try { url = new URL(value); } catch { throw ApiError.badRequest('Ingresa una URL de imagen valida'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw ApiError.badRequest('La imagen debe usar una URL HTTPS publica');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw ApiError.badRequest('No se permiten direcciones locales');
  }
  let addresses: string[];
  try {
    addresses = isIP(url.hostname)
      ? [url.hostname]
      : (await lookup(url.hostname, { all: true })).map((result) => result.address);
  } catch {
    throw ApiError.badRequest('No pudimos encontrar el servidor de esa imagen');
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) {
    throw ApiError.badRequest('La URL debe apuntar a un servidor publico');
  }
  return url;
};

const downloadRemoteImage = async (sourceUrl: string): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> => {
  let url = await assertPublicHttpsUrl(sourceUrl);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'image/webp,image/jpeg,image/png' },
      });
    } catch {
      throw ApiError.badRequest('No pudimos descargar la imagen desde esa URL');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw ApiError.badRequest('La URL tiene demasiadas redirecciones');
      url = await assertPublicHttpsUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.body) throw ApiError.badRequest('La URL no devolvio una imagen accesible');
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    if (!ALLOWED[mimeType]) throw ApiError.badRequest('La URL debe devolver una imagen WebP, JPG o PNG');
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_BYTES) throw ApiError.badRequest('La imagen debe pesar menos de 5 MB');

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let finished = false;
    while (!finished) {
      const { done, value } = await reader.read();
      if (done) {
        finished = true;
        continue;
      }
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw ApiError.badRequest('La imagen debe pesar menos de 5 MB');
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
    if (!hasImageSignature(bytes, mimeType)) {
      throw ApiError.badRequest('El contenido descargado no coincide con una imagen valida');
    }
    let urlName = path.posix.basename(url.pathname) || 'imagen-remota';
    try { urlName = decodeURIComponent(urlName); } catch { /* Conserva el nombre codificado si la URL es irregular. */ }
    return { bytes, mimeType, fileName: urlName.slice(0, 180) };
  }
  throw ApiError.badRequest('No pudimos importar la imagen');
};

/** El MIME declarado por el navegador no basta: comprobamos la firma real. */
const hasImageSignature = (bytes: Buffer, mimeType: string): boolean => {
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === 'image/webp') {
    return bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
};

export const resolveMediaFile = (filename: string): string => {
  if (!/^[a-f0-9-]+\.(webp|jpg|png)$/.test(filename)) {
    throw ApiError.notFound('Imagen no encontrada');
  }
  return path.join(MEDIA_DIR, filename);
};

/**
 * Orden del listado. `usage` NO esta aqui a proposito: los usos se calculan
 * cruzando tres tablas por url despues de la consulta, asi que no hay forma de
 * ordenar por ese criterio en SQL sin traerse la biblioteca entera. La pantalla
 * lo ofrece como reordenado de la pagina visible y lo dice en la etiqueta.
 */
export type MediaSort = 'recent' | 'name';

export interface MediaListOptions {
  category?: string;
  includeDeleted?: boolean;
  page?: number;
  limit?: number;
  /** Busca en el nombre original y en el texto alternativo. */
  search?: string;
  sort?: MediaSort;
}

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 100;

/** Un "%" o un "_" tecleados por el admin deben buscarse como caracter, no como comodin. */
const likeTerm = (value: string): string => `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * Listado PAGINADO de la biblioteca.
 *
 * Antes cortaba en 250 sin avisar y sin contar: con "Mostrar papelera" era peor,
 * porque `paranoid:false` hacia que los borrados consumieran del mismo cupo y el
 * contador de la pantalla mostraba un 250 enganoso. Ahora se devuelve `total`
 * real (el mismo `where`, con o sin papelera) para que la paginacion no mienta.
 */
const listAssets = async (options: MediaListOptions = {}) => {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(options.limit ?? DEFAULT_LIMIT)));
  const search = options.search?.trim();
  // Por nombre: las que aun no tienen texto alternativo caen primero (MySQL
  // ordena NULL antes en ASC), que son justo las que hay que describir.
  const order: Order = options.sort === 'name'
    ? [['altText', 'ASC'], ['originalName', 'ASC']]
    : [['createdAt', 'DESC']];

  const { rows, count } = await MediaAsset.findAndCountAll({
    where: {
      ...(options.category ? { category: options.category } : {}),
      ...(search
        ? {
            [Op.or]: [
              { originalName: { [Op.like]: likeTerm(search) } },
              { altText: { [Op.like]: likeTerm(search) } },
            ],
          }
        : {}),
    },
    order,
    limit,
    offset: (page - 1) * limit,
    paranoid: !options.includeDeleted,
  });
  const urls = rows.map((row) => row.url);
  // `usedOptions` y no `options`: el parametro de la funcion ya se llama asi.
  const [products, usedOptions, presets] = urls.length
    ? await Promise.all([
        Product.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
        CustomizationOption.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
        BuilderPreset.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
      ])
    : [[], [], []];
  const items = rows.map((row) => ({
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: row.url,
    altText: row.altText,
    category: row.category,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    usage: {
      products: products.filter((item) => item.imageUrl === row.url).map((item) => ({ id: item.id, name: item.name })),
      options: usedOptions.filter((item) => item.imageUrl === row.url).map((item) => ({ id: item.id, name: item.name })),
      presets: presets.filter((item) => item.imageUrl === row.url).map((item) => ({ id: item.id, name: item.name })),
    },
  }));
  return { items, total: count, page, limit };
};

export const mediaService = {
  /** Listado paginado con `total` real. Lo consume `GET /media` (media.routes.ts). */
  listPaged: listAssets,

  /**
   * Firma antigua: solo categoria y papelera, sin paginacion ni total. La
   * conserva el handler `list` de media.controller.ts, que ya no monta ninguna
   * ruta —el listado se resuelve en media.routes.ts porque necesita devolver
   * `meta`—. Se borra en cuanto ese handler desaparezca.
   */
  async list(category?: string, includeDeleted = false) {
    const { items } = await listAssets({ category, includeDeleted, limit: MAX_LIMIT });
    return items;
  },

  async upload(input: {
    fileName: string;
    mimeType: string;
    dataUrl: string;
    altText?: string | null;
    category?: string;
    createdBy?: number | null;
  }) {
    const extension = ALLOWED[input.mimeType];
    if (!extension) throw ApiError.badRequest('Usa una imagen WebP, JPG o PNG');

    const prefix = `data:${input.mimeType};base64,`;
    if (!input.dataUrl.startsWith(prefix)) throw ApiError.badRequest('El archivo no es una imagen valida');
    const bytes = Buffer.from(input.dataUrl.slice(prefix.length), 'base64');
    if (bytes.length === 0 || bytes.length > MAX_BYTES) {
      throw ApiError.badRequest('La imagen debe pesar menos de 5 MB');
    }
    if (!hasImageSignature(bytes, input.mimeType)) {
      throw ApiError.badRequest('El contenido del archivo no coincide con una imagen valida');
    }

    return mediaService.store({
      bytes,
      mimeType: input.mimeType,
      fileName: input.fileName,
      altText: input.altText,
      category: input.category,
      createdBy: input.createdBy,
    });
  },

  async importFromUrl(input: {
    sourceUrl: string;
    altText?: string | null;
    category?: string;
    createdBy?: number | null;
  }) {
    const remote = await downloadRemoteImage(input.sourceUrl);
    return mediaService.store({ ...remote, altText: input.altText, category: input.category, createdBy: input.createdBy });
  },

  async store(input: {
    bytes: Buffer;
    mimeType: string;
    fileName: string;
    altText?: string | null;
    category?: string;
    createdBy?: number | null;
  }) {
    const extension = ALLOWED[input.mimeType];
    if (!extension) throw ApiError.badRequest('Usa una imagen WebP, JPG o PNG');
    await mkdir(MEDIA_DIR, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(path.join(MEDIA_DIR, filename), input.bytes, { flag: 'wx' });
    const url = `/api/v1/media/files/${filename}`;

    const asset = await MediaAsset.create({
      originalName: input.fileName.slice(0, 180),
      filename,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.length,
      url,
      altText: input.altText?.trim() || null,
      category: input.category?.trim() || 'ingredients',
      createdBy: input.createdBy ?? null,
    });
    return { id: asset.id, url: asset.url, altText: asset.altText, category: asset.category };
  },

  /**
   * Una foto de perfil es dato personal, no un recurso de catálogo recuperable.
   * Al reemplazarla o quitarla se borra tanto la fila como el archivo físico.
   */
  async purgeOwnedProfile(url: string, userId: number) {
    const asset = await MediaAsset.findOne({
      where: { url, category: 'profile', createdBy: userId },
      paranoid: false,
    });
    if (!asset) return;
    await asset.destroy({ force: true });
    await unlink(path.join(MEDIA_DIR, asset.filename)).catch(() => undefined);
  },

  async update(id: number, input: { altText?: string | null; category?: string }) {
    const asset = await MediaAsset.findByPk(id);
    if (!asset) throw ApiError.notFound('Imagen no encontrada');
    if (input.altText !== undefined) asset.altText = input.altText?.trim() || null;
    if (input.category !== undefined) asset.category = input.category.trim();
    await asset.save();
    return { id: asset.id, url: asset.url, altText: asset.altText, category: asset.category };
  },

  async remove(id: number) {
    const asset = await MediaAsset.findByPk(id);
    if (!asset) throw ApiError.notFound('Imagen no encontrada');
    // Borrado logico: el archivo permanece recuperable y las referencias existentes no se rompen.
    await asset.destroy();
  },

  async restore(id: number) {
    const asset = await MediaAsset.findByPk(id, { paranoid: false });
    if (!asset) throw ApiError.notFound('Imagen no encontrada');
    if (asset.deletedAt) await asset.restore();
    return { id: asset.id, url: asset.url };
  },

  async replaceReferences(id: number, replacementId: number) {
    if (id === replacementId) throw ApiError.badRequest('Elige una imagen diferente');
    const [source, replacement] = await Promise.all([
      MediaAsset.findByPk(id, { paranoid: false }),
      MediaAsset.findByPk(replacementId),
    ]);
    if (!source || !replacement) throw ApiError.notFound('Alguna imagen no existe');
    const [products, options, presets] = await Promise.all([
      Product.update({ imageUrl: replacement.url }, { where: { imageUrl: source.url } }),
      CustomizationOption.update({ imageUrl: replacement.url }, { where: { imageUrl: source.url } }),
      BuilderPreset.update({ imageUrl: replacement.url }, { where: { imageUrl: source.url } }),
    ]);
    return { products: products[0], options: options[0], presets: presets[0], replacementUrl: replacement.url };
  },
};
