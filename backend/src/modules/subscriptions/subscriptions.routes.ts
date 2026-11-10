import { checkoutTermsService } from '@modules/settings/checkoutTerms.service';
import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requireAnyPermission, requirePermissions } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { created, ok } from '@shared/http/ApiResponse';
import { audit } from '@shared/utils/audit';
import { Branch, Subscription } from '@database/models';
import { assertBranchScope } from '@shared/utils/scope';
import { ApiError } from '@shared/errors/ApiError';
import type { Request } from 'express';
import { mpSubscriptions } from './mercadoPagoSubscriptions';
import { subscriptionsService } from './subscriptions.service';

const router = Router();
const id = z.coerce.number().int().positive();
const globalManagement = (req: Request) => {
  if (!req.user?.isSuperAdmin && req.user?.branchIds.length) throw ApiError.forbidden('Los planes se configuran con alcance global. Puedes gestionar las suscripciones de tus sucursales.');
};
const subscriberScope = async (req: Request) => {
  const subscription = await Subscription.findByPk(Number(req.params.id));
  if (!subscription) throw ApiError.notFound('Suscripción no encontrada');
  assertBranchScope(req, subscription.branchId);
};
const planBody = z.object({
  code: z.string().min(3).max(40), name: z.string().trim().min(3).max(100), description: z.string().trim().min(10).max(2000),
  monthlyPrice: z.coerce.number().positive().multipleOf(0.01),
  items: z.array(z.object({ variantId: id, quantity: z.coerce.number().int().min(1).max(24) })).min(1).max(12),
  branchIds: z.array(id).min(1), leadDays: z.coerce.number().int().min(1).max(30),
  maxActiveSubscribers: z.coerce.number().int().min(1).max(100000), maxDailyPickups: z.coerce.number().int().min(1).max(10000),
  isActive: z.boolean(), sortOrder: z.coerce.number().int().min(0).max(10000),
  effectiveFrom: z.string().datetime().nullable().optional(), expectedVersion: z.coerce.number().int().positive().optional(),
});

router.get('/config', asyncHandler(async (_req, res) => ok(res, { termsVersion: String((await checkoutTermsService.get(undefined, 2)).version), available: mpSubscriptions.enabled() })));
router.get('/plans', asyncHandler(async (_req, res) => ok(res, await subscriptionsService.listPublic())));

router.get('/mine', authenticate, asyncHandler(async (req, res) => ok(res, await subscriptionsService.mine(req.user!.sub))));
router.post('/subscribe', authenticate, validate(z.object({ body: z.object({ planId: id, branchId: id, termsAccepted: z.literal(true), termsVersion: z.string(), client: z.enum(['WEB', 'MOBILE']).default('WEB') }) })),
  asyncHandler(async (req, res) => created(res, await subscriptionsService.subscribe(req.user!.sub, req.body.planId, req.body.branchId, req.body.termsVersion, req.body.client), 'Continúa en Mercado Pago para autorizar el cobro mensual')));
router.post('/:id/sync', authenticate, validate(z.object({ params: z.object({ id }) })),
  asyncHandler(async (req, res) => ok(res, await subscriptionsService.sync(Number(req.params.id), req.user!.sub))));
router.get('/:id/checkout', authenticate, validate(z.object({ params: z.object({ id }) })),
  asyncHandler(async (req, res) => ok(res, await subscriptionsService.checkout(Number(req.params.id), req.user!.sub))));
router.post('/:id/cancel', authenticate, validate(z.object({ params: z.object({ id }) })),
  asyncHandler(async (req, res) => { await subscriptionsService.cancel(Number(req.params.id), req.user!.sub); return ok(res, { canceled: true }, 'No habrá nuevos cobros'); }));
router.post('/cycles/:cycleId/redeem', authenticate, validate(z.object({ params: z.object({ cycleId: id }), body: z.object({ slotId: id }) })),
  asyncHandler(async (req, res) => created(res, await subscriptionsService.redeem(req.user!.sub, Number(req.params.cycleId), req.body.slotId), 'Caja programada')));

router.get('/admin/plans', authenticate, requireAnyPermission(PERMISSIONS.PLAN_READ, PERMISSIONS.PLAN_MANAGE),
  asyncHandler(async (_req, res) => ok(res, await subscriptionsService.listAdmin())));
router.get('/admin/options', authenticate, requireAnyPermission(PERMISSIONS.PLAN_READ, PERMISSIONS.PLAN_MANAGE),
  asyncHandler(async (_req, res) => ok(res, { products: await subscriptionsService.availableProducts(),
    branches: (await Branch.findAll({ where: { isActive: true, acceptsPickup: true }, attributes: ['id', 'name'], order: [['name', 'ASC']] })) })));
router.get('/admin/dashboard', authenticate, requireAnyPermission(PERMISSIONS.PLAN_READ, PERMISSIONS.PLAN_MANAGE),
  asyncHandler(async (req, res) => ok(res, await subscriptionsService.adminDashboard(req.user!.isSuperAdmin ? [] : req.user!.branchIds))));
router.get('/admin/subscribers', authenticate, requireAnyPermission(PERMISSIONS.PLAN_READ, PERMISSIONS.PLAN_MANAGE),
  validate(z.object({ query: z.object({ planId: id.optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional(), status: z.enum(['PENDING', 'ACTIVE', 'PAST_DUE', 'CANCELED']).optional() }) })),
  asyncHandler(async (req, res) => ok(res, await subscriptionsService.adminSubscribers({ planId: req.query.planId ? Number(req.query.planId) : undefined, page: req.query.page ? Number(req.query.page) : 1, pageSize: req.query.pageSize ? Number(req.query.pageSize) : 50, status: req.query.status as string | undefined, branchIds: req.user!.isSuperAdmin ? [] : req.user!.branchIds }))));
router.post('/admin/plans', authenticate, requirePermissions(PERMISSIONS.PLAN_MANAGE), validate(z.object({ body: planBody })),
  asyncHandler(async (req, res) => { globalManagement(req); const plan = await subscriptionsService.savePlan(req.body); await audit(req, { action: 'subscription.plan.create', entity: 'subscription_plans', entityId: plan.id, after: plan }); return created(res, plan); }));
router.put('/admin/plans/:id', authenticate, requirePermissions(PERMISSIONS.PLAN_MANAGE), validate(z.object({ params: z.object({ id }), body: planBody })),
  asyncHandler(async (req, res) => { globalManagement(req); const plan = await subscriptionsService.savePlan(req.body, Number(req.params.id)); await audit(req, { action: 'subscription.plan.update', entity: 'subscription_plans', entityId: plan.id, after: plan }); return ok(res, plan); }));
router.post('/admin/plans/:id/archive', authenticate, requirePermissions(PERMISSIONS.PLAN_MANAGE), validate(z.object({ params: z.object({ id }), body: z.object({ expectedVersion: z.coerce.number().int().positive().optional() }) })),
  asyncHandler(async (req, res) => { globalManagement(req); const plan = await subscriptionsService.archivePlan(Number(req.params.id), req.body.expectedVersion); await audit(req, { action: 'subscription.plan.archive', entity: 'subscription_plans', entityId: plan.id, after: { archivedAt: plan.archivedAt, version: plan.version } }); return ok(res, plan); }));
router.post('/admin/subscribers/:id/sync', authenticate, requirePermissions(PERMISSIONS.PLAN_MANAGE), validate(z.object({ params: z.object({ id }) })),
  asyncHandler(async (req, res) => { await subscriberScope(req); return ok(res, await subscriptionsService.sync(Number(req.params.id))); }));
router.post('/admin/subscribers/:id/cancel', authenticate, requirePermissions(PERMISSIONS.PLAN_MANAGE), validate(z.object({ params: z.object({ id }), body: z.object({ reason: z.string().trim().max(500).optional() }) })),
  asyncHandler(async (req, res) => { await subscriberScope(req); await subscriptionsService.cancel(Number(req.params.id), undefined, req.body.reason); await audit(req, { action: 'subscription.cancel', entity: 'subscriptions', entityId: req.params.id, after: { reason: req.body.reason ?? null } }); return ok(res, { canceled: true }); }));

export default router;
