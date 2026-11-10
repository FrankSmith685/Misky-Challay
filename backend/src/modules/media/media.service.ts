import { createHash, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import path from 'node:path';
import { Op, type Order } from 'sequelize';
import { BuilderPreset, CakeTheme, Category, CustomizationOption, InventoryItem, MediaAsset, Product, sequelize } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';

const MEDIA_DIR = path.resolve(process.cwd(), 'uploads', 'media');
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
export const MEDIA_CATEGORIES = ['ingredients', 'products', 'categories', 'builder-presets', 'marketing', 'profile'] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];
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

const imageDimensions = (bytes: Buffer, mimeType: string): { width: number; height: number } | null => {
  if (mimeType === 'image/png' && bytes.length >= 24) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mimeType === 'image/webp' && bytes.length >= 30 && bytes.subarray(12, 16).toString('ascii') === 'VP8X') {
    return {
      width: 1 + bytes.readUIntLE(24, 3),
      height: 1 + bytes.readUIntLE(27, 3),
    };
  }
  if (mimeType === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > bytes.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += length + 2;
    }
  }
  return null;
};

const assertCategory = (value: string | undefined | null): MediaCategory => {
  const category = value?.trim() || 'ingredients';
  if (!(MEDIA_CATEGORIES as readonly string[]).includes(category)) throw ApiError.badRequest('La categoría de medios no es válida');
  return category as MediaCategory;
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
  reviewStatus?: 'APPROVED' | 'DRAFT' | 'ARCHIVED';
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
      ...(options.reviewStatus ? { reviewStatus: options.reviewStatus } : {}),
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
  const [products, usedOptions, presets, inventoryItems, categories, themes] = urls.length
    ? await Promise.all([
        Product.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
        CustomizationOption.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
        BuilderPreset.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
        InventoryItem.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
        Category.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
        CakeTheme.findAll({ attributes: ['id', 'name', 'imageUrlsJson'] }),
      ])
    : [[], [], [], [], [], []];
  const items = rows.map((row) => ({
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    url: row.url,
    altText: row.altText,
    category: row.category,
    sha256: row.sha256,
    width: row.width,
    height: row.height,
    reviewStatus: row.reviewStatus,
    sourceType: row.sourceType,
    sourcePrompt: row.sourcePrompt,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    usage: {
      products: products.filter((item) => item.imageUrl === row.url).map((item) => ({ id: item.id, name: item.name })),
      options: usedOptions.filter((item) => item.imageUrl === row.url).map((item) => ({ id: item.id, name: item.name })),
      presets: presets.filter((item) => item.imageUrl === row.url).map((item) => ({ id: item.id, name: item.name })),
      inventoryItems: inventoryItems.filter((item) => item.imageUrl === row.url).map((item) => ({ id: item.id, name: item.name })),
      categories: categories.filter((item) => item.imageUrl === row.url).map((item) => ({ id: item.id, name: item.name })),
      themes: themes.filter((item) => item.imageUrlsJson.includes(row.url)).map((item) => ({ id: item.id, name: item.name })),
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
    sourceType?: 'UPLOAD' | 'AI' | 'PROFILE';
    sourcePrompt?: string | null;
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
      sourceType: input.sourceType ?? 'UPLOAD',
      sourcePrompt: input.sourcePrompt ?? null,
    });
  },

  async importFromUrl(input: {
    sourceUrl: string;
    altText?: string | null;
    category?: string;
    createdBy?: number | null;
    sourcePrompt?: string | null;
  }) {
    const remote = await downloadRemoteImage(input.sourceUrl);
    return mediaService.store({ ...remote, altText: input.altText, category: input.category, createdBy: input.createdBy, sourceType: 'URL', sourcePrompt: input.sourcePrompt ?? null });
  },

  async store(input: {
    bytes: Buffer;
    mimeType: string;
    fileName: string;
    altText?: string | null;
    category?: string;
    createdBy?: number | null;
    reviewStatus?: 'APPROVED' | 'DRAFT' | 'ARCHIVED';
    sourceType?: 'UPLOAD' | 'URL' | 'AI' | 'PROFILE';
    sourcePrompt?: string | null;
  }) {
    const extension = ALLOWED[input.mimeType];
    if (!extension) throw ApiError.badRequest('Usa una imagen WebP, JPG o PNG');
    const category = assertCategory(input.category);
    const dimensions = imageDimensions(input.bytes, input.mimeType);
    if (dimensions && dimensions.width * dimensions.height > MAX_PIXELS) {
      throw ApiError.badRequest('La imagen tiene demasiados píxeles para procesarla con seguridad');
    }
    const sha256 = createHash('sha256').update(input.bytes).digest('hex');
    const duplicate = await MediaAsset.findOne({ where: { sha256 }, paranoid: false });
    if (duplicate) {
      if (duplicate.deletedAt) await duplicate.restore();
      if (!duplicate.altText && input.altText?.trim()) await duplicate.update({ altText: input.altText.trim() });
      return { id: duplicate.id, url: duplicate.url, altText: duplicate.altText, category: duplicate.category, duplicate: true };
    }
    await mkdir(MEDIA_DIR, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    const filePath = path.join(MEDIA_DIR, filename);
    await writeFile(filePath, input.bytes, { flag: 'wx' });
    const url = `/api/v1/media/files/${filename}`;
    let asset: MediaAsset;
    try {
      asset = await MediaAsset.create({
        originalName: input.fileName.slice(0, 180),
        filename,
        mimeType: input.mimeType,
        sizeBytes: input.bytes.length,
        url,
        altText: input.altText?.trim() || null,
        category,
        createdBy: input.createdBy ?? null,
        sha256,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        reviewStatus: input.reviewStatus ?? (input.sourceType === 'AI' ? 'DRAFT' : 'APPROVED'),
        sourceType: input.sourceType ?? 'UPLOAD',
        sourcePrompt: input.sourcePrompt?.trim() || null,
      });
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      throw error;
    }
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

  async update(id: number, input: { altText?: string | null; category?: string; reviewStatus?: 'APPROVED' | 'DRAFT' | 'ARCHIVED' }) {
    const asset = await MediaAsset.findByPk(id);
    if (!asset) throw ApiError.notFound('Imagen no encontrada');
    if (input.altText !== undefined) asset.altText = input.altText?.trim() || null;
    if (input.category !== undefined) asset.category = assertCategory(input.category);
    if (input.reviewStatus !== undefined) asset.reviewStatus = input.reviewStatus;
    await asset.save();
    return { id: asset.id, url: asset.url, altText: asset.altText, category: asset.category, reviewStatus: asset.reviewStatus };
  },

  async setReviewStatus(id: number, reviewStatus: 'APPROVED' | 'DRAFT' | 'ARCHIVED') {
    const asset = await MediaAsset.findByPk(id);
    if (!asset) throw ApiError.notFound('Imagen no encontrada');
    await asset.update({ reviewStatus });
    return { id: asset.id, reviewStatus: asset.reviewStatus };
  },

  async health() {
    const assets = await MediaAsset.findAll({ paranoid: false, order: [['createdAt', 'DESC']] });
    const urls = assets.map((asset) => asset.url);
    const [products, options, presets, inventoryItems, categories, themes, files] = await Promise.all([
      urls.length ? Product.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['imageUrl'] }) : [],
      urls.length ? CustomizationOption.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['imageUrl'] }) : [],
      urls.length ? BuilderPreset.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['imageUrl'] }) : [],
      urls.length ? InventoryItem.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['imageUrl'] }) : [],
      urls.length ? Category.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['imageUrl'] }) : [],
      urls.length ? CakeTheme.findAll({ attributes: ['imageUrlsJson'] }) : [],
      readdir(MEDIA_DIR).catch(() => [] as string[]),
    ]);
    const referenced = new Set<string>([
      ...products.map((row) => row.imageUrl).filter((url): url is string => Boolean(url)),
      ...options.map((row) => row.imageUrl).filter((url): url is string => Boolean(url)),
      ...presets.map((row) => row.imageUrl).filter((url): url is string => Boolean(url)),
      ...inventoryItems.map((row) => row.imageUrl).filter((url): url is string => Boolean(url)),
      ...categories.map((row) => row.imageUrl).filter((url): url is string => Boolean(url)),
      ...themes.flatMap((row) => row.imageUrlsJson),
    ]);
    const byHash = new Map<string, number[]>();
    for (const asset of assets) if (asset.sha256) byHash.set(asset.sha256, [...(byHash.get(asset.sha256) ?? []), asset.id]);
    const duplicateGroups = [...byHash.entries()].filter(([, ids]) => ids.length > 1).map(([sha256, ids]) => ({ sha256, ids }));
    const knownFiles = new Set(assets.map((asset) => asset.filename));
    const missingFiles = assets.filter((asset) => !files.includes(asset.filename)).map((asset) => ({ id: asset.id, filename: asset.filename }));
    const orphanFiles = files.filter((filename) => !knownFiles.has(filename));
    const withoutAlt = assets.filter((asset) => !asset.deletedAt && asset.category !== 'profile' && !asset.altText?.trim()).map((asset) => asset.id);
    const unused = assets.filter((asset) => !asset.deletedAt && !referenced.has(asset.url)).map((asset) => asset.id);
    return {
      totals: { all: assets.length, active: assets.filter((asset) => !asset.deletedAt).length, drafts: assets.filter((asset) => asset.reviewStatus === 'DRAFT').length, archived: assets.filter((asset) => asset.reviewStatus === 'ARCHIVED').length },
      withoutAlt: { count: withoutAlt.length, ids: withoutAlt.slice(0, 50) },
      unused: { count: unused.length, ids: unused.slice(0, 50) },
      duplicateGroups: duplicateGroups.slice(0, 50),
      missingFiles: missingFiles.slice(0, 50),
      orphanFiles: orphanFiles.slice(0, 50),
      checkedAt: new Date().toISOString(),
    };
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
    return sequelize.transaction(async (transaction) => {
      const [products, options, presets, inventoryItems, categories] = await Promise.all([
        Product.update({ imageUrl: replacement.url }, { where: { imageUrl: source.url }, transaction }),
        CustomizationOption.update({ imageUrl: replacement.url }, { where: { imageUrl: source.url }, transaction }),
        BuilderPreset.update({ imageUrl: replacement.url }, { where: { imageUrl: source.url }, transaction }),
        InventoryItem.update({ imageUrl: replacement.url }, { where: { imageUrl: source.url }, transaction }),
        Category.update({ imageUrl: replacement.url }, { where: { imageUrl: source.url }, transaction }),
      ]);
      let themes = 0;
      const designs = await CakeTheme.findAll({ transaction, lock: transaction.LOCK.UPDATE });
      for (const design of designs) {
        if (!design.imageUrlsJson.includes(source.url)) continue;
        await design.update({ imageUrlsJson: [...new Set(design.imageUrlsJson.map((url) => url === source.url ? replacement.url : url))], version: design.version + 1 }, { transaction });
        themes += 1;
      }
      return { products: products[0], options: options[0], presets: presets[0], inventoryItems: inventoryItems[0], categories: categories[0], themes, replacementUrl: replacement.url };
    });
  },
};
