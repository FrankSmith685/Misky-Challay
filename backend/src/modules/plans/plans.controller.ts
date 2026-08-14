import type { Request, Response } from 'express';
import { created, ok } from '@shared/http/ApiResponse';
import { asyncHandler } from '@shared/utils/asyncHandler';
import { ApiError } from '@shared/errors/ApiError';
import { plansService } from './plans.service';
import { walletService } from './wallet.service';

const requireUser = (req: Request): number => {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.sub;
};

/** Modulo PLANS (M06): planes, activaciones y billetera. */
export const plansController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const cityId = req.query.cityId ? Number(req.query.cityId) : undefined;
    const plans = await plansService.listPlans(cityId);
    return ok(res, plans, `${plans.length} planes disponibles`);
  }),

  /** RN-012: aqui NO se acredita saldo. Solo se abre el pago. */
  purchase: asyncHandler(async (req: Request, res: Response) => {
    const result = await plansService.purchase(
      requireUser(req),
      req.body.planCode,
      req.body.idempotencyKey,
      req.body.termsVersion,
      req.body.client,
    );

    const payload = {
      userPlanId: result.userPlan?.id ?? null,
      status: result.userPlan?.status ?? null,
      checkoutUrl: result.checkoutUrl,
      reused: result.reused,
    };

    return result.reused
      ? ok(res, payload, 'Esta compra ya estaba iniciada')
      : created(res, payload, 'Continua con el pago para activar tu plan');
  }),

  wallet: asyncHandler(async (req: Request, res: Response) => {
    const wallet = await plansService.wallet(requireUser(req));
    return ok(res, wallet);
  }),

  transactions: asyncHandler(async (req: Request, res: Response) => {
    const { transactions, meta } = await walletService.listTransactions(
      requireUser(req),
      req.query,
    );
    return ok(res, transactions, `${meta.total} movimientos`, meta);
  }),

  /** Fuerza el vencimiento (lo normal es que lo haga el job). Solo personal. */
  runExpiration: asyncHandler(async (_req: Request, res: Response) => {
    const result = await plansService.expireDuePlans();
    return ok(res, result, `${result.expired} planes vencidos`);
  }),
};
