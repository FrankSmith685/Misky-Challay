import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import {
  requirePermissions,
  requireSuperAdmin,
  requireAnyPermission,
} from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ok } from '@shared/http/ApiResponse';
import { audit } from '@shared/utils/audit';
import { branchScopeCheck } from '@shared/utils/scope';
import {
  customerWorkspaceService,
  workspaceSchema,
  channelsSchema,
} from '@modules/account/customerWorkspace.service';
import { CustomerCarePolicy } from '@database/models/customerJourney.model';
import {
  checkoutTermsService,
  checkoutTermsUpdateSchema,
} from '@modules/settings/checkoutTerms.service';
import { ApiError } from '@shared/errors/ApiError';
import { sequelize } from '@database/connection';
import {
  customerJourneyService,
  createCaseSchema,
  caseActionSchema,
  changeSchema,
} from './customerJourney.service';
import { Order, OrderItem, Branch } from '@database/models';
import { cakeOrderImagesService } from '@modules/cakes/cakeOrderImages.service';
const router = Router();
const params = z.object({ number: z.string().min(5).max(30) });
const caseParams = params.extend({ caseId: z.coerce.number().int().positive() });
router.get(
  '/gifts/:token',
  validate(z.object({ params: z.object({ token: z.string().uuid() }) })),
  asyncHandler(async (req, res) => {
    const order = await Order.findOne({ where: { 'giftJson.token': req.params.token } });
    if (
      !order?.giftJson ||
      Date.now() > new Date(order.scheduledAt ?? order.createdAt).getTime() + 90 * 86_400_000
    )
      throw ApiError.notFound('La ficha del regalo no está disponible.');
    const [items, branch] = await Promise.all([
      OrderItem.findAll({
        where: { orderId: order.id },
        attributes: ['productNameSnapshot', 'quantity', 'designDetailsJson'],
      }),
      Branch.findByPk(order.branchId, { attributes: ['name'] }),
    ]);
    res.setHeader('Cache-Control', 'private, no-store');
    return ok(res, {
      recipientName: order.giftJson.recipientName,
      message: order.giftJson.message,
      status: order.status,
      scheduledAt: order.scheduledAt,
      deliveryType: order.deliveryType,
      branchName: branch?.name,
      items,
      ...(order.giftJson.hidePrices ? {} : { grandTotal: order.grandTotal }),
    });
  }),
);
router.get(
  '/subscription-terms',
  asyncHandler(async (_req, res) => ok(res, await checkoutTermsService.get(undefined, 2))),
);
router.get(
  '/care',
  asyncHandler(async (_req, res) => ok(res, await CustomerCarePolicy.findByPk(1))),
);
router.use(authenticate);
router.post('/orders/:number/change-options', validate(z.object({ params, body: z.object({ address: changeSchema.shape.address }) })), asyncHandler(async (req, res) => ok(res, await customerJourneyService.changeOptions(req.params.number, req.user!.sub, req.body.address))));
router.get(
  '/orders/:number/images/:itemId/:imageId',
  validate(
    z.object({
      params: params.extend({
        itemId: z.coerce.number().int().positive(),
        imageId: z.coerce.number().int().positive(),
      }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const image = await cakeOrderImagesService.read(
      req.params.number,
      Number(req.params.itemId),
      req.user!,
      Number(req.params.imageId),
    );
    res.setHeader('Cache-Control', 'private, no-store');
    return ok(res, { dataUrl: `data:${image.mime};base64,${image.bytes.toString('base64')}` });
  }),
);
router.get(
  '/workspace',
  asyncHandler(async (req, res) => ok(res, await customerWorkspaceService.get(req.user!.sub))),
);
router.put(
  '/workspace',
  validate(z.object({ body: workspaceSchema })),
  asyncHandler(async (req, res) =>
    ok(res, await customerWorkspaceService.save(req.user!.sub, req.body)),
  ),
);
router.put(
  '/channels',
  validate(z.object({ body: channelsSchema })),
  asyncHandler(async (req, res) =>
    ok(res, await customerWorkspaceService.channels(req.user!.sub, req.body)),
  ),
);
router.post(
  '/media',
  validate(z.object({ body: z.object({ dataUrl: z.string().max(300000) }) })),
  asyncHandler(async (req, res) =>
    ok(res, await customerWorkspaceService.upload(req.user!.sub, req.body.dataUrl)),
  ),
);
router.get(
  '/media/:id',
  validate(z.object({ params: z.object({ id: z.string().uuid() }) })),
  asyncHandler(async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    return ok(res, await customerWorkspaceService.media(req.user!.sub, req.params.id));
  }),
);
router.get(
  '/orders/:number',
  validate(z.object({ params })),
  asyncHandler(async (req, res) =>
    ok(res, await customerJourneyService.list(req.params.number, req.user!.sub)),
  ),
);
router.post(
  '/orders/:number/cases',
  validate(z.object({ params, body: createCaseSchema })),
  asyncHandler(async (req, res) =>
    ok(res, await customerJourneyService.create(req.params.number, req.user!.sub, req.body)),
  ),
);
router.post(
  '/orders/:number/cases/:caseId',
  validate(z.object({ params: caseParams, body: caseActionSchema })),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await customerJourneyService.act(
        req.params.number,
        Number(req.params.caseId),
        req.user!.sub,
        req.body,
      ),
    ),
  ),
);
router.use('/admin', requirePermissions(PERMISSIONS.ORDER_READ));
router.post('/admin/orders/:number/change-options', validate(z.object({ params, body: z.object({ address: changeSchema.shape.address }) })), asyncHandler(async (req, res) => ok(res, await customerJourneyService.changeOptions(req.params.number, req.user!.sub, req.body.address, branchScopeCheck(req)))));
router.get(
  '/admin/orders/:number',
  validate(z.object({ params })),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await customerJourneyService.list(req.params.number, req.user!.sub, branchScopeCheck(req)),
    ),
  ),
);
router.post(
  '/admin/orders/:number/design',
  requireAnyPermission(PERMISSIONS.ORDER_UPDATE_STATUS, PERMISSIONS.COMMUNICATION_REPLY),
  validate(z.object({ params, body: z.object({ text: z.string().trim().min(5).max(2000) }) })),
  asyncHandler(async (req, res) => {
    const result = await customerJourneyService.proposeDesign(
      req.params.number,
      req.user!.sub,
      req.body.text,
      branchScopeCheck(req),
    );
    await audit(req, {
      action: 'order.design.propose',
      entity: 'customer_order_cases',
      entityId: String(result.id),
    });
    return ok(res, result);
  }),
);
router.post(
  '/admin/orders/:number/cases/:caseId',
  requireAnyPermission(PERMISSIONS.ORDER_UPDATE_STATUS, PERMISSIONS.COMMUNICATION_REPLY),
  validate(z.object({ params: caseParams, body: caseActionSchema })),
  asyncHandler(async (req, res) => {
    const result = await customerJourneyService.act(
      req.params.number,
      Number(req.params.caseId),
      req.user!.sub,
      req.body,
      branchScopeCheck(req),
    );
    await audit(req, {
      action: 'order.customer-case.update',
      entity: 'customer_order_cases',
      entityId: String(result.id),
    });
    return ok(res, result);
  }),
);
router.put(
  '/subscription-terms',
  requireSuperAdmin,
  validate(checkoutTermsUpdateSchema),
  asyncHandler(async (req, res) => {
    const result = await checkoutTermsService.update(req.body, req.user!.sub, 2);
    await audit(req, {
      action: 'subscription.terms.publish',
      entity: 'checkout_terms',
      entityId: '2',
    });
    return ok(res, result.after);
  }),
);
router.put(
  '/care',
  requireSuperAdmin,
  validate(
    z.object({
      body: z.object({
        version: z.number().int().positive(),
        content: z.string().trim().min(20).max(6000),
        productInstructionsJson: z
          .record(z.string().max(3000))
          .refine(
            (value) =>
              Object.keys(value).length <= 200 &&
              Object.keys(value).every((key) => /^[1-9]\d*$/.test(key)),
          ),
      }),
    }),
  ),
  asyncHandler(async (req, res) => {
    const result = await sequelize.transaction(async (transaction) => {
      const row = await CustomerCarePolicy.findByPk(1, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!row || row.version !== req.body.version)
        throw ApiError.conflict('Las instrucciones cambiaron. Recarga antes de publicar.');
      return row.update({ ...req.body, version: row.version + 1 }, { transaction });
    });
    await audit(req, {
      action: 'customer.care.publish',
      entity: 'customer_care_policies',
      entityId: '1',
    });
    return ok(res, result);
  }),
);
export default router;
