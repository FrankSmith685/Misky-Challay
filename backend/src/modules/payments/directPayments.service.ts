import { hasAdditionalBalance } from '@modules/orders/additionalBalance';
import { Op, UniqueConstraintError, type Transaction } from 'sequelize';
import {
  MobilePaymentClaim,
  MobilePaymentEvent,
  Order,
  Payment,
  Refund,
  User,
  sequelize,
} from '@database/models';
import { PAYABLE_TYPE, PAYMENT_STAGE, type PaymentStage } from '@database/models/payment.model';
import { ApiError } from '@shared/errors/ApiError';
import { round2 } from '@shared/utils/money';
import {
  settingsService,
  type EditableLocalPaymentSettings,
} from '@modules/settings/settings.service';
import { ordersService } from '@modules/orders/orders.service';
import { inventoryService } from '@modules/operations/inventory.service';
import { cakeCommissionService } from '@modules/cakes/cakeCommission.service';
import { confirmPaidOrder } from './payments.service';
import { paymentNotifications } from '@modules/communications/paymentNotifications.service';
import {
  decodeDirectEvidence,
  directState,
  holdsDirectReview,
  isDirectProvider,
  type DirectPaymentSnapshot,
} from './directPayments.logic';

export interface DirectReport {
  operationCode: string;
  payerName?: string;
  payerPhone?: string;
  paidAt?: string;
  amount?: number;
  evidenceDataUrl?: string;
}

const eventAttributes = [
  'id',
  'paymentId',
  'actorId',
  'kind',
  'details',
  'evidenceMime',
  'createdAt',
];
const snapshotOf = (payment: Payment): DirectPaymentSnapshot | null =>
  (payment.safeResponseJson?.directPayment as DirectPaymentSnapshot | undefined) ?? null;
const logEvent = (
  paymentId: number,
  kind: string,
  actorId: number | null,
  details: Record<string, unknown>,
  transaction: Transaction,
  evidence?: ReturnType<typeof decodeDirectEvidence>,
) =>
  MobilePaymentEvent.create(
    {
      paymentId,
      kind,
      actorId,
      details,
      evidenceMime: evidence?.mime ?? null,
      evidenceBytes: evidence?.bytes ?? null,
    },
    { transaction },
  );

const assertOwner = (order: Order, userId: number) => {
  if (order.userId !== userId) throw ApiError.forbidden('Este pedido no es tuyo');
};

/** Locks always follow order -> payment -> claim, matching cancellation and expiry. */
const lockedPayment = async (paymentId: number, transaction: Transaction) => {
  const found = await Payment.findByPk(paymentId, {
    attributes: ['id', 'payableId', 'payableType', 'provider'],
    transaction,
  });
  if (!found || found.payableType !== PAYABLE_TYPE.ORDER || !isDirectProvider(found.provider))
    throw ApiError.notFound('Pago directo no encontrado');
  const order = await Order.findByPk(found.payableId, {
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const payment = await Payment.findByPk(paymentId, { transaction, lock: transaction.LOCK.UPDATE });
  if (!order || !payment) throw ApiError.notFound('Pago directo no encontrado');
  const claim = await MobilePaymentClaim.findOne({
    where: { paymentId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  return { order, payment, claim };
};

export const directPaymentsService = {
  snapshot(
    provider: 'yape' | 'plin',
    settings: EditableLocalPaymentSettings,
  ): DirectPaymentSnapshot {
    if (!settings[`${provider}Enabled`])
      throw ApiError.unprocessable(
        `${provider === 'yape' ? 'Yape' : 'Plin'} no está disponible por ahora`,
      );
    const phone = settings[`${provider}Phone`].trim();
    const recipient = settings[`${provider}Recipient`].trim();
    if (!phone || recipient.length < 3)
      throw ApiError.unprocessable(
        'La tienda todavía no ha completado la cuenta de este medio de pago',
      );
    return {
      phone,
      recipient,
      qrImageUrl: settings[`${provider}QrImageUrl`],
      instructions: settings.instructions,
      expiresAt: new Date(Date.now() + settings.paymentWindowMinutes * 60000).toISOString(),
      reviewAlertMinutes: settings.reviewAlertMinutes,
    };
  },

  async create(
    order: Order,
    provider: 'yape' | 'plin',
    snapshot: DirectPaymentSnapshot,
    transaction: Transaction,
    stage: PaymentStage = order.paymentPlan === 'DEPOSIT_BALANCE'
      ? PAYMENT_STAGE.DEPOSIT
      : PAYMENT_STAGE.FULL,
    initialReport?: DirectReport,
  ) {
    const attempt =
      stage === PAYMENT_STAGE.BALANCE
        ? (await Payment.count({
            where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id, stage },
            transaction,
          })) + 1
        : 0;
    const payment = await Payment.create(
      {
        payableType: PAYABLE_TYPE.ORDER,
        payableId: order.id,
        userId: order.userId,
        provider,
        method: provider,
        amount: round2(
          Number(
            stage === PAYMENT_STAGE.DEPOSIT
              ? order.depositAmount
              : stage === PAYMENT_STAGE.BALANCE
                ? order.balanceAmount
                : order.grandTotal,
          ),
        ),
        stage,
        currency: order.currency,
        status: 'PENDING',
        idempotencyKey:
          stage === PAYMENT_STAGE.BALANCE
            ? `order-${order.id}-direct-balance-${attempt}`
            : (order.idempotencyKey ?? `order-${order.id}-direct`),
        safeResponseJson: { directPayment: snapshot },
      },
      { transaction },
    );
    await logEvent(
      payment.id,
      'CREATED',
      order.userId,
      {
        stage: payment.stage,
        amount: Number(payment.amount),
        recipient: snapshot.recipient,
        phone: snapshot.phone,
      },
      transaction,
    );
    // Backward compatibility for mobile clients that already submitted a transfer.
    await paymentNotifications.record(order, payment, 'PAYMENT_PENDING', transaction);
    if (initialReport?.operationCode)
      await directPaymentsService.saveReport(
        order,
        payment,
        null,
        initialReport,
        order.userId!,
        transaction,
      );
    return payment;
  },

  async saveReport(
    order: Order,
    payment: Payment,
    claim: MobilePaymentClaim | null,
    report: DirectReport,
    actorId: number,
    transaction: Transaction,
    recoveryReason?: string,
  ) {
    if (payment.status !== 'PENDING' || (claim && !['OBSERVED', 'PENDING'].includes(claim.status)))
      throw ApiError.conflict('Este pago ya no admite reportes');
    if (claim?.status === 'PENDING') {
      if (claim.operationCode === report.operationCode.trim().toUpperCase()) return; // retry after a lost response
      throw ApiError.conflict(
        'Tu pago ya está en revisión. Espera la respuesta del negocio antes de cambiarlo.',
      );
    }
    if (
      !recoveryReason &&
      claim?.status !== 'OBSERVED' &&
      ['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.status)
    )
      throw ApiError.conflict(
        'Este pedido ya no admite nuevos pagos. Contacta a la tienda si ya transferiste.',
      );
    const snapshot = snapshotOf(payment);
    if (!recoveryReason && !claim && snapshot && Date.now() > Date.parse(snapshot.expiresAt))
      throw ApiError.conflict(
        'Venció el plazo de este pago. Si ya transferiste, contacta a la tienda con el número de pedido.',
      );
    if (report.paidAt && Date.parse(report.paidAt) > Date.now() + 300000)
      throw ApiError.badRequest('La fecha del pago no puede estar en el futuro');
    let evidence: ReturnType<typeof decodeDirectEvidence>;
    try {
      evidence = decodeDirectEvidence(report.evidenceDataUrl);
    } catch (error) {
      throw ApiError.badRequest((error as Error).message);
    }
    const operationCode = report.operationCode.trim().toUpperCase();
    const duplicate = await MobilePaymentClaim.findOne({
      where: { provider: payment.provider, operationCode, paymentId: { [Op.ne]: payment.id } },
      transaction,
    });
    if (duplicate)
      throw ApiError.conflict(
        'Esta operación ya está asociada a otro pago. Revisa el código o contacta a la tienda.',
      );
    const values = {
      operationCode,
      payerName: report.payerName?.trim() || order.contactName,
      payerPhone: report.payerPhone?.trim() || null,
      paidAt: report.paidAt ? new Date(report.paidAt) : new Date(),
      declaredAmount: round2(report.amount ?? Number(payment.amount)),
      status: 'PENDING' as const,
      submittedAt: new Date(),
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
    };
    if (claim) {
      claim.set(values);
      await claim.save({ transaction });
    } else
      await MobilePaymentClaim.create(
        { paymentId: payment.id, provider: payment.provider as 'yape' | 'plin', ...values },
        { transaction },
      );
    payment.providerReference = operationCode;
    await payment.save({ transaction });
    await logEvent(
      payment.id,
      recoveryReason ? 'RECOVERY_REPORTED' : 'REPORTED',
      actorId,
      {
        ...values,
        corrected: Boolean(claim),
        ...(recoveryReason ? { reason: recoveryReason } : {}),
      },
      transaction,
      evidence,
    );
    await paymentNotifications.record(order, payment, 'PAYMENT_REPORTED', transaction, { suffix: paymentNotifications.suffix(`${operationCode}:${values.submittedAt.toISOString()}`) });
  },

  async recoveryReport(
    paymentId: number,
    actorId: number,
    report: DirectReport,
    reason: string,
    scopeCheck: (branchId: number) => void,
  ) {
    try {
      await sequelize.transaction(async (transaction) => {
        const { order, payment, claim } = await lockedPayment(paymentId, transaction);
        scopeCheck(order.branchId);
        if (!['PENDING', 'FAILED'].includes(payment.status) || claim?.status === 'APPROVED')
          throw ApiError.conflict('Este pago ya está resuelto');
        if (claim?.status === 'PENDING')
          throw ApiError.conflict('Ya hay un reporte pendiente de verificar');
        payment.status = 'PENDING';
        payment.failedAt = null;
        payment.failureReason = null;
        if (claim?.status === 'REJECTED') claim.status = 'OBSERVED';
        await directPaymentsService.saveReport(
          order,
          payment,
          claim,
          report,
          actorId,
          transaction,
          reason,
        );
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError)
        throw ApiError.conflict('Esta operación ya fue registrada');
      throw error;
    }
    return directPaymentsService.detail(paymentId, { scopeCheck });
  },

  async report(paymentId: number, userId: number, report: DirectReport) {
    try {
      await sequelize.transaction(async (transaction) => {
        const { order, payment, claim } = await lockedPayment(paymentId, transaction);
        assertOwner(order, userId);
        await directPaymentsService.saveReport(order, payment, claim, report, userId, transaction);
      });
    } catch (error) {
      if (error instanceof UniqueConstraintError)
        throw ApiError.conflict('Esta operación ya fue registrada');
      throw error;
    }
    return directPaymentsService.detail(paymentId, { userId });
  },

  async detail(
    paymentId: number,
    access: { userId?: number; scopeCheck?: (branchId: number) => void },
  ) {
    const payment = await Payment.findByPk(paymentId);
    if (
      !payment ||
      !isDirectProvider(payment.provider) ||
      payment.payableType !== PAYABLE_TYPE.ORDER
    )
      throw ApiError.notFound('Pago directo no encontrado');
    const order = await Order.findByPk(payment.payableId);
    if (!order) throw ApiError.notFound('Pedido no encontrado');
    if (access.userId) assertOwner(order, access.userId);
    else if (access.scopeCheck) access.scopeCheck(order.branchId);
    else throw ApiError.forbidden('No tienes acceso al pago');
    return directPaymentsService.serialize(payment, order);
  },

  async serialize(payment: Payment, order: Order) {
    const claim = await MobilePaymentClaim.findOne({ where: { paymentId: payment.id } });
    const events = await MobilePaymentEvent.findAll({
      where: { paymentId: payment.id },
      attributes: eventAttributes,
      include: [{ model: User, as: 'actor', attributes: ['firstName', 'lastName'] }],
      order: [['id', 'ASC']],
    });
    const snapshot = snapshotOf(payment);
    const refunds = await Refund.findAll({
      where: { paymentId: payment.id },
      order: [['id', 'ASC']],
    });
    const refunded = refunds
      .filter((refund) => refund.status === 'SUCCEEDED')
      .reduce((sum, refund) => sum + Number(refund.amount), 0);
    const remaining = round2(Number(payment.amount) - refunded);
    const state = directState(
      payment.status,
      claim?.status ?? null,
      order.status,
      Boolean(snapshot && Date.now() > Date.parse(snapshot.expiresAt)),
      remaining,
      payment.safeResponseJson?.directRefundRequired === true,
    );
    // Existing payments retain support; new payments always use their frozen account snapshot.
    const legacySettings = !snapshot ? await settingsService.getLocalPaymentSettings() : null;
    const recipient = snapshot ?? {
      phone: legacySettings![`${payment.provider as 'yape' | 'plin'}Phone`],
      recipient: legacySettings![`${payment.provider as 'yape' | 'plin'}Recipient`],
      qrImageUrl: legacySettings![`${payment.provider as 'yape' | 'plin'}QrImageUrl`],
      instructions: legacySettings!.instructions,
      expiresAt: null,
      reviewAlertMinutes: legacySettings!.reviewAlertMinutes,
    };
    return {
      paymentId: payment.id,
      provider: payment.provider,
      amount: Number(payment.amount),
      stage: payment.stage,
      currency: payment.currency,
      state,
      recipient,
      orderNumber: order.orderNumber,
      orderStatus: order.status,
      branchId: order.branchId,
      createdAt: payment.createdAt,
      contactName: order.contactName,
      contactPhone: order.contactPhone,
      refundedAmount: refunded,
      refundableAmount: payment.status === 'SUCCEEDED' ? remaining : 0,
      canReport:
        payment.status === 'PENDING' &&
        ['AWAITING_PAYMENT', 'OBSERVED'].includes(state) &&
        (state === 'OBSERVED' || !['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.status)),
      overdue:
        holdsDirectReview(claim?.status) &&
        Date.now() > (claim?.submittedAt.getTime() ?? 0) + recipient.reviewAlertMinutes * 60000,
      claim: claim
        ? {
            status: claim.status,
            operationCode: claim.operationCode,
            payerName: claim.payerName,
            payerPhone: claim.payerPhone,
            paidAt: claim.paidAt,
            declaredAmount:
              claim.declaredAmount == null ? Number(payment.amount) : Number(claim.declaredAmount),
            submittedAt: claim.submittedAt,
            reviewedAt: claim.reviewedAt,
            reviewedBy: claim.reviewedBy,
            reason: claim.rejectionReason,
          }
        : null,
      history: events.map((event) => {
        const actor = event.get('actor') as User | undefined;
        return {
          id: event.id,
          kind: event.kind,
          details: event.details,
          actorId: event.actorId,
          actorName: actor ? [actor.firstName, actor.lastName].filter(Boolean).join(' ') : null,
          createdAt: event.createdAt,
          hasEvidence: Boolean(event.evidenceMime),
        };
      }),
      refunds: refunds.map((refund) => ({
        id: refund.id,
        amount: Number(refund.amount),
        status: refund.status,
        reference: refund.providerReference,
        reason: refund.reason,
        createdAt: refund.createdAt,
      })),
    };
  },

  async list(
    branchId: number,
    input: { state?: string; provider?: string; search?: string; page?: number } = {},
  ) {
    const page = input.page ?? 1;
    const matchingOrders = await Order.findAll({
      where: {
        branchId,
        ...(input.search
          ? {
              [Op.or]: [
                { orderNumber: { [Op.like]: `%${input.search}%` } },
                { contactName: { [Op.like]: `%${input.search}%` } },
              ],
            }
          : {}),
      },
    });
    if (!matchingOrders.length) return { items: [], total: 0, page, pageSize: 30, counts: {} };
    const payments = await Payment.findAll({
      where: {
        payableType: PAYABLE_TYPE.ORDER,
        payableId: matchingOrders.map((order) => order.id),
        provider:
          input.provider && isDirectProvider(input.provider) ? input.provider : ['yape', 'plin'],
      },
      order: [['createdAt', 'DESC']],
    });
    const byId = new Map(matchingOrders.map((order) => [order.id, order]));
    // Compute counts in batches; fetch protected evidence/history only for the visible page.
    const ids = payments.map((payment) => payment.id);
    const [claims, refunds] = ids.length
      ? await Promise.all([
          MobilePaymentClaim.findAll({
            where: { paymentId: ids },
            attributes: ['paymentId', 'status'],
          }),
          Refund.findAll({
            where: { paymentId: ids, status: 'SUCCEEDED' },
            attributes: ['paymentId', 'amount'],
          }),
        ])
      : [[], []];
    const claimById = new Map(claims.map((claim) => [claim.paymentId, claim.status]));
    const refundedById = new Map<number, number>();
    for (const refund of refunds)
      refundedById.set(
        refund.paymentId,
        (refundedById.get(refund.paymentId) ?? 0) + Number(refund.amount),
      );
    const all = payments.map((payment) => ({
      payment,
      state: directState(
        payment.status,
        claimById.get(payment.id) ?? null,
        byId.get(payment.payableId)!.status,
        Boolean(snapshotOf(payment) && Date.now() > Date.parse(snapshotOf(payment)!.expiresAt)),
        round2(Number(payment.amount) - (refundedById.get(payment.id) ?? 0)),
        payment.safeResponseJson?.directRefundRequired === true,
      ),
    }));
    const counts: Record<string, number> = {};
    for (const row of all) counts[row.state] = (counts[row.state] ?? 0) + 1;
    const filtered = input.state ? all.filter((row) => row.state === input.state) : all;
    const items = await Promise.all(
      filtered
        .slice((page - 1) * 30, page * 30)
        .map(({ payment }) =>
          directPaymentsService.serialize(payment, byId.get(payment.payableId)!),
        ),
    );
    return { items, total: filtered.length, page, pageSize: 30, counts };
  },

  async review(
    paymentId: number,
    decision: 'APPROVE' | 'OBSERVE' | 'REJECT',
    actorId: number,
    reason: string | undefined,
    scopeCheck: (branchId: number) => void,
  ) {
    await sequelize.transaction(async (transaction) => {
      const { order, payment, claim } = await lockedPayment(paymentId, transaction);
      scopeCheck(order.branchId);
      if (!claim || !holdsDirectReview(claim.status) || payment.status !== 'PENDING')
        throw ApiError.conflict('Este pago no está pendiente de revisión');
      if (decision !== 'APPROVE' && !reason?.trim())
        throw ApiError.badRequest('Indica el motivo para el cliente');
      if (
        decision === 'APPROVE' &&
        claim.declaredAmount != null &&
        round2(Number(claim.declaredAmount)) !== round2(Number(payment.amount))
      ) {
        throw ApiError.unprocessable(
          'El importe reportado difiere del importe esperado. Solicita una corrección antes de confirmar.',
        );
      }
      claim.reviewedBy = actorId;
      claim.reviewedAt = new Date();
      claim.rejectionReason = reason?.trim() || null;
      claim.status =
        decision === 'APPROVE' ? 'APPROVED' : decision === 'OBSERVE' ? 'OBSERVED' : 'REJECTED';
      await claim.save({ transaction });
      await logEvent(
        payment.id,
        decision === 'APPROVE' ? 'APPROVED' : decision === 'OBSERVE' ? 'OBSERVED' : 'REJECTED',
        actorId,
        {
          reason: reason?.trim() ?? null,
          operationCode: claim.operationCode,
          amount: Number(payment.amount),
          stage: payment.stage,
        },
        transaction,
      );
      await paymentNotifications.record(order, payment, decision === 'APPROVE' ? 'PAYMENT_APPROVED' : decision === 'OBSERVE' ? 'PAYMENT_OBSERVED' : 'PAYMENT_REJECTED', transaction, { reason: reason?.trim(), suffix: decision === 'OBSERVE' ? paymentNotifications.suffix(`${claim.submittedAt?.toISOString()}:${reason}`) : undefined });
      if (decision === 'OBSERVE') return;
      if (decision === 'APPROVE') {
        const excessBalance =
          payment.stage === PAYMENT_STAGE.BALANCE && Boolean(order.balancePaidAt);
        if (excessBalance)
          payment.safeResponseJson = { ...payment.safeResponseJson, directRefundRequired: true };
        payment.status = 'SUCCEEDED';
        payment.authorizedAt = new Date();
        payment.capturedAt = new Date();
        await payment.save({ transaction });
        if (['CANCELLED', 'REFUNDED'].includes(order.status)) return; // received money must be returned, never reopen a cancelled order
        if (payment.stage === PAYMENT_STAGE.BALANCE) {
          if (excessBalance) return; // Record late money for refund; do not collect the order balance twice.
          order.balancePaidAt = new Date();
          await order.save({ transaction });
          await cakeCommissionService.ensureForOrder(order, transaction);
        } else {
          await confirmPaidOrder(
            order,
            transaction,
            'CASHIER',
            `${payment.provider.toUpperCase()} verificado por caja`,
            payment,
          );
        }
      } else {
        payment.status = 'FAILED';
        payment.failedAt = new Date();
        payment.failureReason = reason!.trim();
        await payment.save({ transaction });
        if (order.status === 'PENDING_PAYMENT' && payment.stage !== PAYMENT_STAGE.BALANCE) {
          order.cancelReason = `Pago rechazado: ${reason!.trim()}`;
          await inventoryService.releaseForOrder(order, transaction);
          await ordersService.releaseReservations(order, transaction);
          await ordersService.changeStatus(order, 'CANCELLED', {
            actorId,
            source: 'CASHIER',
            comment: order.cancelReason,
            transaction,
          });
        }
      }
    });
    return directPaymentsService.detail(paymentId, { scopeCheck });
  },

  async evidence(
    paymentId: number,
    eventId: number,
    access: { userId?: number; scopeCheck?: (branchId: number) => void },
  ) {
    await directPaymentsService.detail(paymentId, access);
    const event = await MobilePaymentEvent.findOne({ where: { id: eventId, paymentId } });
    if (!event?.evidenceMime || !event.evidenceBytes)
      throw ApiError.notFound('Constancia no encontrada');
    return { mime: event.evidenceMime, bytes: event.evidenceBytes };
  },

  async openBalance(orderNumber: string, userId: number, provider: 'yape' | 'plin') {
    const snapshot = directPaymentsService.snapshot(
      provider,
      await settingsService.getLocalPaymentSettings(),
    );
    const paymentId = await sequelize.transaction(async (transaction) => {
      const order = await Order.findOne({
        where: { orderNumber },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!order) throw ApiError.notFound('Pedido no encontrado');
      assertOwner(order, userId);
      if (
        ['CANCELLED', 'REFUNDED', 'DELIVERED'].includes(order.status) ||
        order.paymentPlan !== 'DEPOSIT_BALANCE' ||
        !order.depositPaidAt ||
        order.balancePaidAt ||
        Number(order.balanceAmount) <= 0
      ) {
        throw ApiError.conflict('Este pedido no tiene un saldo pendiente que se pueda pagar');
      }
      const existing = await Payment.findOne({
        where: {
          payableType: PAYABLE_TYPE.ORDER,
          payableId: order.id,
          stage: PAYMENT_STAGE.BALANCE,
        },
        order: [['id', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (existing?.status === 'SUCCEEDED' && !await hasAdditionalBalance(order.id, existing.id, transaction)) throw ApiError.conflict('El saldo ya está pagado');
      if (existing && ['PENDING', 'CREATED'].includes(existing.status)) {
        if (!isDirectProvider(existing.provider))
          throw ApiError.conflict(
            'Ya existe un pago online abierto para este saldo. Termínalo antes de elegir otro medio.',
          );
        const claim = await MobilePaymentClaim.findOne({
          where: { paymentId: existing.id },
          transaction,
        });
        const priorSnapshot = snapshotOf(existing);
        if (
          holdsDirectReview(claim?.status) ||
          !priorSnapshot ||
          Date.now() < Date.parse(priorSnapshot.expiresAt)
        )
          return existing.id;
        existing.status = 'FAILED';
        existing.failedAt = new Date();
        existing.failureReason = 'Plazo para pagar el saldo vencido';
        await existing.save({ transaction });
        await logEvent(
          existing.id,
          'EXPIRED',
          null,
          { reason: existing.failureReason },
          transaction,
        );
      }
      return (
        await directPaymentsService.create(
          order,
          provider,
          snapshot,
          transaction,
          PAYMENT_STAGE.BALANCE,
        )
      ).id;
    });
    return directPaymentsService.detail(paymentId, { userId });
  },

  async recordRefund(
    paymentId: number,
    amount: number,
    reference: string,
    reason: string,
    actorId: number,
    scopeCheck: (branchId: number) => void,
  ) {
    await sequelize.transaction(async (transaction) => {
      const { order, payment } = await lockedPayment(paymentId, transaction);
      scopeCheck(order.branchId);
      if (payment.status !== 'SUCCEEDED')
        throw ApiError.conflict('Solo se registra la devolución de un pago confirmado');
      const prior = await Refund.findAll({
        where: { paymentId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (
        prior.some(
          (refund) =>
            refund.providerReference === reference.trim() && refund.status === 'SUCCEEDED',
        )
      )
        throw ApiError.conflict('Esta devolución ya fue registrada');
      const committed = prior
        .filter((refund) => ['PENDING', 'SUCCEEDED'].includes(refund.status))
        .reduce((sum, refund) => sum + Number(refund.amount), 0);
      if (amount <= 0 || round2(amount) > round2(Number(payment.amount) - committed))
        throw ApiError.badRequest('El importe supera lo disponible para devolver');
      await Refund.create(
        {
          paymentId,
          amount: round2(amount),
          providerReference: reference.trim(),
          reason: reason.trim(),
          approvedBy: actorId,
          status: 'SUCCEEDED',
        },
        { transaction },
      );
      await cakeCommissionService.applyRefund(paymentId, amount, transaction);
      await logEvent(
        paymentId,
        'REFUND_RECORDED',
        actorId,
        { amount, reference: reference.trim(), reason: reason.trim() },
        transaction,
      );
      await paymentNotifications.record(order, payment, 'PAYMENT_REFUNDED', transaction, { amount, reason, suffix: paymentNotifications.suffix(reference.trim()) });
      if (round2(committed + amount) === round2(Number(payment.amount))) {
        payment.status = 'REFUNDED';
        await payment.save({ transaction });
        const otherPaid = await Payment.count({
          where: {
            payableType: PAYABLE_TYPE.ORDER,
            payableId: order.id,
            status: 'SUCCEEDED',
            amount: { [Op.gt]: 0 },
            provider: { [Op.ne]: 'wallet' },
          },
          transaction,
        });
        if (order.status === 'CANCELLED' && !otherPaid)
          await ordersService.changeStatus(order, 'REFUNDED', {
            actorId,
            source: 'CASHIER',
            comment: reason.trim(),
            transaction,
          });
      }
    });
    return directPaymentsService.detail(paymentId, { scopeCheck });
  },
};
