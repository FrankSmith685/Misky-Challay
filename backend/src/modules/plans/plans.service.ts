import { Op, Transaction } from 'sequelize';
import {
  Payment,
  PaymentAttempt,
  Plan,
  PlanBenefit,
  UserPlan,
  User,
  sequelize,
} from '@database/models';
import { USER_PLAN_STATUS } from '@database/models/userPlan.model';
import type { BenefitType } from '@database/models/planBenefit.model';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { PAYMENT_STATUS, WALLET_TX_TYPE } from '@config/constants';
import { env } from '@config/env';
import { logger } from '@config/logger';
import { ApiError } from '@shared/errors/ApiError';
import { deriveIdempotencyKey } from '@shared/utils/idempotency';
import { getPaymentProvider } from '@integrations/payments';
import { notificationsService } from '@modules/notifications/notifications.service';
import { walletService } from './wallet.service';

export interface ActiveBenefit {
  type: BenefitType;
  value: number;
  maxAmountPerOrder: number | null;
  description: string;
  userPlanId: number;
  planName: string;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const plansService = {
  /** Catalogo de planes con sus beneficios. */
  async listPlans(cityId?: number) {
    return Plan.findAll({
      where: {
        isActive: true,
        ...(cityId ? { [Op.or]: [{ cityId }, { cityId: null }] } : {}),
      },
      include: [{ model: PlanBenefit, as: 'benefits', where: { isActive: true }, required: false }],
      order: [
        ['sortOrder', 'ASC'],
        ['price', 'ASC'],
      ],
    });
  },

  /**
   * Compra de un plan (seccion 10.3).
   * Crea la activacion en PENDING_PAYMENT y abre el pago. El saldo NO se acredita
   * aqui: eso solo ocurre cuando el webhook confirma el cobro (RN-012).
   */
  async purchase(userId: number, planCode: string, clientKey: string) {
    const plan = await Plan.findOne({ where: { code: planCode, isActive: true } });
    if (!plan) throw ApiError.notFound('El plan no existe o ya no esta disponible');

    // Se deriva con el dueno y el ambito: la clave del cliente no puede alcanzar
    // el pago de otro usuario ni cruzarse con el espacio de claves de los pedidos.
    const idempotencyKey = deriveIdempotencyKey('plan', userId, clientKey);

    // RN-015: la misma clave no compra dos veces el plan.
    const existingPayment = await Payment.findOne({ where: { idempotencyKey } });
    if (existingPayment) {
      const activation = await UserPlan.findByPk(existingPayment.payableId);
      return {
        userPlan: activation,
        payment: existingPayment,
        checkoutUrl: existingPayment.checkoutUrl,
        reused: true,
      };
    }

    const user = await User.findByPk(userId);

    const userPlan = await UserPlan.create({
      userId,
      planId: plan.id,
      status: USER_PLAN_STATUS.PENDING_PAYMENT,
      planNameSnapshot: plan.name,
      priceSnapshot: Number(plan.price),
      creditSnapshot: Number(plan.grantedCredit),
      validityDaysSnapshot: plan.validityDays,
    });

    const provider = getPaymentProvider();

    const payment = await Payment.create({
      payableType: PAYABLE_TYPE.PLAN_PURCHASE,
      payableId: userPlan.id,
      userId,
      provider: provider.name,
      amount: Number(plan.price),
      currency: plan.currency,
      status: PAYMENT_STATUS.CREATED,
      idempotencyKey,
    });

    try {
      const checkout = await provider.createCheckout({
        orderId: userPlan.id,
        orderNumber: `PLAN-${userPlan.id}`,
        amount: Number(payment.amount),
        currency: payment.currency,
        customerEmail: user?.email ?? null,
        description: `${plan.name} - Verde Bowl`,
        idempotencyKey,
        successUrl: `${env.FRONTEND_URL}/cuenta/saldo?plan=${userPlan.id}`,
        cancelUrl: `${env.FRONTEND_URL}/planes`,
      });

      payment.providerReference = checkout.providerReference;
      payment.checkoutUrl = checkout.checkoutUrl;
      payment.status = PAYMENT_STATUS.PENDING;
      payment.safeResponseJson = checkout.safeResponse;
      await payment.save();

      await PaymentAttempt.create({
        paymentId: payment.id,
        idempotencyKey,
        requestJson: { userPlanId: userPlan.id, planCode },
        responseJson: checkout.safeResponse,
        success: true,
      });

      return { userPlan, payment, checkoutUrl: checkout.checkoutUrl, reused: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error del proveedor de pago';

      payment.status = PAYMENT_STATUS.FAILED;
      payment.failureReason = message;
      payment.failedAt = new Date();
      await payment.save();

      userPlan.status = USER_PLAN_STATUS.CANCELLED;
      await userPlan.save();

      logger.error('No se pudo abrir el pago del plan', error);
      throw ApiError.internal('No pudimos iniciar el pago del plan. Intenta de nuevo.');
    }
  },

  /**
   * RN-012: el pago confirmado activa el plan y acredita el saldo.
   * Lo llama el webhook, dentro de su transaccion.
   */
  async activate(userPlanId: number, transaction: Transaction): Promise<UserPlan> {
    const userPlan = await UserPlan.findByPk(userPlanId, { transaction });
    if (!userPlan) throw ApiError.notFound('Activacion de plan no encontrada');

    if (userPlan.status === USER_PLAN_STATUS.ACTIVE) return userPlan;

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + userPlan.validityDaysSnapshot * 24 * 60 * 60 * 1000,
    );

    userPlan.status = USER_PLAN_STATUS.ACTIVE;
    userPlan.startsAt = now;
    userPlan.activatedAt = now;
    userPlan.expiresAt = expiresAt;
    await userPlan.save({ transaction });

    // El credito lleva la fecha de vencimiento del plan: al vencer se anula (decision de Fase 0).
    await walletService.move(
      {
        userId: userPlan.userId,
        type: WALLET_TX_TYPE.CREDIT,
        amount: Number(userPlan.creditSnapshot),
        description: `Saldo de ${userPlan.planNameSnapshot}`,
        idempotencyKey: `plan-${userPlan.id}-credit`,
        userPlanId: userPlan.id,
        expiresAt,
      },
      transaction,
    );

    logger.success(
      `Plan ${userPlan.planNameSnapshot} activado para el usuario ${userPlan.userId} (S/ ${userPlan.creditSnapshot})`,
    );

    // Aviso al cliente, fuera de la transaccion y sin bloquearla.
    void notificationsService
      .notifyPlanActivated(userPlan.id)
      .catch((error) => logger.error('Fallo el aviso de plan activado', error));

    return userPlan;
  },

  /** Planes vigentes del cliente. */
  async activePlans(userId: number): Promise<UserPlan[]> {
    return UserPlan.findAll({
      where: {
        userId,
        status: USER_PLAN_STATUS.ACTIVE,
        expiresAt: { [Op.gt]: new Date() },
      },
      include: [{ model: Plan, as: 'plan', include: [{ model: PlanBenefit, as: 'benefits' }] }],
      order: [['expiresAt', 'ASC']],
    });
  },

  /**
   * Beneficios vigentes del cliente, listos para el motor de precios.
   * Si tiene varios planes activos, se queda con el mejor de cada tipo.
   */
  async activeBenefits(userId: number): Promise<ActiveBenefit[]> {
    const plans = await plansService.activePlans(userId);
    const best = new Map<BenefitType, ActiveBenefit>();

    for (const userPlan of plans) {
      const benefits = (userPlan.plan?.benefits ?? []).filter((benefit) => benefit.isActive);

      for (const benefit of benefits) {
        const candidate: ActiveBenefit = {
          type: benefit.type,
          value: Number(benefit.value),
          maxAmountPerOrder:
            benefit.maxAmountPerOrder === null ? null : Number(benefit.maxAmountPerOrder),
          description: benefit.description,
          userPlanId: userPlan.id,
          planName: userPlan.planNameSnapshot,
        };

        const current = best.get(benefit.type);
        if (!current || candidate.value > current.value) {
          best.set(benefit.type, candidate);
        }
      }
    }

    return [...best.values()];
  },

  /** Resumen para la pantalla "Mi saldo". */
  async wallet(userId: number) {
    const [balance, plans] = await Promise.all([
      walletService.getBalance(userId),
      plansService.activePlans(userId),
    ]);

    const nextExpiry = plans[0]?.expiresAt ?? null;

    return {
      balance,
      currency: 'PEN',
      expiresAt: nextExpiry,
      activePlans: plans.map((userPlan) => ({
        id: userPlan.id,
        name: userPlan.planNameSnapshot,
        credit: Number(userPlan.creditSnapshot),
        expiresAt: userPlan.expiresAt,
        benefits: (userPlan.plan?.benefits ?? []).map((benefit) => ({
          type: benefit.type,
          description: benefit.description,
        })),
      })),
    };
  },

  /**
   * Vence los planes caducados y ANULA el saldo restante (decision de Fase 0).
   * Lo ejecuta un job programado; tambien se puede forzar desde el panel.
   */
  async expireDuePlans(): Promise<{ expired: number; creditVoided: number }> {
    const due = await UserPlan.findAll({
      where: {
        status: USER_PLAN_STATUS.ACTIVE,
        expiresAt: { [Op.lte]: new Date() },
      },
    });

    let creditVoided = 0;

    for (const userPlan of due) {
      await sequelize.transaction(async (transaction) => {
        userPlan.status = USER_PLAN_STATUS.EXPIRED;
        userPlan.expiredAt = new Date();
        await userPlan.save({ transaction });

        // Se anula lo que quede en la billetera, hasta el credito que dio este plan.
        const balance = await walletService.getBalance(userPlan.userId);
        const toVoid = round2(Math.min(balance, Number(userPlan.creditSnapshot)));

        if (toVoid > 0) {
          await walletService.move(
            {
              userId: userPlan.userId,
              type: WALLET_TX_TYPE.EXPIRATION,
              amount: toVoid,
              description: `Saldo vencido de ${userPlan.planNameSnapshot}`,
              idempotencyKey: `plan-${userPlan.id}-expiration`,
              userPlanId: userPlan.id,
            },
            transaction,
          );
          creditVoided += toVoid;
        }
      });
    }

    if (due.length > 0) {
      logger.warn(`Planes vencidos: ${due.length} (saldo anulado: S/ ${round2(creditVoided)})`);
    }

    return { expired: due.length, creditVoided: round2(creditVoided) };
  },
};

export type PlansService = typeof plansService;
