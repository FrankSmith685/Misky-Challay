import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Op, type Transaction } from 'sequelize';
import {
  Order,
  OrderItem,
  CakeProductionTask,
  DeliverySlot,
  CoverageZone,
  Payment,
  Refund,
  KitchenTicket,
  sequelize,
} from '@database/models';
import { CustomerOrderCase, CustomerCarePolicy } from '@database/models/customerJourney.model';
import { ApiError } from '@shared/errors/ApiError';
import { carTransport } from '@modules/delivery/carTransport.service';
import { checkoutService, resolveDestination } from '@modules/checkout/checkout.service';
import { cakeProductionService } from '@modules/cakes/cakeProduction.service';
import { splitTaxFromGross } from '@shared/utils/tax';
import type { BranchScopeCheck } from '@shared/utils/scope';

const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\s-]{6,20}$/);
export const changeSchema = z.object({
  contactName: z.string().trim().min(2).max(120).optional(),
  contactPhone: phone.optional(),
  deliverySlotId: z.number().int().positive().optional(),
  address: z
    .object({
      label: z.string().max(50).optional(),
      line1: z.string().trim().min(5).max(200),
      reference: z.string().max(200).optional(),
      districtId: z.number().int().positive().optional(),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});
export const createCaseSchema = z.object({
  kind: z.enum(['SUPPORT', 'CHANGE']),
  text: z.string().trim().min(5).max(2000),
  changes: changeSchema.optional(),
  requestKey: z.string().uuid(),
});
export const caseActionSchema = z.object({
  version: z.number().int().positive(),
  action: z.enum(['MESSAGE', 'PROPOSE', 'ACCEPT', 'REJECT', 'CLOSE']),
  text: z.string().trim().max(2000).default(''),
  changes: changeSchema.optional(),
});

async function authorizedOrder(
  number: string,
  userId: number,
  scope?: BranchScopeCheck,
  transaction?: Transaction,
) {
  const order = await Order.findOne({
    where: { orderNumber: number },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!order) throw ApiError.notFound('Pedido no encontrado');
  if (scope) scope(order.branchId);
  else if (order.userId !== userId) throw ApiError.forbidden('Este pedido no es tuyo');
  return order;
}
async function assertChangeable(order: Order, transaction?: Transaction) {
  if (
    !['PENDING_PAYMENT', 'CONFIRMED'].includes(order.status) ||
    (await CakeProductionTask.count({
      where: { orderId: order.id, startedAt: { [Op.ne]: null } },
      transaction,
    }))
  )
    throw ApiError.conflict(
      'La preparación ya comenzó o el pedido no está activo. El equipo debe revisar tu solicitud.',
    );
}
async function priceChange(
  order: Order,
  input: z.infer<typeof changeSchema>,
  transaction?: Transaction,
  forceAvailability = false,
) {
  await assertChangeable(order, transaction);
  const items = await OrderItem.findAll({
    where: { orderId: order.id },
    include: [{ association: 'customizations' }],
    transaction,
  });
  const lines = items.map((item) => ({
    productId: item.productId!,
    variantId: item.variantId!,
    quantity: item.quantity,
    requestedServings: item.requestedServings ?? undefined,
    designQuoteId: item.designQuoteId ?? undefined,
    themeId: item.themeSnapshotJson?.id,
    themeVersion: item.themeSnapshotJson?.version,
    selections: (item.customizations ?? []).map((entry) => ({
      optionId: entry.optionId!,
      quantity: entry.quantity,
    })),
  }));
  if (
    (input.address || input.deliverySlotId) &&
    items.some((item) => !item.productId || !item.variantId)
  )
    throw ApiError.conflict('El catálogo de este pedido requiere revisión del equipo.');
  if (input.address && order.deliveryType !== 'DELIVERY')
    throw ApiError.unprocessable(
      'El pedido es para recojo. Solicita al equipo un cambio de modalidad.',
    );
  if (!forceAvailability && !input.address && !input.deliverySlotId)
    return {
      lines,
      newFee: Number(order.deliveryFee),
      cakeDeliveryFee: Number(order.cakeDeliveryFee ?? 0),
      delta: 0,
      changes: input,
      destination: null,
      slots: [],
    };
  const quoteInput = {
    existingOrder: order,
    items: lines,
    deliveryType: order.deliveryType,
    serviceMode: 'ASAP' as const,
    address: input.address ?? order.addressSnapshotJson,
    branchId: order.branchId,
    useWallet: false,
    userId: order.userId,
    idempotencyKey: 'change-preview',
  };
  const availability = await checkoutService.availability(quoteInput);
  if (availability.branchId !== order.branchId)
    throw ApiError.unprocessable(
      'La nueva dirección corresponde a otra sede. El equipo debe coordinar un pedido de reemplazo.',
    );
  if (
    input.deliverySlotId &&
    (!forceAvailability || input.deliverySlotId !== order.deliverySlotId) &&
    !availability.slots.some((slot) => slot.id === input.deliverySlotId)
  )
    throw ApiError.conflict('La nueva franja ya no tiene capacidad disponible.');
  const destination = input.address ? await resolveDestination(quoteInput) : null;
  const zone = destination?.coverageZoneId
    ? await CoverageZone.findByPk(destination.coverageZoneId)
    : null;
  if (destination && (!zone || Number(order.subtotal) < Number(zone.minimumOrder)))
    throw ApiError.unprocessable('El pedido no cumple el mínimo de la nueva zona.');
  const requiresCar = await carTransport.requiresCar(
    lines.map((line) => line.productId),
    order.deliveryType,
  );
  const cakeDeliveryFee = destination && zone
    ? requiresCar ? Math.max(0, Number(zone.cakeDeliveryFee ?? 0)) : 0
    : Number(order.cakeDeliveryFee ?? 0);
  const newFee =
    destination && zone
      ? Math.round(
          (Number(zone.deliveryFee) + cakeDeliveryFee + Math.max(0, destination.extraDeliveryFee ?? 0)) * 100,
        ) / 100
      : Number(order.deliveryFee);
  const delta = Math.round((newFee - Number(order.deliveryFee)) * 100) / 100;
  if (
    delta !== 0 &&
    (await Payment.count({
      where: {
        payableType: 'ORDER',
        payableId: order.id,
        stage: 'BALANCE',
        status: ['CREATED', 'PENDING'],
      },
      transaction,
    }))
  )
    throw ApiError.conflict(
      'Termina o resuelve primero el pago de saldo que ya está abierto antes de cambiar el importe.',
    );
  if (delta !== 0 && (order.status !== 'CONFIRMED' || order.invoiceStatus === 'ISSUED'))
    throw ApiError.conflict(
      'El ajuste requiere revisar primero el pago pendiente o el comprobante emitido con el equipo.',
    );
  if (
    input.address &&
    order.deliverySlotId &&
    !input.deliverySlotId &&
    !availability.slots.some((slot) => slot.id === order.deliverySlotId)
  )
    throw ApiError.conflict(
      'La franja actual no atiende la nueva dirección. Elige una franja compatible.',
    );
  return { lines, newFee, cakeDeliveryFee, delta, changes: input, destination, slots: availability.slots };
}

export const customerJourneyService = {
  async changeOptions(
    number: string,
    userId: number,
    address?: z.infer<typeof changeSchema>['address'],
    scope?: BranchScopeCheck,
  ) {
    const order = await authorizedOrder(number, userId, scope);
    const preview = await priceChange(
      order,
      { address, ...(address ? { deliverySlotId: order.deliverySlotId ?? undefined } : {}) },
      undefined,
      true,
    );
    return { slots: preview.slots, priceDifference: preview.delta };
  },
  async list(number: string, userId: number, scope?: BranchScopeCheck) {
    const order = await authorizedOrder(number, userId, scope);
    const [cases, care] = await Promise.all([
      CustomerOrderCase.findAll({
        where: { orderId: order.id },
        order: [['id', 'ASC']],
        limit: 100,
      }),
      CustomerCarePolicy.findByPk(1),
    ]);
    const items = await OrderItem.findAll({
      where: { orderId: order.id },
      attributes: ['productId', 'productNameSnapshot'],
    });
    return {
      cases,
      care: {
        version: care?.version ?? 0,
        content: care?.content ?? '',
        products: items
          .map((item) => ({
            name: item.productNameSnapshot,
            instructions: care?.productInstructionsJson[String(item.productId)] ?? '',
          }))
          .filter((item) => item.instructions),
      },
      gift: order.giftJson,
    };
  },
  async create(number: string, userId: number, raw: z.infer<typeof createCaseSchema>) {
    const input = createCaseSchema.parse(raw);
    return sequelize.transaction(async (transaction) => {
      const order = await authorizedOrder(number, userId, undefined, transaction);
      const existing = await CustomerOrderCase.findAll({
        where: { orderId: order.id },
        transaction,
      });
      const reused = existing.find((entry) => entry.payloadJson.requestKey === input.requestKey);
      if (reused) return reused;
      if (existing.filter((entry) => !['CLOSED', 'REJECTED'].includes(entry.status)).length >= 10)
        throw ApiError.conflict('Continúa una de tus consultas abiertas antes de iniciar otra.');
      const preview =
        input.kind === 'CHANGE'
          ? await priceChange(order, changeSchema.parse(input.changes ?? {}), transaction)
          : null;
      return CustomerOrderCase.create(
        {
          orderId: order.id,
          userId,
          branchId: order.branchId,
          kind: input.kind,
          payloadJson: {
            requestKey: input.requestKey,
            changes: preview?.changes,
            priceDifference: preview?.delta ?? 0,
            changeSummary: preview
              ? {
                  scheduledAt:
                    preview.slots.find((slot) => slot.id === preview.changes.deliverySlotId)
                      ?.startsAt ?? order.scheduledAt,
                  contactName: preview.changes.contactName ?? order.contactName,
                  contactPhone: preview.changes.contactPhone ?? order.contactPhone,
                  addressLine: preview.changes.address?.line1 ?? order.addressSnapshotJson?.line1,
                  deliveryFee: preview.newFee,
                  cakeDeliveryFee: preview.cakeDeliveryFee,
                }
              : null,
          },
          messagesJson: [
            {
              id: randomUUID(),
              author: 'CUSTOMER',
              text: input.text,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        { transaction },
      );
    });
  },
  async act(
    number: string,
    caseId: number,
    userId: number,
    raw: z.infer<typeof caseActionSchema>,
    scope?: BranchScopeCheck,
  ) {
    const input = caseActionSchema.parse(raw);
    return sequelize.transaction(async (transaction) => {
      const order = await authorizedOrder(number, userId, scope, transaction);
      const entry = await CustomerOrderCase.findOne({
        where: { id: caseId, orderId: order.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!entry) throw ApiError.notFound('Consulta no encontrada');
      if (entry.version !== input.version)
        throw ApiError.conflict('La consulta cambió. Actualiza antes de responder.');
      if (['CLOSED', 'REJECTED'].includes(entry.status))
        throw ApiError.conflict('La consulta ya se cerró. Abre una nueva si necesitas más ayuda.');
      const staff = Boolean(scope);
      if (input.action === 'PROPOSE') {
        if (!staff || input.text.length < 5)
          throw ApiError.forbidden(
            'Solo el equipo puede publicar una propuesta con sus condiciones.',
          );
        if (entry.kind === 'DESIGN') await assertChangeable(order, transaction);
        const preview =
          entry.kind === 'CHANGE'
            ? await priceChange(
                order,
                input.changes ?? changeSchema.parse(entry.payloadJson.changes),
                transaction,
              )
            : null;
        const payments =
          preview && preview.delta < 0
            ? await Payment.findAll({
                where: { payableType: 'ORDER', payableId: order.id },
                attributes: ['id'],
                transaction,
              })
            : [];
        const refundBaseline = payments.length
          ? Number(
              (await Refund.sum('amount', {
                where: { paymentId: payments.map((payment) => payment.id), status: 'SUCCEEDED' },
                transaction,
              })) ?? 0,
            )
          : 0;
        entry.payloadJson = {
          ...entry.payloadJson,
          changes: preview?.changes,
          priceDifference: preview?.delta ?? 0,
          proposedOrderUpdatedAt: order.updatedAt.toISOString(),
          proposal: input.text,
          proposedBy: userId,
          refundBaseline,
          proposalVersion: entry.version + 1,
          changeSummary: preview
            ? {
                scheduledAt:
                  preview.slots.find((slot) => slot.id === preview.changes.deliverySlotId)
                    ?.startsAt ?? order.scheduledAt,
                contactName: preview.changes.contactName ?? order.contactName,
                contactPhone: preview.changes.contactPhone ?? order.contactPhone,
                addressLine: preview.changes.address?.line1 ?? order.addressSnapshotJson?.line1,
                deliveryFee: preview.newFee,
                cakeDeliveryFee: preview.cakeDeliveryFee,
              }
            : null,
        };
        entry.status = 'AWAITING_CUSTOMER';
      } else if (input.action === 'ACCEPT') {
        if (staff || entry.status !== 'AWAITING_CUSTOMER')
          throw ApiError.conflict('Solo el cliente puede aceptar la propuesta vigente.');
        if (entry.kind === 'DESIGN') await assertChangeable(order, transaction);
        if (entry.kind === 'CHANGE') {
          if (entry.payloadJson.proposedOrderUpdatedAt !== order.updatedAt.toISOString())
            throw ApiError.conflict('El pedido cambió. Pide al equipo una propuesta actualizada.');
          const preview = await priceChange(
            order,
            changeSchema.parse(entry.payloadJson.changes),
            transaction,
          );
          if (preview.delta !== Number(entry.payloadJson.priceDifference))
            throw ApiError.conflict('El costo cambió. Pide una nueva propuesta.');
          const pendingBalance =
            order.paymentPlan === 'DEPOSIT_BALANCE' && !order.balancePaidAt
              ? Number(order.balanceAmount)
              : 0;
          const refundNeeded = Math.max(0, -preview.delta - pendingBalance);
          if (refundNeeded > 0) {
            const payments = await Payment.findAll({
              where: { payableType: 'ORDER', payableId: order.id },
              attributes: ['id'],
              transaction,
            });
            const completed = Number(
              (await Refund.sum('amount', {
                where: { paymentId: payments.map((payment) => payment.id), status: 'SUCCEEDED' },
                transaction,
              })) ?? 0,
            );
            if (completed + 0.001 < Number(entry.payloadJson.refundBaseline ?? 0) + refundNeeded)
              throw ApiError.conflict(
                'Caja debe completar la devolución indicada en la propuesta antes de aplicar el cambio.',
              );
          }
          const before = {
            scheduledAt: order.scheduledAt,
            deliverySlotId: order.deliverySlotId,
            address: order.addressSnapshotJson,
            contactName: order.contactName,
            contactPhone: order.contactPhone,
            grandTotal: order.grandTotal,
            deliveryFee: order.deliveryFee,
            cakeDeliveryFee: order.cakeDeliveryFee,
          };
          const changes = preview.changes;
          if (changes.deliverySlotId && changes.deliverySlotId !== order.deliverySlotId) {
            const ids = [order.deliverySlotId, changes.deliverySlotId]
              .filter((id): id is number => Boolean(id))
              .sort((a, b) => a - b);
            const slots = await DeliverySlot.findAll({
              where: { id: ids },
              order: [['id', 'ASC']],
              transaction,
              lock: transaction.LOCK.UPDATE,
            });
            const old = slots.find((slot) => slot.id === order.deliverySlotId);
            const next = slots.find((slot) => slot.id === changes.deliverySlotId);
            if (
              !next ||
              !next.isActive ||
              next.branchId !== order.branchId ||
              next.orderCutoffAt <= new Date() ||
              next.reservedCount + next.confirmedCount >= next.capacity
            )
              throw ApiError.conflict('La franja ya no está disponible.');
            if (order.deliveryVehicleType === 'CAR')
              await carTransport.assertSlot(
                next,
                order.branchId,
                transaction,
                preview.destination?.coverageZoneId ?? order.coverageZoneId,
              );
            await cakeProductionService.releaseForOrder(order, transaction);
            const counter = order.status === 'CONFIRMED' ? 'confirmedCount' : 'reservedCount';
            if (old)
              await old.update({ [counter]: Math.max(0, old[counter] - 1) }, { transaction });
            await next.update({ [counter]: next[counter] + 1 }, { transaction });
            order.deliverySlotId = next.id;
            const dueOffset =
              order.scheduledAt && order.balanceDueAt
                ? order.scheduledAt.getTime() - order.balanceDueAt.getTime()
                : 0;
            order.scheduledAt = next.startsAt;
            if (order.balanceDueAt)
              order.balanceDueAt = new Date(next.startsAt.getTime() - Math.max(0, dueOffset));
            await cakeProductionService.reserveForOrder(order, preview.lines, transaction);
            if (order.status === 'CONFIRMED') {
              await CakeProductionTask.destroy({
                where: { orderId: order.id, startedAt: null },
                transaction,
              });
              await cakeProductionService.confirmForOrder(order, transaction);
            }
            await KitchenTicket.update(
              { targetAt: next.startsAt },
              { where: { orderId: order.id, startedAt: null }, transaction },
            );
          }
          if (changes.address) {
            order.addressSnapshotJson = preview.destination?.addressSnapshot ?? {
              label: changes.address.label ?? 'Entrega',
              ...changes.address,
            };
            order.coverageZoneId = preview.destination?.coverageZoneId ?? order.coverageZoneId;
          }
          if (changes.contactName) order.contactName = changes.contactName;
          if (changes.contactPhone) order.contactPhone = changes.contactPhone;
          if (preview.delta !== 0) {
            order.deliveryFee = preview.newFee;
            order.grandTotal = Math.round((Number(order.grandTotal) + preview.delta) * 100) / 100;
            const tax = splitTaxFromGross(
              Number(order.grandTotal) + Number(order.walletAmount),
              Number(order.taxRate),
            );
            order.taxTotal = tax.tax;
            order.taxableBase = tax.base;
            if (preview.delta > 0) {
              if (order.paymentPlan !== 'DEPOSIT_BALANCE') {
                order.depositAmount = Number(order.grandTotal) - preview.delta;
                order.depositPaidAt = order.confirmedAt;
              }
              order.paymentPlan = 'DEPOSIT_BALANCE';
              order.balanceAmount = pendingBalance + preview.delta;
              order.balancePaidAt = null;
              order.balanceDueAt = order.scheduledAt;
            } else if (pendingBalance > 0) {
              order.balanceAmount = Math.max(0, pendingBalance + preview.delta);
              if (!order.balanceAmount) order.balancePaidAt = new Date();
            }
          }
          order.cakeDeliveryFee = preview.cakeDeliveryFee;
          const priorBalance =
            preview.delta > 0
              ? await Payment.findOne({
                  where: { payableType: 'ORDER', payableId: order.id, stage: 'BALANCE' },
                  order: [['id', 'DESC']],
                  transaction,
                })
              : null;
          await order.save({ transaction });
          entry.payloadJson = {
            ...entry.payloadJson,
            before,
            priorBalancePaymentId: priorBalance?.id ?? null,
            appliedAt: new Date().toISOString(),
            additionalBalance: preview.delta,
          };
        }
        entry.payloadJson = {
          ...entry.payloadJson,
          agreements: [
            ...(Array.isArray(entry.payloadJson.agreements) ? entry.payloadJson.agreements : []),
            {
              proposalVersion: entry.payloadJson.proposalVersion ?? entry.version,
              acceptedAt: new Date().toISOString(),
              acceptedBy: userId,
              proposal: entry.payloadJson.proposal,
              changeSummary: entry.payloadJson.changeSummary,
              changes: entry.payloadJson.changes,
              priceDifference: entry.payloadJson.priceDifference,
            },
          ],
        };
        entry.status = 'ACCEPTED';
      } else if (input.action === 'REJECT') entry.status = 'REJECTED';
      else if (input.action === 'CLOSE') {
        if (!staff) throw ApiError.forbidden('El equipo debe cerrar la atención.');
        entry.status = 'CLOSED';
      } else if (!input.text) throw ApiError.badRequest('Escribe tu respuesta.');
      if (entry.messagesJson.length >= 200)
        throw ApiError.conflict('Esta consulta alcanzó su límite. Abre una nueva.');
      entry.messagesJson = [
        ...entry.messagesJson,
        {
          id: randomUUID(),
          author: staff ? 'STAFF' : 'CUSTOMER',
          text:
            input.text ||
            (input.action === 'ACCEPT' ? 'Propuesta aceptada.' : 'Propuesta rechazada.'),
          createdAt: new Date().toISOString(),
        },
      ];
      entry.version += 1;
      await entry.save({ transaction });
      return entry;
    });
  },
  async proposeDesign(number: string, userId: number, text: string, scope: BranchScopeCheck) {
    if (text.trim().length < 5 || text.length > 2000)
      throw ApiError.badRequest('Describe el diseño final en 5 a 2000 caracteres.');
    return sequelize.transaction(async (transaction) => {
      const order = await authorizedOrder(number, userId, scope, transaction);
      await assertChangeable(order, transaction);
      if (!order.userId) throw ApiError.unprocessable('Este pedido no tiene cuenta de cliente.');
      await CustomerOrderCase.update(
        { status: 'REJECTED' },
        {
          where: { orderId: order.id, kind: 'DESIGN', status: 'AWAITING_CUSTOMER' },
          transaction,
          individualHooks: true,
        },
      );
      return CustomerOrderCase.create(
        {
          orderId: order.id,
          userId: order.userId,
          branchId: order.branchId,
          kind: 'DESIGN',
          status: 'AWAITING_CUSTOMER',
          payloadJson: { proposal: text.trim(), proposedBy: userId },
          messagesJson: [
            {
              id: randomUUID(),
              author: 'STAFF',
              text: text.trim(),
              createdAt: new Date().toISOString(),
            },
          ],
        },
        { transaction },
      );
    });
  },
};
