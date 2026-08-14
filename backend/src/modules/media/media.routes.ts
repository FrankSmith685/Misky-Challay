import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@config/constants';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { mediaController } from './media.controller';
import { mediaService } from './media.service';

const listQuery = z.object({
  query: z.object({
    category: z.string().min(1).max(40).optional(),
    includeDeleted: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().positive().max(10_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().max(120).optional(),
    sort: z.enum(['recent', 'name']).optional(),
  }),
});

const router = Router();
router.get('/files/:filename', mediaController.file);
router.use(authenticate);
router.use(requireAnyPermission(PERMISSIONS.CATALOG_PRODUCT_WRITE, PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE));
/**
 * El listado se resuelve aqui y no en el controlador porque su respuesta lleva
 * `meta` ademas de `data`: el panel necesita el total REAL para paginar y para
 * que el contador de recursos deje de mostrar el tamano de la pagina.
 */
router.get(
  '/',
  validate(listQuery),
  asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as z.infer<typeof listQuery>['query'];
    const { items, total, page, limit } = await mediaService.listPaged({
      category: query.category,
      includeDeleted: query.includeDeleted === 'true',
      page: query.page,
      limit: query.limit,
      search: query.search,
      sort: query.sort,
    });
    return ok(res, items, 'OK', {
      page,
      pageSize: limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);
router.post(
  '/',
  validate(z.object({ body: z.object({
    fileName: z.string().min(1).max(180),
    mimeType: z.enum(['image/webp', 'image/jpeg', 'image/png']),
    dataUrl: z.string().min(20).max(7_500_000),
    altText: z.string().max(180).nullable().optional(),
    category: z.string().min(2).max(40).optional(),
  }) })),
  mediaController.upload,
);
router.post(
  '/import-url',
  validate(z.object({ body: z.object({
    sourceUrl: z.string().url().max(2_048),
    altText: z.string().max(180).nullable().optional(),
    category: z.string().min(2).max(40).optional(),
  }) })),
  mediaController.importFromUrl,
);
router.patch(
  '/:id',
  validate(z.object({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ altText: z.string().max(180).nullable().optional(), category: z.string().min(2).max(40).optional() }),
  })),
  mediaController.update,
);
router.delete('/:id', validate(z.object({ params: z.object({ id: z.coerce.number().int().positive() }) })), mediaController.remove);
router.post('/:id/restore', validate(z.object({ params: z.object({ id: z.coerce.number().int().positive() }) })), mediaController.restore);
router.post('/:id/replace', validate(z.object({
  params: z.object({ id: z.coerce.number().int().positive() }),
  body: z.object({ replacementId: z.coerce.number().int().positive() }),
})), mediaController.replace);

export default router;
