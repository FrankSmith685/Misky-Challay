import { randomBytes } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { Op } from 'sequelize';
import { z } from 'zod';
import { CakePreviewShare, CakeProductProfile, CakeTheme, CustomizationGroup, CustomizationOption, Product, ProductCustomizationGroup, ProductVariant } from '@database/models';
import type { CakePreviewSnapshot } from '@database/models/cakePreviewShare.model';
import { validate } from '@middlewares/validate.middleware';
import { ApiError } from '@shared/errors/ApiError';
import { created, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { cakeVisualDesignSchema } from './cakeVisualDesign';
import { decodeCakeOrderReference } from './cakeOrderReference';
import { cakeReconstructionService, referenceHash } from './cakeReconstruction.service';

const router = Router();
const positiveId = z.number().int().positive();
const visualFields = {
  visualDesign: cakeVisualDesignSchema.optional(),
  includeReferenceImage: z.boolean().default(false),
  referenceImageDataUrl: z.string().max(300_000).optional(),
};
const publicVisual = async (input: { visualDesign?: CakePreviewSnapshot['visualDesign']; includeReferenceImage: boolean; referenceImageDataUrl?: string }) => {
  if (input.includeReferenceImage) {
    if (!input.referenceImageDataUrl) throw ApiError.badRequest('Elige la imagen que deseas compartir');
    decodeCakeOrderReference(input.referenceImageDataUrl);
    if (input.visualDesign?.referenceMode !== 'print' && input.visualDesign?.reconstruction) {
      if (input.visualDesign.reconstruction.sourceHash !== referenceHash(input.referenceImageDataUrl)) throw ApiError.unprocessable('El modelo 3D corresponde a otra referencia. Espera la nueva conversión.');
      await cakeReconstructionService.retain(input.visualDesign.reconstruction.token, input.visualDesign.reconstruction.sourceHash);
    }
  }
  const { reconstruction, ...design } = input.visualDesign ?? {};
  return {
    ...(input.visualDesign ? { visualDesign: { ...design, ...(input.includeReferenceImage && input.visualDesign.referenceMode !== 'print' && reconstruction ? { reconstruction } : {}) } as NonNullable<CakePreviewSnapshot['visualDesign']> } : {}),
    ...(input.includeReferenceImage ? { referenceImageDataUrl: input.referenceImageDataUrl } : {}),
  };
};
const previewColor = z.enum(['Rosa', 'Celeste', 'Lila', 'Dorado', 'Plateado', 'Rojo', 'Azul', 'Verde', 'Blanco', 'Multicolor']);
const previewStyle = z.enum(['Elegante', 'Minimalista', 'Infantil', 'Divertido', 'Floral', 'Temático', 'Moderno']);
const createSchema = z.object({ body: z.object({
  source: z.enum(['CONFIGURATOR', 'DESIGN', 'FREEFORM']).default('CONFIGURATOR'),
  productId: positiveId,
  variantId: positiveId,
  requestedServings: z.number().int().min(1).max(500).optional(),
  themeId: positiveId.optional(),
  themeVersion: positiveId.optional(),
  selections: z.array(z.object({ optionId: positiveId, quantity: z.number().int().min(1).max(10) })).max(30),
  visualColors: z.array(previewColor).max(4).optional(),
  visualStyle: previewStyle.optional(),
  visualFlavor: z.string().trim().min(2).max(80).optional(),
  visualFilling: z.string().trim().min(2).max(80).optional(),
  ...visualFields,
}).refine((value) => !value.themeId || Boolean(value.themeVersion), 'Indica la versión del diseño') });
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

router.post('/', limiter, validate(createSchema), asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as z.infer<typeof createSchema>['body'];
  const visual = await publicVisual(input);
  const product = await Product.findByPk(input.productId);
  const profile = await CakeProductProfile.findByPk(input.productId);
  const variant = await ProductVariant.findOne({ where: { id: input.variantId, productId: input.productId, isActive: true } });
  if (!product || product.status !== 'ACTIVE' || product.family !== 'CAKE' || !profile?.isActive || !variant) {
    throw ApiError.notFound('La torta ya no está disponible');
  }

  const theme = input.themeId ? await CakeTheme.findByPk(input.themeId) : null;
  if (input.themeId && (!theme?.isActive || theme.productId !== product.id || theme.version !== input.themeVersion)) {
    throw ApiError.unprocessable('El diseño cambió. Actualiza la página antes de compartirlo.');
  }
  const themeRule = theme?.saleMode === 'CONFIGURED' ? theme.variantRulesJson.find((rule) => rule.variantId === variant.id) : null;
  if (theme?.saleMode === 'CONFIGURED' && !themeRule) throw ApiError.unprocessable('Esta presentación no pertenece al diseño');

  const bridge = await ProductCustomizationGroup.findAll({ where: {
    productId: product.id, isActive: true, [Op.or]: [{ variantId: null }, { variantId: variant.id }],
  } });
  const groupIds = bridge.map((entry) => entry.groupId).filter((groupId) => !themeRule?.hiddenGroupIds?.includes(groupId));
  const groups = await CustomizationGroup.findAll({ where: { id: { [Op.in]: groupIds }, isActive: true } });
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  const selectionIds = input.selections.map((entry) => entry.optionId);
  if (new Set(selectionIds).size !== selectionIds.length) throw ApiError.unprocessable('No repitas opciones');
  const options = selectionIds.length ? await CustomizationOption.findAll({ where: { id: { [Op.in]: selectionIds }, status: 'ACTIVE' } }) : [];
  const optionById = new Map(options.map((option) => [option.id, option]));
  const selected = input.selections.map((entry) => {
    const option = optionById.get(entry.optionId);
    if (!option || !groupNames.has(option.groupId) || themeRule?.excludedOptionIds.includes(option.id) || entry.quantity > option.maxPerItem) {
      throw ApiError.unprocessable('Una opción del diseño ya no está disponible');
    }
    return { groupName: groupNames.get(option.groupId)!, optionName: option.name, quantity: entry.quantity };
  });
  const snapshot: CakePreviewSnapshot = {
    ...visual,
    productId: product.id, productSlug: product.slug, productName: product.name,
    variantId: variant.id, variantName: variant.name,
    servings: input.requestedServings ?? (variant.servingSize ? Number(variant.servingSize) : null),
    diameterCm: input.requestedServings ? null : profile.customServingsJson?.sizeGuides?.find((guide) => guide.variantId === variant.id)?.diameterCm ?? null,
    themeName: theme?.name ?? null, themeSlug: theme?.slug ?? null,
    options: [...selected, ...(input.visualFlavor ? [{ groupName: 'Sabor del bizcocho', optionName: input.visualFlavor, quantity: 1 }] : []),
      ...(input.visualFilling ? [{ groupName: 'Relleno', optionName: input.visualFilling, quantity: 1 }] : []),
      ...(input.visualColors ?? []).map((color) => ({ groupName: 'Color de cobertura', optionName: color, quantity: 1 })),
      ...(input.visualStyle ? [{ groupName: 'Decoración', optionName: input.visualStyle, quantity: 1 }] : [])],
    ...(input.source === 'CONFIGURATOR' && !input.visualFlavor && !input.visualFilling && !input.visualColors?.length && !input.visualStyle && profile.saleMode === 'SEMI_CUSTOM' && theme?.saleMode !== 'QUOTE' ? {
      configuration: {
        selections: input.selections,
        ...(input.requestedServings ? { requestedServings: input.requestedServings } : {}),
        ...(theme ? { themeId: theme.id, themeVersion: theme.version } : {}),
      },
    } : {}),
  };
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const token = randomBytes(18).toString('base64url');
  await CakePreviewShare.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
  await CakePreviewShare.create({ token, snapshotJson: snapshot, expiresAt });
  res.setHeader('Cache-Control', 'no-store');
  return created(res, { token, expiresAt: expiresAt.toISOString() });
}));

router.post('/:token/copy', limiter, validate(z.object({
  params: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{24}$/) }),
  body: z.object(visualFields),
})), asyncHandler(async (req: Request, res: Response) => {
  const visual = await publicVisual(req.body);
  const original = await CakePreviewShare.findByPk(req.params.token);
  if (!original || original.expiresAt.getTime() <= Date.now()) throw ApiError.notFound('Este enlace de vista 3D venció o no existe');
  // A new token preserves the original recipient's view and its expiry.
  const base = { ...original.snapshotJson };
  delete base.referenceImageDataUrl;
  delete base.visualDesign;
  const token = randomBytes(18).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await CakePreviewShare.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });
  await CakePreviewShare.create({ token, snapshotJson: { ...base, ...visual }, expiresAt });
  res.setHeader('Cache-Control', 'no-store');
  return created(res, { token, expiresAt: expiresAt.toISOString() });
}));

router.get('/:token', validate(z.object({ params: z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{24}$/) }) })), asyncHandler(async (req: Request, res: Response) => {
  const share = await CakePreviewShare.findByPk(req.params.token);
  if (!share || share.expiresAt.getTime() <= Date.now()) throw ApiError.notFound('Este enlace de vista 3D venció o no existe');
  res.setHeader('Cache-Control', 'no-store');
  return ok(res, { snapshot: share.snapshotJson, expiresAt: share.expiresAt.toISOString() });
}));

export default router;
