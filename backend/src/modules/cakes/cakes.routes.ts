import { Router, type Request, type Response } from 'express';
import { User } from '@database/models';
import { staffAudienceService } from '@modules/notifications/staffAudience.service';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { cakeVisualDesignSchema } from './cakeVisualDesign';
import { cakeOrderImagesService } from './cakeOrderImages.service';
import { Op } from 'sequelize';
import { Allergen, CakeProductProfile, CakeStationCapacity, Category, CustomizationGroup, CustomizationOption, InventoryItem, Product, ProductDietaryTag, ProductCustomizationGroup, ProductVariant, Recipe, RecipeItem, Order, OrderItem, OrderItemCustomization, CakeProductionTask, sequelize } from '@database/models';
import { PRODUCT_STATUS } from '@database/models/product.model';
import { CAKE_STATIONS } from '@database/models/cakeProduction.model';
import { PERMISSIONS } from '@config/constants';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { ApiError } from '@shared/errors/ApiError';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ok, created } from '@shared/http/ApiResponse';
import { assertBranchScope, resolveBranchId } from '@shared/utils/scope';
import { audit } from '@shared/utils/audit';
import { cakeProductionService, dayInLima } from './cakeProduction.service';
import { cakeDesignService } from './cakeDesign.service';
import { cakeCategoryService } from './cakeCategory.service';
import { validateCakeSizeGuides } from './cakeSizeGuides';
import { refreshCakeAllergens } from '@modules/catalog/cakeAllergens.service';
import { fluxImageService } from '@modules/media/fluxImage.service';
import cakeReconstructionRoutes from './cakeReconstruction.routes';
import { env } from '@config/env';
import { cakeVisualPreviewSchema, cakeVisualPreviewService } from './cakeVisualPreview';

const router = Router();
router.use('/reconstructions', cakeReconstructionRoutes);
const id = z.coerce.number().int().positive();
const selection = z.object({ optionId: id, quantity: z.coerce.number().int().min(1).max(10) });
const effort = z.record(z.enum(CAKE_STATIONS), z.coerce.number().int().min(0).max(1440));
const date = z.coerce.date();
const previewLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: env.CAKE_PREVIEW_MAX_PER_HOUR, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message: 'Alcanzaste el límite temporal de imágenes con IA. La vista ilustrativa sigue actualizándose con tus elecciones.', code: 'TOO_MANY_REQUESTS' } });
const newCakeGroup = z.object({
  name: z.string().trim().min(2).max(80),
  selectionType: z.enum(['SINGLE', 'MULTIPLE']),
  maxSelection: z.coerce.number().int().min(1).max(10),
  options: z.array(z.object({
    name: z.string().trim().min(2).max(80),
    priceDelta: z.coerce.number().min(0).max(100000),
    inventoryItemId: id.nullable(),
    consumptionQuantity: z.coerce.number().min(0).max(100000),
  }).refine((option) => option.inventoryItemId === null || option.consumptionQuantity > 0, 'Indica cuánto insumo consume la opción')).min(1).max(20),
}).refine((group) => group.maxSelection <= group.options.length, 'El máximo no puede superar las opciones')
  .refine((group) => group.selectionType !== 'SINGLE' || group.maxSelection === 1, 'Elige una sola opción para este grupo')
  .refine((group) => new Set(group.options.map((option) => option.name.toLocaleLowerCase('es-PE'))).size === group.options.length, 'No repitas opciones dentro del grupo');

router.get('/products/:productId/profile', validate(z.object({ params: z.object({ productId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  const profile = await CakeProductProfile.findByPk(Number(req.params.productId));
  if (!profile?.isActive) throw ApiError.notFound('Perfil de torta no encontrado');
  return ok(res, profile);
}));

router.post('/availability', validate(z.object({ body: z.object({
  branchId: id, deliveryAt: date,
  items: z.array(z.object({ productId: id, variantId: id, quantity: z.coerce.number().int().min(1).max(20), requestedServings: z.coerce.number().int().min(1).max(500).optional(), selections: z.array(selection).max(30).default([]), designQuoteId: id.optional(), themeId: id.optional(), themeVersion: id.optional() })).min(1).max(30),
}) })), asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await cakeProductionService.availability(req.body.branchId, req.body.items, new Date(req.body.deliveryAt)));
}));

router.get('/visual-preview/capabilities', asyncHandler(async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  return ok(res, { enabled: fluxImageService.isConfigured(), maxPerHour: env.CAKE_PREVIEW_MAX_PER_HOUR });
}));

router.post('/visual-preview', validate(z.object({ body: cakeVisualPreviewSchema })), previewLimiter, asyncHandler(async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'private, no-store');
  return ok(res, await cakeVisualPreviewService.generate(req.body));
}));

router.use(authenticate);

router.get('/orders/:orderNumber/items/:itemId/reference', validate(z.object({ params: z.object({ orderNumber: z.string().max(40), itemId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  const reference = await cakeOrderImagesService.read(req.params.orderNumber, Number(req.params.itemId), req.user!);
  res.setHeader('Content-Type', reference.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(reference.bytes);
}));

router.get('/orders/:orderNumber/items/:itemId/images/:imageId', validate(z.object({ params: z.object({ orderNumber: z.string().max(40), itemId: id, imageId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  const image = await cakeOrderImagesService.read(req.params.orderNumber, Number(req.params.itemId), req.user!, Number(req.params.imageId));
  res.setHeader('Content-Type', image.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(image.bytes);
}));

router.get('/products/:productId/custom-servings', requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE), validate(z.object({ params: z.object({ productId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  const profile = await CakeProductProfile.findByPk(Number(req.params.productId));
  if (!profile) throw ApiError.notFound('Perfil de torta no encontrado');
  return ok(res, profile.customServingsJson);
}));

router.get('/available-groups', requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), asyncHandler(async (_req: Request, res: Response) => {
  const groups = await CustomizationGroup.findAll({
    where: { isActive: true }, attributes: ['id', 'name', 'code'],
    include: [{ model: CustomizationOption, as: 'options', attributes: ['id', 'name'], where: { status: 'ACTIVE' }, required: true }],
    order: [['name', 'ASC']],
  });
  return ok(res, groups.map((group) => ({
    id: group.id, name: group.name, code: group.code,
    options: (group.options ?? []).map((option) => ({ id: option.id, name: option.name })),
  })));
}));

router.get('/creation-setup', requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE, PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), asyncHandler(async (_req: Request, res: Response) => {
  const [categories, allergenOptionCount] = await Promise.all([cakeCategoryService.listActive(), Allergen.count()]);
  return ok(res, { categories, allergenOptionCount });
}));

/** Alta completa en borrador: producto, presentacion, perfil y receta en una transaccion. */
router.post('/configuration', requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE, PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({ body: z.object({
  existingProductId: id.optional(), name: z.string().trim().min(3).max(120), categoryId: id, description: z.string().trim().max(2000).default(''),
  imageUrl: z.string().max(255).refine((value) => value.startsWith('/') || /^https?:\/\//i.test(value), 'Usa una imagen de la biblioteca o una URL http(s)').nullable().optional(),
  imageAlt: z.string().trim().max(180).nullable().optional(),
  saleMode: z.enum(['STANDARD', 'SEMI_CUSTOM', 'ADVANCED']), minLeadHours: z.coerce.number().int().min(0).max(720),
  variantName: z.string().trim().min(1).max(80), servings: z.coerce.number().int().min(1).max(500),
  basePrice: z.coerce.number().positive().max(100000),
  yieldQuantity: z.coerce.number().int().min(1).max(1000),
  groupIds: z.array(id).max(20).default([]),
  newGroups: z.array(newCakeGroup).max(5).default([]),
  effort: effort.refine((value) => Object.values(value).some((minutes) => minutes > 0), 'Indica tiempo de produccion'),
  items: z.array(z.object({ inventoryItemId: id, quantity: z.coerce.number().positive().max(100000), wastePercent: z.coerce.number().min(0).max(100).default(0) })).min(1).max(100),
}).refine((body) => new Set(body.items.map((item) => item.inventoryItemId)).size === body.items.length, 'No repitas insumos')
  .refine((body) => body.saleMode !== 'SEMI_CUSTOM' || body.groupIds.length + body.newGroups.length > 0, 'Una torta personalizable necesita opciones')
  .refine((body) => body.saleMode === 'SEMI_CUSTOM' || body.groupIds.length + body.newGroups.length === 0, 'Los grupos de opciones solo corresponden a tortas personalizables')
  .refine((body) => new Set(body.newGroups.map((group) => group.name.toLocaleLowerCase('es-PE'))).size === body.newGroups.length, 'No repitas nombres de grupos')
  .refine((body) => new Set(body.groupIds).size === body.groupIds.length, 'No repitas grupos') })), asyncHandler(async (req: Request, res: Response) => {
  const input = req.body;
  const category = await cakeCategoryService.requireActive(input.categoryId);
  const slug = input.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 110);
  // La tienda tiene un único configurador de tortas personalizables. Antes de
  // crear otro producto, comprueba también los perfiles ya configurados: el
  // nombre puede cambiar, por lo que la validación por slug no es suficiente.
  if (input.saleMode === 'SEMI_CUSTOM' || input.saleMode === 'ADVANCED') {
    const existingCustomProfile = await CakeProductProfile.findOne({
      where: { saleMode: { [Op.in]: ['SEMI_CUSTOM', 'ADVANCED'] } },
      order: [['productId', 'ASC']],
    });
    if (existingCustomProfile) {
      const existingCustomProduct = await Product.findByPk(existingCustomProfile.productId, {
        attributes: ['id', 'name', 'status'],
      });
      if (existingCustomProduct) {
        throw ApiError.conflict(`Ya existe la torta personalizable «${existingCustomProduct.name}». Edita ese producto desde Producción de tortas o Catálogo antes de crear otro.`);
      }
    }
  }
  const sameSlug = !input.existingProductId && slug ? await Product.findOne({ where: { slug } }) : null;
  if (!slug || sameSlug) throw ApiError.conflict('Ya existe una torta con ese nombre');
  const inventoryIds = [...new Set([
    ...input.items.map((line: { inventoryItemId: number }) => line.inventoryItemId),
    ...input.newGroups.flatMap((group: z.infer<typeof newCakeGroup>) => group.options.map((option) => option.inventoryItemId).filter((itemId): itemId is number => itemId !== null)),
  ])];
  if (await InventoryItem.count({ where: { id: { [Op.in]: inventoryIds }, isActive: true } }) !== inventoryIds.length) throw ApiError.unprocessable('Selecciona insumos activos');
  if (input.groupIds.length && await CustomizationGroup.count({ where: { id: { [Op.in]: input.groupIds }, isActive: true } }) !== input.groupIds.length) throw ApiError.unprocessable('Selecciona grupos activos');
  for (const groupId of input.groupIds) {
    if (!await CustomizationOption.count({ where: { groupId, status: 'ACTIVE' } })) throw ApiError.unprocessable('Cada grupo existente necesita al menos una opción activa');
  }
  const result = await sequelize.transaction(async (transaction) => {
    let product: Product;
    let variant: ProductVariant;
    if (input.existingProductId) {
      const existing = await Product.findByPk(input.existingProductId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!existing || existing.status !== PRODUCT_STATUS.DRAFT) throw ApiError.unprocessable('El producto debe seguir en borrador para configurarlo como torta');
      if (await CakeProductProfile.findByPk(existing.id, { transaction })) throw ApiError.conflict('Este producto ya tiene un perfil de torta');
      const variants = await ProductVariant.findAll({ where: { productId: existing.id }, transaction });
      if (variants.length !== 1 || await Recipe.count({ where: { productId: existing.id }, transaction })
        || await ProductCustomizationGroup.count({ where: { productId: existing.id }, transaction })) {
        throw ApiError.unprocessable('Para completar desde este asistente, el producto debe tener una sola presentacion y ninguna receta u opcion anterior');
      }
      product = existing;
      product.categoryId = category.id;
      product.type = input.saleMode === 'STANDARD' ? 'FIXED' : 'CUSTOMIZABLE';
      product.name = input.name;
      product.description = input.description;
      if (input.imageUrl !== undefined) {
        product.imageUrl = input.imageUrl;
        product.imageAlt = input.imageUrl ? input.imageAlt ?? input.name : null;
      }
      product.allergensReviewedAt = null;
      await product.save({ transaction });
      variant = variants[0];
      variant.name = input.variantName;
      variant.basePrice = input.basePrice;
      variant.servingSize = input.servings;
      variant.servingUnit = 'porciones';
      variant.isDefault = true;
      variant.isActive = true;
      await variant.save({ transaction });
      await ProductDietaryTag.destroy({ where: { productId: product.id }, transaction });
    } else {
      product = await Product.create({ categoryId: category.id, type: input.saleMode === 'STANDARD' ? 'FIXED' : 'CUSTOMIZABLE', name: input.name, slug, description: input.description, imageUrl: input.imageUrl ?? null, imageAlt: input.imageUrl ? input.imageAlt ?? input.name : null, status: PRODUCT_STATUS.DRAFT }, { transaction });
      variant = await ProductVariant.create({ productId: product.id, name: input.variantName, sku: `CAKE-${product.id}-1`, basePrice: input.basePrice, servingSize: input.servings, servingUnit: 'porciones', isDefault: true, productionMinutesJson: {} }, { transaction });
    }
    await CakeProductProfile.create({ productId: product.id, saleMode: input.saleMode, minLeadHours: input.minLeadHours, baseEffortJson: input.effort, stationOffsetsJson: {}, isActive: true }, { transaction });
    if (input.groupIds.length) await ProductCustomizationGroup.bulkCreate(input.groupIds.map((groupId: number, sortOrder: number) => ({ productId: product.id, groupId, sortOrder })), { transaction });
    for (const [index, draft] of (input.newGroups as Array<z.infer<typeof newCakeGroup>>).entries()) {
      const group = await CustomizationGroup.create({
        code: `cake_${product.id}_${index + 1}`, name: draft.name, selectionType: draft.selectionType,
        minSelection: 1, maxSelection: draft.maxSelection, freeQuantity: 0, sortOrder: input.groupIds.length + index,
      }, { transaction });
      await ProductCustomizationGroup.create({ productId: product.id, groupId: group.id, variantId: null, sortOrder: input.groupIds.length + index }, { transaction });
      await CustomizationOption.bulkCreate(draft.options.map((option, optionIndex) => ({
        groupId: group.id, name: option.name, priceDelta: option.priceDelta,
        inventoryItemId: option.inventoryItemId, consumptionQuantity: option.inventoryItemId === null ? 0 : option.consumptionQuantity,
        sortOrder: optionIndex,
      })), { transaction });
    }
    const recipe = await Recipe.create({ productId: product.id, variantId: variant.id, yieldQuantity: input.yieldQuantity, isActive: true }, { transaction });
    await RecipeItem.bulkCreate(input.items.map((line: { inventoryItemId: number; quantity: number; wastePercent: number }) => ({ recipeId: recipe.id, ...line })), { transaction });
    await refreshCakeAllergens(product.id, transaction);
    return { productId: product.id, variantId: variant.id, status: product.status, converted: Boolean(input.existingProductId) };
  });
  return created(res, result, input.existingProductId ? 'Perfil y receta conectados; clasifica los insumos antes de publicar' : 'Torta creada como borrador; revisa opciones e insumos antes de publicar');
}));

router.get('/configuration', requireAnyPermission(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE, PERMISSIONS.KITCHEN_READ), asyncHandler(async (_req: Request, res: Response) => {
  const profiles = await CakeProductProfile.findAll({ order: [['productId', 'ASC']] });
  const ids = profiles.map((entry) => entry.productId);
  const products = await Product.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ['id', 'name', 'slug', 'status', 'family', 'preparationMode', 'allergensReviewedAt'],
    include: [{ model: Category, as: 'category', attributes: ['name'], required: false }],
  });
  const variants = await ProductVariant.findAll({ where: { productId: { [Op.in]: ids } }, attributes: ['id', 'productId', 'name', 'productionMinutesJson', 'basePrice', 'isActive', 'servingSize', 'servingUnit'] });
  const links = await ProductCustomizationGroup.findAll({ where: { productId: { [Op.in]: ids } }, attributes: ['productId', 'groupId'] });
  const groupIds = [...new Set(links.map((entry) => entry.groupId))];
  const options = await CustomizationOption.findAll({ where: { groupId: { [Op.in]: groupIds } }, attributes: ['id', 'groupId', 'name', 'productionMinutesJson', 'inventoryItemId', 'consumptionQuantity'] });
  return ok(res, profiles.filter((profile) => products.some((entry) => entry.id === profile.productId)).map((profile) => ({
    profile, product: products.find((entry) => entry.id === profile.productId),
    variants: variants.filter((entry) => entry.productId === profile.productId),
    options: options.filter((entry) => links.some((link) => link.productId === profile.productId && link.groupId === entry.groupId)),
  })));
}));

router.get('/recipes', requireAnyPermission(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE, PERMISSIONS.KITCHEN_READ), asyncHandler(async (_req: Request, res: Response) => {
  const profiles = await CakeProductProfile.findAll({ where: { isActive: true }, attributes: ['productId'] });
  const productIds = profiles.map((entry) => entry.productId);
  const products = await Product.findAll({ where: { id: { [Op.in]: productIds } }, attributes: ['id', 'name', 'family', 'preparationMode'] });
  // También se editan recetas de presentaciones inactivas: una torta publicada
  // crea las nuevas inactivas hasta que su receta esté completa.
  const variants = await ProductVariant.findAll({ where: { productId: { [Op.in]: productIds } }, attributes: ['id', 'productId', 'name', 'basePrice', 'servingSize', 'servingUnit', 'isActive'], order: [['productId', 'ASC'], ['sortOrder', 'ASC']] });
  const [recipes, inventoryItems] = await Promise.all([
    Recipe.findAll({ where: { variantId: { [Op.in]: variants.map((entry) => entry.id) }, isActive: true }, include: [{ model: RecipeItem, as: 'items', include: [{ model: InventoryItem, as: 'item', attributes: ['id', 'name', 'unit'] }] }] }),
    InventoryItem.findAll({ where: { isActive: true }, attributes: ['id', 'name', 'unit', 'unitCost', 'itemType'], order: [['name', 'ASC']] }),
  ]);
  const recipeByVariant = new Map(recipes.map((recipe) => [recipe.variantId, recipe]));
  return ok(res, {
    inventoryItems,
    variants: variants.map((variant) => {
      const recipe = recipeByVariant.get(variant.id);
      return { id: variant.id, productId: variant.productId, productName: products.find((product) => product.id === variant.productId)?.name ?? 'Producto', preparationMode: products.find((product) => product.id === variant.productId)?.preparationMode ?? 'MADE_TO_ORDER', name: variant.name, basePrice: Number(variant.basePrice), servingSize: variant.servingSize === null ? null : Number(variant.servingSize), servingUnit: variant.servingUnit, isActive: variant.isActive, recipe: recipe ? { id: recipe.id, yieldQuantity: recipe.yieldQuantity, items: (recipe.items ?? []).map((line) => ({ inventoryItemId: line.inventoryItemId, quantity: Number(line.quantity), wastePercent: Number(line.wastePercent), item: line.get('item') })) } : null };
    }),
  });
}));

router.put('/recipes/:variantId', requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({
  params: z.object({ variantId: id }),
  body: z.object({
    yieldQuantity: z.coerce.number().int().positive().max(1000).default(1),
    items: z.array(z.object({ inventoryItemId: id, quantity: z.coerce.number().positive().max(100000), wastePercent: z.coerce.number().min(0).max(100).default(0) })).max(100),
  }).refine((body) => new Set(body.items.map((item) => item.inventoryItemId)).size === body.items.length, { message: 'No repitas el mismo insumo en la receta' }),
})), asyncHandler(async (req: Request, res: Response) => {
  const variant = await ProductVariant.findByPk(Number(req.params.variantId));
  if (!variant || !await CakeProductProfile.findByPk(variant.productId)) throw ApiError.notFound('Presentación de producto no encontrada');
  const inventoryIds = req.body.items.map((item: { inventoryItemId: number }) => item.inventoryItemId);
  const validItems = inventoryIds.length ? await InventoryItem.count({ where: { id: { [Op.in]: inventoryIds }, isActive: true } }) : 0;
  if (validItems !== inventoryIds.length) throw ApiError.unprocessable('Uno de los insumos ya no está activo');
  const product = await Product.findByPk(variant.productId);
  if (product?.preparationMode === 'READY_STOCK' && inventoryIds.length && await InventoryItem.count({ where: { id: { [Op.in]: inventoryIds }, itemType: 'FINISHED_PRODUCT' } }) !== inventoryIds.length) {
    throw ApiError.unprocessable('Conecta esta presentación con productos terminados de Inventario; las existencias se reservan y descuentan al vender.');
  }
  const saved = await sequelize.transaction(async (transaction) => {
    const [recipe] = await Recipe.findOrCreate({ where: { variantId: variant.id }, defaults: { productId: variant.productId, variantId: variant.id, yieldQuantity: req.body.yieldQuantity, isActive: true }, transaction });
    recipe.productId = variant.productId; recipe.yieldQuantity = req.body.yieldQuantity; recipe.isActive = true; await recipe.save({ transaction });
    await RecipeItem.destroy({ where: { recipeId: recipe.id }, transaction });
    if (req.body.items.length) await RecipeItem.bulkCreate(req.body.items.map((item: { inventoryItemId: number; quantity: number; wastePercent: number }) => ({ recipeId: recipe.id, inventoryItemId: item.inventoryItemId, quantity: item.quantity, wastePercent: item.wastePercent })), { transaction });
    await Product.update({ allergensReviewedAt: null }, { where: { id: variant.productId }, transaction });
    await ProductDietaryTag.destroy({ where: { productId: variant.productId }, transaction });
    await refreshCakeAllergens(variant.productId, transaction);
    return recipe;
  });
  return ok(res, saved, 'Receta actualizada');
}));

router.delete('/recipes/:variantId', requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({ params: z.object({ variantId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  const variant = await ProductVariant.findByPk(Number(req.params.variantId));
  if (!variant || !await CakeProductProfile.findByPk(variant.productId)) throw ApiError.notFound('Presentación de producto no encontrada');
  await sequelize.transaction(async (transaction) => {
    const recipe = await Recipe.findOne({ where: { variantId: variant.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!recipe) throw ApiError.notFound('La presentación no tiene una receta guardada');
    recipe.isActive = false;
    await recipe.save({ transaction });
    await CakeProductProfile.update({ isActive: false }, { where: { productId: variant.productId }, transaction });
    await Product.update({ allergensReviewedAt: null }, { where: { id: variant.productId }, transaction });
    await ProductDietaryTag.destroy({ where: { productId: variant.productId }, transaction });
  });
  return ok(res, { variantId: variant.id }, 'Receta retirada; completa una nueva para volver a ofrecer la torta');
}));

router.post('/design-requests', validate(z.object({ body: z.object({
  branchId: id, productId: id, variantId: id, desiredAt: date,
  requestKind: z.enum(['ADVANCED', 'FREEFORM']).default('ADVANCED'),
  themeId: id.optional(), themeVersion: id.optional(),
  selections: z.array(selection).max(30).default([]), description: z.string().trim().min(10).max(4000),
  brief: z.object({
    visualDesign: cakeVisualDesignSchema.optional(),
    occasion: z.string().trim().min(2).max(80),
    theme: z.string().trim().max(120).default(''),
    style: z.string().trim().max(120).default(''),
    colors: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
    servings: z.coerce.number().int().min(1).max(500).nullable().default(null),
    message: z.string().trim().max(160).default(''),
    budget: z.string().trim().max(80).default(''),
    notes: z.string().trim().max(1200).default(''),
    flavor: z.string().trim().max(80).default(''),
    filling: z.string().trim().max(80).default(''),
  }),
  referenceDataUrl: z.string().min(50).max(7_500_000).optional(),
  referenceDataUrls: z.array(z.string().min(50).max(7_500_000)).max(2).optional(),
  whatsappOptIn: z.boolean().optional(),
}) })), asyncHandler(async (req: Request, res: Response) => {
  return created(res, await cakeDesignService.submit({ ...req.body, userId: req.user!.sub, desiredAt: new Date(req.body.desiredAt) }), 'Solicitud enviada a diseño');
}));

router.post('/orders/:orderNumber/change-request', validate(z.object({
  params: z.object({ orderNumber: z.string().min(5).max(20) }),
  body: z.object({ description: z.string().trim().min(10).max(4000), referenceDataUrl: z.string().min(50).max(7_500_000) }),
})), asyncHandler(async (req: Request, res: Response) => {
  const order = await Order.findOne({ where: { orderNumber: req.params.orderNumber, userId: req.user!.sub }, include: [{ model: OrderItem, as: 'items', include: [{ model: OrderItemCustomization, as: 'customizations' }] }] });
  if (!order) throw ApiError.notFound('Pedido no encontrado');
  if (order.status !== 'CONFIRMED' || !order.scheduledAt || order.scheduledAt.getTime() - Date.now() <= 48 * 60 * 60_000) {
    throw ApiError.unprocessable('Los cambios de diseño se solicitan antes de las 48 horas previas a la entrega');
  }
  const started = await CakeProductionTask.count({ where: { orderId: order.id, status: { [Op.ne]: 'PENDING' } } });
  if (started) throw ApiError.conflict('La producción ya comenzó; contacta a soporte para revisar el pedido');
  const item = order.items?.[0];
  if (!item?.productId || !item.variantId) throw ApiError.unprocessable('El pedido no contiene una torta configurable');
  const selections = (item.get('customizations') as OrderItemCustomization[] | undefined)?.filter((entry) => entry.optionId).map((entry) => ({ optionId: entry.optionId!, quantity: entry.quantity })) ?? [];
  return created(res, await cakeDesignService.submit({ userId: req.user!.sub, branchId: order.branchId, productId: item.productId, variantId: item.variantId, desiredAt: order.scheduledAt, selections, description: req.body.description, brief: { occasion: 'Cambio de diseño', theme: '', style: '', colors: [], servings: null, message: '', budget: '', notes: '' }, referenceDataUrl: req.body.referenceDataUrl }), 'Solicitud de cambio enviada para nueva cotización');
}));

router.get('/design-requests/mine', asyncHandler(async (req: Request, res: Response) => ok(res, await cakeDesignService.mine(req.user!.sub))));
router.post('/design-requests/:requestId/whatsapp/stop', validate(z.object({ params: z.object({ requestId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  await cakeDesignService.stopWhatsapp(Number(req.params.requestId), req.user!.sub);
  return ok(res, { whatsappOptInAt: null }, 'Ya no recibirás avisos de esta solicitud por WhatsApp');
}));
router.patch('/design-requests/:requestId', validate(z.object({
  params: z.object({ requestId: id }),
  body: z.object({
    description: z.string().trim().min(10).max(4000),
    flavor: z.string().trim().min(2).max(80),
    filling: z.string().trim().min(2).max(80),
    message: z.string().trim().max(160).default(''),
    notes: z.string().trim().max(1200).default(''),
  }),
})), asyncHandler(async (req: Request, res: Response) => ok(res, await cakeDesignService.updatePending({ ...req.body, requestId: Number(req.params.requestId), userId: req.user!.sub }), 'Detalles actualizados')));
router.get('/design-requests/:requestId/reference', validate(z.object({ params: z.object({ requestId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  const actor = req.user!;
  const canReview = actor.isSuperAdmin || actor.permissions.includes(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE);
  const reference = await cakeDesignService.reference(Number(req.params.requestId), { id: actor.sub, canReview, branchIds: actor.branchIds ?? [] });
  res.setHeader('Content-Type', reference.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(reference.bytes);
}));
router.get('/design-requests/:requestId/references/:referenceId', validate(z.object({ params: z.object({ requestId: id, referenceId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  const actor = req.user!;
  const canReview = actor.isSuperAdmin || actor.permissions.includes(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE);
  const reference = await cakeDesignService.referenceAttachment(Number(req.params.requestId), Number(req.params.referenceId), { id: actor.sub, canReview, branchIds: actor.branchIds ?? [] });
  res.setHeader('Content-Type', reference.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(reference.bytes);
}));
router.post('/quotes/:quoteId/accept', validate(z.object({ params: z.object({ quoteId: id }) })), asyncHandler(async (req: Request, res: Response) => ok(res, await cakeDesignService.accept(Number(req.params.quoteId), req.user!.sub), 'Diseño aceptado')));

router.get('/design-requests', requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({ query: z.object({ branchId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await cakeDesignService.board(resolveBranchId(req, req.query.branchId as string)));
}));
router.post('/design-requests/:requestId/quotes', requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({
  params: z.object({ requestId: id }), body: z.object({ branchId: id, requestUpdatedAt: date, price: z.coerce.number().positive().max(100000), effort, proposedAt: date, expiresAt: date, terms: z.string().trim().min(5).max(4000),
    specification: z.object({
      flavor: z.string().trim().min(2).max(80),
      filling: z.string().trim().min(2).max(80),
      finish: z.string().trim().min(15).max(1200),
      inscription: z.string().trim().max(160).default(''),
      notes: z.string().trim().max(600).default(''),
    }),
    materialExtras: z.array(z.object({ inventoryItemId: id, quantity: z.coerce.number().positive().max(100000) })).max(100).default([]),
    estimatedLaborCost: z.coerce.number().min(0).max(100000).default(0), estimatedPackagingCost: z.coerce.number().min(0).max(100000).default(0),
  }),
})), asyncHandler(async (req: Request, res: Response) => created(res, await cakeDesignService.propose({
  ...req.body, requestId: Number(req.params.requestId), branchId: resolveBranchId(req, req.body.branchId), actorId: req.user!.sub,
  proposedAt: new Date(req.body.proposedAt), expiresAt: new Date(req.body.expiresAt),
}), 'Cotización enviada')));
router.post('/design-requests/:requestId/reject', requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({
  params: z.object({ requestId: id }), body: z.object({ branchId: id }),
})), asyncHandler(async (req: Request, res: Response) => ok(res, await cakeDesignService.reject(Number(req.params.requestId), resolveBranchId(req, req.body.branchId)), 'Solicitud rechazada')));

router.get('/capacity', requireAnyPermission(PERMISSIONS.KITCHEN_READ, PERMISSIONS.GEO_READ), validate(z.object({ query: z.object({ branchId: id, from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }) })), asyncHandler(async (req: Request, res: Response) => {
  const branchId = resolveBranchId(req, req.query.branchId as string);
  const from = String(req.query.from ?? dayInLima(new Date()));
  const to = req.query.to ? String(req.query.to) : undefined;
  const rows = await CakeStationCapacity.findAll({ where: { branchId, workDate: { [Op.gte]: from, ...(to ? { [Op.lte]: to } : {}) } }, order: [['workDate', 'ASC'], ['station', 'ASC']], limit: 500 });
  return ok(res, rows);
}));
router.put('/capacity', requirePermissions(PERMISSIONS.GEO_WRITE), validate(z.object({ body: z.object({ branchId: id, workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), station: z.enum(CAKE_STATIONS), capacityMinutes: z.coerce.number().int().min(0).max(1440) }) })), asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await cakeProductionService.setCapacity(resolveBranchId(req, req.body.branchId), req.body.workDate, req.body.station, req.body.capacityMinutes), 'Capacidad actualizada');
}));
router.delete('/capacity', requirePermissions(PERMISSIONS.GEO_WRITE), validate(z.object({ body: z.object({ branchId: id, workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), station: z.enum(CAKE_STATIONS) }) })), asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await cakeProductionService.restoreCapacity(resolveBranchId(req, req.body.branchId), req.body.workDate, req.body.station), 'Capacidad automática restaurada');
}));

router.put('/products/:productId/custom-servings', requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE), validate(z.object({
  params: z.object({ productId: id }),
  body: z.object({ enabled: z.boolean(), baseVariantId: id, minServings: z.coerce.number().int().min(2).max(500), maxServings: z.coerce.number().int().min(2).max(500), pricePerExtraServing: z.coerce.number().min(0).max(10000),
    sizeGuides: z.array(z.object({ variantId: id, diameterCm: z.coerce.number().min(8).max(80).multipleOf(.5), minServings: z.coerce.number().int().min(1).max(500), maxServings: z.coerce.number().int().min(1).max(500) })).max(30).optional(),
  }),
})), asyncHandler(async (req: Request, res: Response) => {
  const productId = Number(req.params.productId);
  const profile = await CakeProductProfile.findByPk(productId);
  if (!profile || profile.saleMode !== 'SEMI_CUSTOM') throw ApiError.unprocessable('Solo las tortas personalizables admiten porciones libres');
  const product = await Product.findByPk(productId);
  if (product?.family !== 'CAKE' || product.preparationMode !== 'MADE_TO_ORDER') throw ApiError.unprocessable('Las porciones libres corresponden a tortas por encargo');
  const variant = await ProductVariant.findByPk(req.body.baseVariantId);
  const base = Number(variant?.servingSize);
  if (!variant || variant.productId !== productId || !variant.isActive || variant.servingUnit !== 'porciones' || !Number.isSafeInteger(base) || base < 1) throw ApiError.unprocessable('Selecciona una presentacion activa con porciones');
  if (req.body.minServings <= base || req.body.maxServings < req.body.minServings) throw ApiError.unprocessable('El rango debe comenzar despues de la presentacion base');
  if (req.body.enabled && req.body.pricePerExtraServing <= 0) throw ApiError.unprocessable('Indica un precio por porcion adicional');
  if (req.body.enabled && !await Recipe.count({ where: { variantId: variant.id, isActive: true } })) throw ApiError.unprocessable('Configura la receta de la presentacion base antes de activar porciones libres');
  const nextRule = { ...req.body, sizeGuides: req.body.sizeGuides ?? profile.customServingsJson?.sizeGuides ?? [] };
  if (nextRule.sizeGuides.length) {
    const activeVariants = await ProductVariant.findAll({ where: { productId, isActive: true }, attributes: ['id', 'servingSize', 'servingUnit'] });
    validateCakeSizeGuides(nextRule.sizeGuides, activeVariants.map((row) => ({ id: row.id, servingSize: row.servingSize, servingUnit: row.servingUnit })), nextRule.baseVariantId, nextRule.enabled, nextRule.minServings);
  }
  profile.customServingsJson = nextRule;
  await profile.save();
  await audit(req, { action: 'cake.custom_servings.update', entity: 'products', entityId: productId, after: nextRule });
  return ok(res, profile, 'Regla de porciones actualizada');
}));

router.put('/products/:productId/profile', requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({ params: z.object({ productId: id }), body: z.object({
  saleMode: z.enum(['STANDARD', 'SEMI_CUSTOM', 'ADVANCED']), minLeadHours: z.coerce.number().int().min(0).max(720),
  baseEffortJson: effort, stationOffsetsJson: z.record(z.enum(CAKE_STATIONS), z.coerce.number().int().min(0).max(30)), isActive: z.boolean().default(true),
}) })), asyncHandler(async (req: Request, res: Response) => {
  const productId = Number(req.params.productId);
  const product = await Product.findByPk(productId);
  if (!product) throw ApiError.notFound('Producto no encontrado');
  if (product.preparationMode === 'READY_STOCK' && req.body.saleMode !== 'STANDARD') throw ApiError.unprocessable('Los productos preparados se venden sin personalización');
  if (product.family !== 'CAKE' && req.body.saleMode === 'ADVANCED') throw ApiError.unprocessable('El diseño por cotización corresponde a las tortas');
  const earliestStageDays = Math.max(0, ...Object.values(req.body.stationOffsetsJson as Record<string, number>));
  if (product.preparationMode !== 'READY_STOCK' && req.body.minLeadHours < earliestStageDays * 24) {
    throw ApiError.unprocessable(`La anticipación debe ser de al menos ${earliestStageDays * 24} horas para iniciar la primera etapa planificada`);
  }
  await CakeProductProfile.upsert({ productId, ...req.body });
  product.type = req.body.saleMode === 'STANDARD' ? 'FIXED' : 'CUSTOMIZABLE';
  await product.save();
  await refreshCakeAllergens(productId);
  return ok(res, await CakeProductProfile.findByPk(productId), 'Perfil de torta actualizado');
}));
router.put('/options/:optionId/effort', requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({ params: z.object({ optionId: id }), body: z.object({ productionMinutesJson: effort }) })), asyncHandler(async (req: Request, res: Response) => {
  const option = await CustomizationOption.findByPk(Number(req.params.optionId));
  if (!option) throw ApiError.notFound('Opción no encontrada');
  option.productionMinutesJson = req.body.productionMinutesJson;
  await option.save();
  return ok(res, option, 'Tiempos actualizados');
}));
router.put('/variants/:variantId/effort', requirePermissions(PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({ params: z.object({ variantId: id }), body: z.object({ productionMinutesJson: effort }) })), asyncHandler(async (req: Request, res: Response) => {
  const variant = await ProductVariant.findByPk(Number(req.params.variantId));
  if (!variant) throw ApiError.notFound('Presentación no encontrada');
  variant.productionMinutesJson = req.body.productionMinutesJson;
  await variant.save();
  return ok(res, variant, 'Tiempos actualizados');
}));

router.get('/tasks', requirePermissions(PERMISSIONS.KITCHEN_READ), validate(z.object({ query: z.object({ branchId: id, workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), mine: z.enum(['true', 'false']).optional() }) })), asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await cakeProductionService.listTasks(resolveBranchId(req, req.query.branchId as string), req.query.workDate as string | undefined, req.query.mine === 'true' ? req.user!.sub : undefined));
}));
router.get('/staff', requirePermissions(PERMISSIONS.KITCHEN_READ), validate(z.object({ query: z.object({ branchId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  const ids = await staffAudienceService.userIds(resolveBranchId(req, req.query.branchId as string), PERMISSIONS.KITCHEN_OPERATE);
  return ok(res, ids.length ? await User.findAll({ where: { id: ids }, attributes: ['id', 'firstName', 'lastName'], order: [['firstName', 'ASC'], ['id', 'ASC']] }) : []);
}));
router.patch('/tasks/:taskId', requirePermissions(PERMISSIONS.KITCHEN_OPERATE), validate(z.object({ params: z.object({ taskId: id }), body: z.object({
  branchId: id, status: z.enum(['IN_PROGRESS', 'DONE', 'BLOCKED']).optional(), assignedTo: id.nullable().optional(),
  checklistJson: z.record(z.string(), z.boolean()).optional(), evidenceUrl: z.string().url().max(500).nullable().optional(),
}).refine((body) => body.status !== undefined || body.assignedTo !== undefined || body.checklistJson !== undefined || body.evidenceUrl !== undefined) })), asyncHandler(async (req: Request, res: Response) => {
  const { branchId, ...input } = req.body;
  return ok(res, await cakeProductionService.updateTask(Number(req.params.taskId), assertBranchScope(req, branchId), input), 'Tarea actualizada');
}));

router.patch('/tasks/:taskId/materials', requirePermissions(PERMISSIONS.KITCHEN_OPERATE), validate(z.object({
  params: z.object({ taskId: id }),
  body: z.object({ branchId: id, consumed: z.record(z.string(), z.coerce.number().min(0)).default({}), waste: z.record(z.string(), z.coerce.number().min(0)).default({}), expectedMaterials: z.object({ consumed: z.record(z.string(), z.number()), waste: z.record(z.string(), z.number()) }).optional() }),
})), asyncHandler(async (req: Request, res: Response) => {
  const task = await cakeProductionService.recordMaterials(
    Number(req.params.taskId), assertBranchScope(req, req.body.branchId), req.user!.sub,
    req.body.consumed, req.body.waste, req.body.expectedMaterials,
  );
  await audit(req, { action: 'cake.production.materials.record', entity: 'cake_production_tasks', entityId: task!.id,
    after: { consumed: req.body.consumed, waste: req.body.waste } });
  return ok(res, task, 'Materiales registrados');
}));

router.post('/tasks/:taskId/evidence', requirePermissions(PERMISSIONS.KITCHEN_OPERATE), validate(z.object({ params: z.object({ taskId: id }), body: z.object({ branchId: id, dataUrl: z.string().min(50).max(7_500_000) }) })), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await cakeProductionService.setEvidence(Number(req.params.taskId), assertBranchScope(req, req.body.branchId), req.body.dataUrl), 'Foto guardada')));
router.get('/tasks/:taskId/evidence', requirePermissions(PERMISSIONS.KITCHEN_READ), validate(z.object({ params: z.object({ taskId: id }), query: z.object({ branchId: id }) })), asyncHandler(async (req: Request, res: Response) => {
  const evidence = await cakeProductionService.evidence(Number(req.params.taskId), resolveBranchId(req, req.query.branchId as string));
  res.setHeader('Content-Type', evidence.mime); res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.send(evidence.bytes);
}));

export default router;
