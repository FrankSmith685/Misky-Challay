import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { CAKE_STATIONS } from '@database/models/cakeProduction.model';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ok, created } from '@shared/http/ApiResponse';
import { audit } from '@shared/utils/audit';
import { cakeThemesService } from './cakeThemes.service';
import { CakeTheme } from '@database/models';

const router = Router();
const id = z.coerce.number().int().positive();
const query = z.object({ query: z.object({ branchId: id.optional() }) });
router.get('/', validate(query), asyncHandler(async (req: Request, res: Response) => ok(res, await cakeThemesService.listPublic(req.query.branchId ? Number(req.query.branchId) : undefined))));
router.get('/admin', authenticate, requirePermissions(PERMISSIONS.CATALOG_PRODUCT_READ), asyncHandler(async (_req: Request, res: Response) => ok(res, await cakeThemesService.listAdmin())));
router.get('/:slug', validate(z.object({ params: z.object({ slug: z.string().min(1).max(150) }), query: z.object({ branchId: id.optional() }) })), asyncHandler(async (req: Request, res: Response) => ok(res, await cakeThemesService.getPublic(String(req.params.slug), req.query.branchId ? Number(req.query.branchId) : undefined))));
const draft = z.object({
  productId: id, name: z.string().trim().min(3).max(120), theme: z.string().trim().min(2).max(80), description: z.string().trim().max(2000).default(''),
  imageUrlsJson: z.array(z.string().trim().max(255)).max(4), saleMode: z.enum(['CONFIGURED', 'QUOTE']),
  minLeadHours: z.coerce.number().int().min(0).max(720), minServings: z.coerce.number().int().min(1).max(500), maxServings: z.coerce.number().int().min(1).max(500),
  isActive: z.boolean().default(false), sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  variantRulesJson: z.array(z.object({
    variantId: id, priceDelta: z.coerce.number().min(0).max(100000).multipleOf(.01),
    materials: z.array(z.object({ inventoryItemId: id, quantity: z.coerce.number().positive().max(100000).multipleOf(.01) })).max(50),
    effort: z.record(z.enum(CAKE_STATIONS), z.coerce.number().int().min(0).max(1440)),
    excludedOptionIds: z.array(id).max(200).default([]),
    hiddenGroupIds: z.array(id).max(30).default([]),
  })).max(30),
});
router.post('/', authenticate, requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE, PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({ body: draft })), asyncHandler(async (req: Request, res: Response) => {
  if (req.body.isActive) await new Promise<void>((resolve, reject) => requirePermissions(PERMISSIONS.CATALOG_PRODUCT_PUBLISH)(req, res, (error?: unknown) => error ? reject(error) : resolve()));
  const row = await cakeThemesService.save(req.body);
  await audit(req, { action: 'cake.theme.create', entity: 'cake_themes', entityId: row.id, after: row.toJSON() });
  return created(res, row);
}));
router.put('/:themeId', authenticate, requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE, PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE), validate(z.object({ params: z.object({ themeId: id }), body: draft.extend({ expectedVersion: id }) })), asyncHandler(async (req: Request, res: Response) => {
  // Editar un modelo publicado cambia una oferta: exige el mismo permiso de publicación.
  if (req.body.isActive || (await CakeTheme.findByPk(Number(req.params.themeId)))?.isActive) await new Promise<void>((resolve, reject) => requirePermissions(PERMISSIONS.CATALOG_PRODUCT_PUBLISH)(req, res, (error?: unknown) => error ? reject(error) : resolve()));
  const { expectedVersion, ...data } = req.body;
  const row = await cakeThemesService.save(data, Number(req.params.themeId), expectedVersion);
  await audit(req, { action: 'cake.theme.update', entity: 'cake_themes', entityId: row.id, after: row.toJSON() });
  return ok(res, row);
}));
router.post('/:themeId/archive', authenticate, requirePermissions(PERMISSIONS.CATALOG_PRODUCT_WRITE, PERMISSIONS.CATALOG_PRODUCT_PUBLISH), validate(z.object({ params: z.object({ themeId: id }), body: z.object({ expectedVersion: id }) })), asyncHandler(async (req: Request, res: Response) => {
  const row = await cakeThemesService.archive(Number(req.params.themeId), req.body.expectedVersion);
  await audit(req, { action: 'cake.theme.archive', entity: 'cake_themes', entityId: row.id });
  return ok(res, row);
}));
export default router;
