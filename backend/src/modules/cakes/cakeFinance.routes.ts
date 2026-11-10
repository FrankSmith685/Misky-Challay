import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '@middlewares/auth.middleware';
import { requirePermissions, requireSuperAdmin } from '@middlewares/rbac.middleware';
import { validate } from '@middlewares/validate.middleware';
import { PERMISSIONS } from '@config/constants';
import { ok, created } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { resolveBranchId } from '@shared/utils/scope';
import { audit } from '@shared/utils/audit';
import { cakeFinanceService } from './cakeFinance.service';

const router = Router();
const id = z.coerce.number().int().positive();
const money = z.coerce.number().positive().max(1000000);
const date = z.coerce.date();
const reference = z.string().trim().min(3).max(120);
const notes = z.string().trim().max(500).optional();

router.use(authenticate);
router.get('/report', requirePermissions(PERMISSIONS.CAKE_FINANCE_READ), validate(z.object({ query: z.object({
  branchId: id, from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}) })), asyncHandler(async (req: Request, res: Response) => ok(res, { ...await cakeFinanceService.report({
  branchId: resolveBranchId(req, req.query.branchId as string), from: req.query.from as string | undefined,
  to: req.query.to as string | undefined, isSuperAdmin: Boolean(req.user!.isSuperAdmin),
}), canManageFinance: Boolean(req.user!.isSuperAdmin || req.user!.permissions.includes(PERMISSIONS.CAKE_FINANCE_MANAGE)) })));

router.post('/expenses', requirePermissions(PERMISSIONS.CAKE_FINANCE_MANAGE), validate(z.object({ body: z.object({
  branchId: id, orderId: id.optional(), category: z.enum(['LABOR', 'PACKAGING', 'UTILITIES', 'RENT', 'DELIVERY', 'MARKETING', 'OTHER']),
  amount: money, reference, occurredAt: date, notes,
}) })), asyncHandler(async (req: Request, res: Response) => {
  const entry = await cakeFinanceService.createExpense({ ...req.body, kind: 'BUSINESS_EXPENSE', branchId: resolveBranchId(req, req.body.branchId), actorId: req.user!.sub });
  await audit(req, { action: 'cake.finance.expense.create', entity: 'cake_finance_entries', entityId: entry.id, after: { amount: entry.amount, reference: entry.reference, category: entry.category } });
  return created(res, entry, 'Gasto registrado');
}));

router.post('/supplier-payments', requirePermissions(PERMISSIONS.CAKE_FINANCE_MANAGE), validate(z.object({ body: z.object({
  branchId: id, purchaseOrderId: id, amount: money, reference, occurredAt: date, notes,
}) })), asyncHandler(async (req: Request, res: Response) => {
  const entry = await cakeFinanceService.recordSupplierPayment({ ...req.body, branchId: resolveBranchId(req, req.body.branchId), actorId: req.user!.sub });
  await audit(req, { action: 'cake.finance.supplier_payment.create', entity: 'cake_finance_entries', entityId: entry.id, after: { amount: entry.amount, reference: entry.reference, purchaseOrderId: entry.purchaseOrderId } });
  return created(res, entry, 'Pago a proveedor registrado');
}));

router.post('/payment-fees', requirePermissions(PERMISSIONS.CAKE_FINANCE_MANAGE), validate(z.object({ body: z.object({
  branchId: id, paymentId: id, fee: z.coerce.number().min(0).max(1000000), netAmount: z.coerce.number().min(0).max(1000000), reference, occurredAt: date, notes,
}) })), asyncHandler(async (req: Request, res: Response) => {
  const entry = await cakeFinanceService.reconcilePayment({ ...req.body, branchId: resolveBranchId(req, req.body.branchId), actorId: req.user!.sub });
  await audit(req, { action: 'cake.finance.payment_fee.create', entity: 'cake_finance_entries', entityId: entry.id, after: { fee: entry.amount, netAmount: entry.netAmount, reference: entry.reference, paymentId: entry.paymentId } });
  return created(res, entry, 'Pago conciliado');
}));

router.post('/platform-expenses', requireSuperAdmin, validate(z.object({ body: z.object({
  category: z.enum(['HOSTING', 'SOFTWARE', 'MARKETING', 'LABOR', 'OTHER']), amount: money, reference, occurredAt: date, notes,
}) })), asyncHandler(async (req: Request, res: Response) => {
  const entry = await cakeFinanceService.createExpense({ ...req.body, kind: 'PLATFORM_EXPENSE', actorId: req.user!.sub });
  await audit(req, { action: 'cake.finance.platform_expense.create', entity: 'cake_finance_entries', entityId: entry.id, after: { amount: entry.amount, reference: entry.reference, category: entry.category } });
  return created(res, entry, 'Gasto de plataforma registrado');
}));

export default router;
