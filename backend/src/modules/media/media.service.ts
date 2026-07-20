import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Op } from 'sequelize';
import { BuilderPreset, CustomizationOption, MediaAsset, Product } from '@database/models';
import { ApiError } from '@shared/errors/ApiError';

const MEDIA_DIR = path.resolve(process.cwd(), 'uploads', 'media');
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

export const resolveMediaFile = (filename: string): string => {
  if (!/^[a-f0-9-]+\.(webp|jpg|png)$/.test(filename)) {
    throw ApiError.notFound('Imagen no encontrada');
  }
  return path.join(MEDIA_DIR, filename);
};

export const mediaService = {
  async list(category?: string, includeDeleted = false) {
    const rows = await MediaAsset.findAll({
      where: category ? { category } : undefined,
      order: [['createdAt', 'DESC']],
      limit: 250,
      paranoid: !includeDeleted,
    });
    const urls = rows.map((row) => row.url);
    const [products, options, presets] = urls.length
      ? await Promise.all([
          Product.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
          CustomizationOption.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
          BuilderPreset.findAll({ where: { imageUrl: { [Op.in]: urls } }, attributes: ['id', 'imageUrl', 'name'] }),
        ])
      : [[], [], []];
    return rows.map((row) => ({
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
        options: options.filter((item) => item.imageUrl === row.url).map((item) => ({ id: item.id, name: item.name })),
        presets: presets.filter((item) => item.imageUrl === row.url).map((item) => ({ id: item.id, name: item.name })),
      },
    }));
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

    await mkdir(MEDIA_DIR, { recursive: true });
    const filename = `${randomUUID()}.${extension}`;
    await writeFile(path.join(MEDIA_DIR, filename), bytes, { flag: 'wx' });
    const url = `/api/v1/media/files/${filename}`;

    const asset = await MediaAsset.create({
      originalName: input.fileName.slice(0, 180),
      filename,
      mimeType: input.mimeType,
      sizeBytes: bytes.length,
      url,
      altText: input.altText?.trim() || null,
      category: input.category?.trim() || 'ingredients',
      createdBy: input.createdBy ?? null,
    });
    return { id: asset.id, url: asset.url, altText: asset.altText, category: asset.category };
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
