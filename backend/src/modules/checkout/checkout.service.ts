import { randomUUID } from 'node:crypto';
import {
  experiencePricing,
  type ExperienceSelection,
} from '@modules/experiences/experience.pricing';
import crypto from 'node:crypto';
import { Op, Transaction } from 'sequelize';
import {
  Allergen,
  CakeProductProfile,
  CakeTheme,
  CakeDesignQuote,
  Coupon,
  CouponRedemption,
  DeliverySlot,
  District,
  Order,
  OrderDiscount,
  OrderItem,
  OrderItemCustomization,
  OrderStatusHistory,
  Payment,
  Product,
  User,
  sequelize,
} from '@database/models';
import { deriveIdempotencyKey } from '@shared/utils/idempotency';
import { round2 } from '@shared/utils/money';
import { allocateProportionally, splitTaxFromGross } from '@shared/utils/tax';
import { isValidDni, isValidRuc } from '@shared/utils/peruDocs';
import { REDEMPTION_STATUS } from '@database/models/couponRedemption.model';
import { DISCOUNT_SOURCE } from '@database/models/orderDiscount.model';
import { PAYABLE_TYPE, PAYMENT_STAGE } from '@database/models/payment.model';
import { MOBILE_PAYMENT_PROVIDER } from '@database/models/mobilePaymentClaim.model';
import { directPaymentsService } from '@modules/payments/directPayments.service';
import type { DirectPaymentSnapshot } from '@modules/payments/directPayments.logic';
import type { AddressSnapshot } from '@database/models/order.model';
import {
  BILLING_DOC_TYPE,
  DELIVERY_TYPE,
  DOCUMENT_TYPE,
  INVOICE_STATUS,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  SERVICE_MODE,
  WALLET_TX_TYPE,
  type DeliveryType,
  type DocumentType,
  type PaymentMethod,
  type ServiceMode,
} from '@config/constants';
import { env } from '@config/env';
import { ApiError } from '@shared/errors/ApiError';
import { whatsappRecipient } from '@shared/utils/whatsappPhone';
import { geoService } from '@modules/geo/geo.service';
import {
  pricingService,
  type OrderQuote,
  type QuoteItemInput,
} from '@modules/pricing/pricing.service';
import { getPaymentProvider } from '@integrations/payments';
import { walletService } from '@modules/plans/wallet.service';
import { confirmPaidOrder, openOrderCheckoutSession } from '@modules/payments/payments.service';
import { inventoryService } from '@modules/operations/inventory.service';
import { cakeProductionService, dayInLima } from '@modules/cakes/cakeProduction.service';
import { cakeDesignService } from '@modules/cakes/cakeDesign.service';
import { cakeFinanceService } from '@modules/cakes/cakeFinance.service';
import { ordersService } from '@modules/orders/orders.service';
import { settingsService } from '@modules/settings/settings.service';
import { checkoutTermsService } from '@modules/settings/checkoutTerms.service';
import { cakeOrderImagesService } from '@modules/cakes/cakeOrderImages.service';
import { buildOrderItemSnapshot } from './orderItemSnapshot';
import { carTransport } from '@modules/delivery/carTransport.service';

export interface CheckoutAddress {
  label?: string;
  line1: string;
  reference?: string | null;
  hasHouseNumber?: boolean;
  districtId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CheckoutInput {
  /** Trusted internal context for rescheduling an existing reservation. Never accepted from HTTP. */
  existingOrder?: Order;
  experience?: ExperienceSelection;
  items: QuoteItemInput[];
  deliveryType: DeliveryType;
  serviceMode: ServiceMode;
  address?: CheckoutAddress | null;
  branchId?: number | null;
  deliverySlotId?: number | null;
  couponCode?: string | null;
  /** El cliente decide si gasta el saldo de su plan en este pedido. */
  useWallet?: boolean;
  /** ONLINE = pasarela; YAPE/PLIN = transferencia directa. Por defecto ONLINE. */
  paymentMethod?: PaymentMethod;
  mobilePayment?: { operationCode: string; payerPhone?: string } | null;
  /** Canal confiable validado por el controlador; selecciona el retorno web o móvil. */
  client?: 'WEB' | 'MOBILE';
  /** Datos del comprobante (SUNAT). Boleta si no se envia. */
  billing?: {
    documentType: DocumentType;
    docNumber?: string;
    name?: string;
    address?: string;
  } | null;
  gift?: { recipientName: string; recipientPhone?: string; hidePrices: boolean; message?: string };
  contactName?: string | null;
  contactPhone?: string | null;
  whatsappOptIn?: boolean;
  termsAccepted?: boolean;
  termsVersion?: number;
  notes?: string | null;
  userId?: number | null;
  userEmail?: string | null;
  /** RN-015: dos clics en "Pagar" con la misma clave = un solo pedido. */
  idempotencyKey: string;
}

interface ResolvedDestination {
  branchId: number;
  branchName: string;
  coverageZoneId: number | null;
  addressSnapshot: AddressSnapshot | null;
  isOpenNow: boolean;
  etaMinutes: number;
  demandLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  etaSource: 'LIVE_ROUTE' | 'ESTIMATE';
  routeDistanceKm?: number;
  extraDeliveryFee?: number;
}

type CakePaymentPlan = {
  paymentPlan: 'FULL' | 'DEPOSIT_BALANCE';
  depositAmount: number;
  balanceAmount: number;
  balanceDueAt: Date | null;
};

const resolveCakePaymentPlan = async (
  items: QuoteItemInput[],
  total: number,
  deliverySlotId?: number | null,
  loadedProfiles?: CakeProductProfile[],
): Promise<CakePaymentPlan> => {
  const profiles =
    loadedProfiles ??
    (await CakeProductProfile.findAll({
      where: { productId: [...new Set(items.map((item) => item.productId))], isActive: true },
    }));
  const hasApprovedDesign = items.some(
    (item) =>
      item.designQuoteId && profiles.some((profile) => profile.productId === item.productId),
  );
  if (!hasApprovedDesign || total <= 0)
    return {
      paymentPlan: 'FULL',
      depositAmount: round2(total),
      balanceAmount: 0,
      balanceDueAt: null,
    };
  const depositAmount = round2(total * 0.5);
  const balanceAmount = round2(total - depositAmount);
  let balanceDueAt: Date | null = null;
  if (deliverySlotId) {
    const slot = await DeliverySlot.findByPk(deliverySlotId, { attributes: ['startsAt'] });
    if (slot) balanceDueAt = new Date(slot.startsAt.getTime() - 48 * 60 * 60_000);
  }
  return { paymentPlan: 'DEPOSIT_BALANCE', depositAmount, balanceAmount, balanceDueAt };
};

// round2 se importa de @shared/utils/money: un unico dueno para el redondeo del dinero.

const generateOrderNumber = (): string => {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomInt(1000, 9999);
  return `VB-${stamp}-${random}`;
};

/**
 * RN-001 / RN-002: la sucursal NO la elige el cliente. El servidor resuelve la
 * cobertura desde la direccion y asigna la cocina elegible.
 */
export const resolveDestination = async (input: CheckoutInput): Promise<ResolvedDestination> => {
  if (input.deliveryType === DELIVERY_TYPE.PICKUP) {
    if (!input.branchId) throw ApiError.badRequest('Elige el local donde vas a recoger');

    const branch = await geoService.getBranchOrFail(input.branchId);
    if (!branch.acceptsPickup) throw ApiError.unprocessable('Este local no acepta recojo');
    const isOpenNow = geoService.isBranchOpenNow(branch);

    return {
      branchId: branch.id,
      branchName: branch.name,
      coverageZoneId: null,
      addressSnapshot: null,
      isOpenNow,
      etaMinutes: branch.prepMinutes,
      demandLevel: 'LOW',
      etaSource: 'ESTIMATE',
    };
  }

  if (!input.address) throw ApiError.badRequest('Falta la direccion de entrega');
  if (input.address.latitude == null || input.address.longitude == null) {
    throw ApiError.badRequest('Marca la ubicacion exacta para calcular el delivery');
  }

  const coverage = await geoService.checkCoverage({
    districtId: input.address.districtId ?? undefined,
    latitude: input.address.latitude,
    longitude: input.address.longitude,
  });

  if (!coverage.covered || !coverage.branch || !coverage.zone) {
    throw ApiError.unprocessable(coverage.reason ?? 'No tenemos cobertura en esa direccion');
  }

  const district = input.address.districtId
    ? await District.findByPk(input.address.districtId)
    : null;

  return {
    branchId: coverage.branch.id,
    branchName: coverage.branch.name,
    coverageZoneId: coverage.zone.id,
    isOpenNow: coverage.branch.isOpenNow,
    etaMinutes: coverage.etaMinutes ?? coverage.branch.prepMinutes + coverage.zone.estimatedMinutes,
    demandLevel: coverage.demandLevel ?? 'LOW',
    etaSource: coverage.etaSource ?? 'ESTIMATE',
    routeDistanceKm: coverage.routeDistanceKm,
    extraDeliveryFee: coverage.extraDeliveryFee,
    addressSnapshot: {
      label: input.address.label ?? 'Entrega',
      line1: input.address.line1,
      reference: input.address.reference ?? null,
      districtId: input.address.districtId ?? null,
      districtName: district?.name ?? null,
      latitude: input.address.latitude ?? null,
      longitude: input.address.longitude ?? null,
    },
  };
};

/** RN-004: reserva un cupo de la franja dentro de la transaccion (evita sobreventa). */
const reserveSlot = async (
  slotId: number,
  branchId: number,
  transaction: Transaction,
): Promise<DeliverySlot> => {
  const slot = await DeliverySlot.findOne({
    where: { id: slotId, branchId, isActive: true },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!slot) throw ApiError.unprocessable('La franja elegida ya no existe');
  if (new Date() > slot.orderCutoffAt) throw ApiError.unprocessable('La franja ya cerro su venta');
  if (slot.availableCount <= 0) throw ApiError.unprocessable('Esa franja se quedo sin cupos');
  const branch = await geoService.getBranchOrFail(branchId);
  if (!geoService.slotWithinSchedule(branch, slot))
    throw ApiError.unprocessable(
      'La franja ya no coincide con el horario de atención de la sucursal. Elige otra fecha.',
    );

  slot.reservedCount += 1;
  await slot.save({ transaction });
  return slot;
};

const assertCakeSchedule = async (input: CheckoutInput, branchId: number): Promise<void> => {
  const digital = await experiencePricing.quote(input.experience);
  if (digital) {
    if (input.serviceMode !== 'SCHEDULED' || !input.deliverySlotId)
      throw ApiError.unprocessable('Elige una entrega programada para la experiencia QR.');
    const digitalSlot = await DeliverySlot.findByPk(input.deliverySlotId);
    if (
      !digitalSlot ||
      digitalSlot.startsAt.getTime() < Date.now() + digital.minLeadHours * 3600000
    )
      throw ApiError.unprocessable('El horario no cumple la anticipación del servicio digital.');
  }
  if (input.serviceMode === SERVICE_MODE.SCHEDULED && !input.deliverySlotId) {
    throw ApiError.unprocessable('Elige una fecha y franja para tu pedido');
  }
  if (input.serviceMode === SERVICE_MODE.SCHEDULED && input.deliverySlotId) {
    const selected = await DeliverySlot.findOne({
      where: { id: input.deliverySlotId, branchId, isActive: true },
    });
    const branch = await geoService.getBranchOrFail(branchId);
    if (
      !selected ||
      selected.orderCutoffAt <= new Date() ||
      selected.availableCount <= 0 ||
      !geoService.slotWithinSchedule(branch, selected)
    )
      throw ApiError.unprocessable(
        'La franja ya no tiene cupo o no coincide con el horario de la sucursal.',
      );
  }
  const cakeCount = await CakeProductProfile.count({
    where: { productId: { [Op.in]: input.items.map((item) => item.productId) }, isActive: true },
  });
  if (!cakeCount) return;
  if (input.serviceMode !== SERVICE_MODE.SCHEDULED || !input.deliverySlotId) {
    throw ApiError.unprocessable('Elige una fecha y franja para la torta');
  }
  const slot = await DeliverySlot.findOne({
    where: { id: input.deliverySlotId, branchId, isActive: true },
  });
  if (!slot || new Date() > slot.orderCutoffAt)
    throw ApiError.unprocessable('La franja elegida ya no esta disponible');
  const capacity = await cakeProductionService.availability(branchId, input.items, slot.startsAt);
  if (!capacity.available) {
    const missing = capacity.stations.find((entry) => !entry.available);
    throw ApiError.unprocessable(
      `No hay capacidad de ${missing?.station ?? 'produccion'} para el ${missing?.workDate ?? 'dia elegido'}`,
    );
  }
};

/** Alergenos declarados de cada producto, para el snapshot del pedido (RN-009, RN-017). */
const loadAllergenCodes = async (productIds: number[]): Promise<Map<number, string[]>> => {
  const products = await Product.findAll({
    where: { id: productIds },
    include: [{ model: Allergen, as: 'allergens', through: { attributes: [] } }],
  });

  const map = new Map<number, string[]>();
  products.forEach((product) => {
    const allergens = (product.get('allergens') as Allergen[] | undefined) ?? [];
    map.set(
      product.id,
      allergens.map((allergen) => allergen.code),
    );
  });
  return map;
};

export const checkoutService = {
  async availability(input: CheckoutInput) {
    const destination = await resolveDestination(input);
    const branch = await geoService.getBranchOrFail(destination.branchId);
    if (!input.existingOrder) await inventoryService.assertCartAvailability(branch.id, input.items);
    const profiles = await CakeProductProfile.findAll({
      where: { productId: input.items.map((item) => item.productId), isActive: true },
    });
    const themeIds = input.items.flatMap((item) => (item.themeId ? [item.themeId] : []));
    const themes = themeIds.length
      ? await CakeTheme.findAll({ where: { id: themeIds, isActive: true } })
      : [];
    const digital = await experiencePricing.quote(input.experience);
    const leadHours = Math.max(
      digital?.minLeadHours ?? 0,
      ...profiles.map((profile) => profile.minLeadHours),
      ...themes.map((theme) => theme.minLeadHours),
    );
    const days = Math.min(60, Math.max(45, Math.ceil(leadHours / 24) + 7));
    const reasons = new Map<string, string>();
    const needsCar = await carTransport.requiresCar(
      input.items.map((item) => item.productId),
      input.deliveryType,
    );
    if (needsCar && !(await carTransport.hasFleet(branch.id)))
      return {
        branchId: branch.id,
        slots: [],
        reasons: [
          {
            code: 'NO_CAR_FLEET',
            message:
              'Este taller todavía no tiene transporte en auto configurado. Puedes elegir recojo en taller.',
          },
        ],
        leadHours,
        days,
      };
    const candidates = await DeliverySlot.findAll({
      where: {
        branchId: branch.id,
        isActive: true,
        startsAt: { [Op.between]: [new Date(), new Date(Date.now() + days * 86400000)] },
        [Op.or]: [
          { orderCutoffAt: { [Op.gt]: new Date() } },
          ...(input.existingOrder?.deliverySlotId
            ? [{ id: input.existingOrder.deliverySlotId }]
            : []),
        ],
      },
      order: [['startsAt', 'ASC']],
    });
    if (!candidates.length)
      reasons.set(
        'NO_SLOTS',
        'La sucursal no tiene franjas de entrega programadas para este período.',
      );
    const slots: Array<{
      id: number;
      startsAt: Date;
      endsAt: Date;
      available: number;
      orderCutoffAt: Date;
    }> = [];
    const productionByDate = new Map<string, boolean>();
    for (const slot of candidates) {
      const ownSlot = input.existingOrder?.deliverySlotId === slot.id;
      if (!ownSlot && slot.startsAt.getTime() < Date.now() + leadHours * 3600000) {
        reasons.set('LEAD_TIME', `Este pedido requiere ${leadHours} horas de anticipación.`);
        continue;
      }
      if (!geoService.slotWithinSchedule(branch, slot)) {
        reasons.set(
          'BRANCH_HOURS',
          'Las franjas configuradas no coinciden con el horario de atención de la sucursal.',
        );
        continue;
      }
      if (slot.coverageZoneId && slot.coverageZoneId !== destination.coverageZoneId) {
        reasons.set('ZONE', 'No hay franjas habilitadas para tu zona en estas fechas.');
        continue;
      }
      if (slot.availableCount + (ownSlot ? 1 : 0) <= 0) {
        reasons.set('SLOT_CAPACITY', 'Se agotaron los cupos de las franjas configuradas.');
        continue;
      }
      let available = slot.availableCount + (ownSlot ? 1 : 0);
      if (needsCar) {
        available = Math.min(
          available,
          Math.max(
            0,
            Number(slot.carCapacity) -
              (await carTransport.booked(slot.id)) +
              (ownSlot && input.existingOrder?.deliveryVehicleType === 'CAR' ? 1 : 0),
          ),
        );
        if (available <= 0) {
          reasons.set(
            'CAR_CAPACITY',
            'No quedan cupos de entrega en auto. Puedes elegir recojo o consultar otra fecha.',
          );
          continue;
        }
      }
      if (profiles.length) {
        const date = input.items.some((item) => item.designQuoteId)
          ? slot.startsAt.toISOString()
          : dayInLima(slot.startsAt);
        let capacity = productionByDate.get(date);
        if (capacity === undefined) {
          try {
            const needs = await cakeProductionService.estimateOrder(input.items, slot.startsAt);
            const result = await cakeProductionService.availabilityForNeeds(
              branch.id,
              needs,
              input.existingOrder?.id,
            );
            capacity = result.available;
            if (!capacity)
              reasons.set(
                result.stations.some((item) => !item.configured)
                  ? 'PRODUCTION_UNCONFIGURED'
                  : 'PRODUCTION_CAPACITY',
                result.stations.some((item) => !item.configured)
                  ? 'Falta configurar la capacidad de producción para estas fechas.'
                  : 'La producción de estas fechas ya está comprometida.',
              );
          } catch (error) {
            if (!(error instanceof ApiError) || error.statusCode >= 500) throw error;
            capacity = false;
            reasons.set('PRODUCT_REQUIREMENTS', error.message);
          }
          productionByDate.set(date, capacity);
        }
        if (!capacity) continue;
      }
      slots.push({
        id: slot.id,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        available,
        orderCutoffAt: slot.orderCutoffAt,
      });
    }
    return {
      branchId: branch.id,
      slots,
      reasons: slots.length ? [] : [...reasons].map(([code, message]) => ({ code, message })),
      leadHours,
      days,
    };
  },
  /** Cotizacion previa: lo que el cliente ve antes de pagar (RN-007). */
  async quote(
    input: CheckoutInput,
  ): Promise<
    OrderQuote & {
      schedulePending: boolean;
      requiresScheduledDelivery: boolean;
      minimumLeadHours: number;
      branchId: number;
      branchName: string;
      isOpenNow: boolean;
      etaMinutes: number;
      demandLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      etaSource: 'LIVE_ROUTE' | 'ESTIMATE';
      routeDistanceKm?: number;
      extraDeliveryFee?: number;
    }
  > {
    const destination = await resolveDestination(input);
    await inventoryService.assertCartAvailability(destination.branchId, input.items);
    // El precio depende del carrito y la ubicación. La disponibilidad de una franja
    // se valida cuando se elige; place() siempre exige y revalida el horario.
    // Cotizar no solicita preparación inmediata. Incluso fuera de horario se puede
    // consultar el total y reservar una entrega. Las reglas vienen del catálogo,
    // también para carritos antiguos o reconstruidos que no guardaban estos datos.
    const profiles = await CakeProductProfile.findAll({
      where: { productId: [...new Set(input.items.map((item) => item.productId))], isActive: true },
    });
    const themeIds = input.items.flatMap((item) => (item.themeId ? [item.themeId] : []));
    const themes = themeIds.length
      ? await CakeTheme.findAll({
          where: {
            id: themeIds,
            productId: profiles.map((profile) => profile.productId),
            isActive: true,
          },
        })
      : [];
    const experienceQuote = await experiencePricing.quote(input.experience);
    const requiresScheduledDelivery = profiles.length > 0 || Boolean(experienceQuote);
    const minimumLeadHours = Math.max(
      experienceQuote?.minLeadHours ?? 0,
      ...profiles.map((profile) => profile.minLeadHours),
      ...themes.map((theme) => theme.minLeadHours),
    );
    const needsSchedule =
      requiresScheduledDelivery ||
      !destination.isOpenNow ||
      input.serviceMode === SERVICE_MODE.SCHEDULED;
    const schedulePending =
      needsSchedule && (input.serviceMode !== SERVICE_MODE.SCHEDULED || !input.deliverySlotId);
    if (!schedulePending) await assertCakeSchedule(input, destination.branchId);

    const quote = await pricingService.quoteOrder({
      items: input.items,
      experience: input.experience,
      branchId: destination.branchId,
      coverageZoneId: destination.coverageZoneId,
      extraDeliveryFee: destination.extraDeliveryFee,
      deliveryType: input.deliveryType,
      couponCode: input.couponCode,
      userId: input.userId,
      useWallet: input.useWallet,
    });

    const cakePlan = await resolveCakePaymentPlan(
      input.items,
      quote.grandTotal,
      input.deliverySlotId,
      profiles,
    );
    if (!schedulePending && quote.deliveryVehicleType === 'CAR') {
      const slot = await DeliverySlot.findOne({
        where: { id: input.deliverySlotId!, branchId: destination.branchId, isActive: true },
      });
      if (!slot)
        throw ApiError.unprocessable('Elige un horario disponible para la entrega en auto');
      await carTransport.assertSlot(
        slot,
        destination.branchId,
        undefined,
        destination.coverageZoneId,
      );
    }
    return {
      ...quote,
      ...cakePlan,
      schedulePending,
      requiresScheduledDelivery,
      minimumLeadHours,
      branchId: destination.branchId,
      branchName: destination.branchName,
      isOpenNow: destination.isOpenNow,
      etaMinutes: destination.etaMinutes,
      demandLevel: destination.demandLevel,
      etaSource: destination.etaSource,
      routeDistanceKm: destination.routeDistanceKm,
      extraDeliveryFee: destination.extraDeliveryFee,
    };
  },

  /**
   * Crea el pedido y abre el pago.
   * El pedido nace en PENDING_PAYMENT y NO se confirma aqui: solo el webhook
   * firmado del proveedor lo pasa a CONFIRMED (RN-014).
   */
  async place(input: CheckoutInput) {
    // La ruta ya exige sesion; esto lo vuelve a comprobar aqui porque de `userId`
    // dependen la idempotencia por dueno, el limite de usos del cupon y el saldo:
    // si algun dia se llamara al servicio desde otro sitio, debe fallar, no crear
    // un pedido huerfano.
    if (!input.userId) {
      throw ApiError.unauthorized('Inicia sesion para confirmar tu pedido');
    }
    if (input.paymentMethod === PAYMENT_METHOD.CASH) {
      throw ApiError.unprocessable(
        'El efectivo no está disponible en el checkout. Elige pago en línea, Yape o Plin.',
      );
    }
    if (input.whatsappOptIn) {
      const user = await User.findByPk(input.userId);
      if (!whatsappRecipient(user?.phone))
        throw ApiError.unprocessable(
          'Agrega un celular válido a tu perfil para recibir avisos por WhatsApp',
        );
    }

    // La clave que llega del cliente se deriva con su dueno y su ambito antes de
    // tocar la base: sin esto, el indice es global y una clave adivinada devuelve
    // el pedido de otra persona con su total y su enlace de pago.
    const idempotencyKey = deriveIdempotencyKey('order', input.userId, input.idempotencyKey);

    // RN-015: si esta clave ya creo un pedido, se devuelve el mismo (no se duplica).
    const existing = await Order.findOne({ where: { idempotencyKey } });
    if (existing) {
      const payment = await Payment.findOne({
        where: { payableType: PAYABLE_TYPE.ORDER, payableId: existing.id },
        order: [['id', 'DESC']],
      });

      return { order: existing, payment, checkoutUrl: payment?.checkoutUrl ?? null, reused: true };
    }

    const destination = await resolveDestination(input);
    if (input.serviceMode === SERVICE_MODE.ASAP && !destination.isOpenNow) {
      throw ApiError.unprocessable(
        'La sede está fuera de su horario de atención. Elige una fecha y franja para reservar tu pedido.',
      );
    }
    await inventoryService.assertCartAvailability(destination.branchId, input.items);
    await assertCakeSchedule(input, destination.branchId);

    const quote = await pricingService.quoteOrder({
      items: input.items,
      experience: input.experience,
      branchId: destination.branchId,
      coverageZoneId: destination.coverageZoneId,
      extraDeliveryFee: destination.extraDeliveryFee,
      deliveryType: input.deliveryType,
      couponCode: input.couponCode,
      userId: input.userId,
      useWallet: input.useWallet,
    });
    const cakePlan = await resolveCakePaymentPlan(
      input.items,
      quote.grandTotal,
      input.deliverySlotId,
    );

    if (!quote.meetsMinimum) {
      throw ApiError.unprocessable(
        `El pedido minimo para tu zona es S/ ${quote.minimumOrder.toFixed(2)}`,
      );
    }

    if (
      input.paymentMethod === PAYMENT_METHOD.ONLINE &&
      quote.grandTotal > 0 &&
      env.MERCADOPAGO_MODE === 'test' &&
      getPaymentProvider().name === 'mercadopago' &&
      input.userEmail &&
      !/^[^@\s]+@testuser\.com$/i.test(input.userEmail)
    ) {
      throw ApiError.unprocessable(
        'Para probar Mercado Pago, inicia sesión en Misky Challay con el correo de la cuenta compradora de prueba (@testuser.com)',
      );
    }

    const mobileProvider =
      input.paymentMethod === PAYMENT_METHOD.YAPE
        ? MOBILE_PAYMENT_PROVIDER.YAPE
        : input.paymentMethod === PAYMENT_METHOD.PLIN
          ? MOBILE_PAYMENT_PROVIDER.PLIN
          : null;
    let directSnapshot: DirectPaymentSnapshot | undefined;
    if (mobileProvider && quote.grandTotal > 0) {
      if (!input.userId)
        throw ApiError.unauthorized('Inicia sesión para registrar y seguir tu pago directo');
      const localPayments = await settingsService.getLocalPaymentSettings();
      directSnapshot = directPaymentsService.snapshot(mobileProvider, localPayments);
    }

    if (input.serviceMode === SERVICE_MODE.SCHEDULED && !input.deliverySlotId) {
      throw ApiError.badRequest('Elige una franja horaria para tu pedido programado');
    }

    // Comprobante: se normaliza y valida antes de crear el pedido. La factura exige
    // RUC valido y razon social; la boleta usa lo que haya (nombre de contacto) y pide
    // DNI a partir del umbral SUNAT.
    const receiptSettings = await settingsService.getReceiptSettings();
    const fiscalEnabled = receiptSettings.mode !== 'INTERNAL_ONLY';
    const documentType = fiscalEnabled
      ? (input.billing?.documentType ?? DOCUMENT_TYPE.BOLETA)
      : DOCUMENT_TYPE.BOLETA;
    const isInvoice = documentType === DOCUMENT_TYPE.FACTURA;
    const docNumber = fiscalEnabled ? input.billing?.docNumber?.trim() || null : null;
    const billing = {
      documentType,
      docType: isInvoice ? BILLING_DOC_TYPE.RUC : docNumber ? BILLING_DOC_TYPE.DNI : null,
      docNumber,
      name: (fiscalEnabled && isInvoice ? input.billing?.name : input.contactName) || null,
      address: (isInvoice ? input.billing?.address : null) || null,
    };

    // Defensa por si el body no paso por el refine de zod (cliente de API directo).
    if (
      fiscalEnabled &&
      isInvoice &&
      (!billing.docNumber || !isValidRuc(billing.docNumber) || !billing.name)
    ) {
      throw ApiError.badRequest('La factura necesita un RUC valido y la razon social');
    }
    if (fiscalEnabled && !isInvoice && billing.docNumber && !isValidDni(billing.docNumber)) {
      throw ApiError.badRequest('El DNI debe tener 8 digitos');
    }
    // El comprobante se emite por el valor total de la venta, no por lo que se cobra a
    // la tarjeta: el saldo (wallet) es un medio de pago, no un descuento. Sobre el umbral
    // SUNAT, la boleta debe identificar al comprador con DNI.
    const invoiceTotal = round2(quote.grandTotal + quote.walletAmount);
    if (
      fiscalEnabled &&
      !isInvoice &&
      invoiceTotal >= env.BOLETA_DNI_THRESHOLD &&
      !billing.docNumber
    ) {
      throw ApiError.badRequest(
        `Para una boleta de S/ ${invoiceTotal.toFixed(2)} o mas necesitamos tu DNI.`,
      );
    }

    const allergensByProduct = await loadAllergenCodes([
      ...new Set(input.items.map((item) => item.productId)),
    ]);

    // --- Transaccion: pedido + lineas + descuentos + reserva de cupo ---
    const order = await sequelize.transaction(async (transaction) => {
      const termsAcceptanceJson = await checkoutTermsService.accept(input, transaction);
      let scheduledAt: Date | null = null;

      if (input.serviceMode === SERVICE_MODE.SCHEDULED && input.deliverySlotId) {
        const slot = await reserveSlot(input.deliverySlotId, destination.branchId, transaction);
        if (quote.deliveryVehicleType === 'CAR')
          await carTransport.assertSlot(
            slot,
            destination.branchId,
            transaction,
            destination.coverageZoneId,
          );
        scheduledAt = slot.startsAt;
      }

      const created = await Order.create(
        {
          orderNumber: generateOrderNumber(),
          userId: input.userId ?? null,
          branchId: destination.branchId,
          coverageZoneId: destination.coverageZoneId,
          deliveryType: input.deliveryType,
          serviceMode: input.serviceMode,
          deliverySlotId: input.deliverySlotId ?? null,
          scheduledAt,
          status: ORDER_STATUS.PENDING_PAYMENT,
          addressSnapshotJson: destination.addressSnapshot,
          giftJson: input.gift ? { ...input.gift, token: randomUUID() } : null,
          contactName: input.gift?.recipientName ?? input.contactName ?? null,
          contactPhone: input.gift?.recipientPhone || input.contactPhone || null,
          whatsappOptInAt: input.whatsappOptIn ? new Date() : null,
          termsAcceptanceJson,
          subtotal: quote.subtotal,
          deliveryFee: quote.deliveryFee,
          deliveryVehicleType: quote.deliveryVehicleType ?? null,
          deliveryHandlingInstructions: quote.deliveryHandlingInstructions ?? null,
          discountTotal: quote.discountTotal,
          walletAmount: quote.walletAmount,
          taxRate: quote.taxRate,
          taxableBase: quote.taxableBase,
          taxTotal: quote.taxTotal,
          grandTotal: quote.grandTotal,
          paymentPlan: cakePlan.paymentPlan,
          depositAmount: cakePlan.depositAmount,
          balanceAmount: cakePlan.balanceAmount,
          balanceDueAt: cakePlan.balanceDueAt,
          currency: quote.currency,
          documentType: billing.documentType,
          billingDocType: billing.docType,
          billingDocNumber: billing.docNumber,
          billingName: billing.name,
          billingAddress: billing.address,
          invoiceStatus: INVOICE_STATUS.PENDING,
          notes: input.notes ?? null,
          idempotencyKey,
        },
        { transaction },
      );

      for (const source of input.items) {
        if (source.designQuoteId)
          await cakeDesignService.linkOrder(source.designQuoteId, created.id, transaction);
      }

      /* El descuento del pedido se reparte entre las lineas en proporcion a su importe.
       * Hasta ahora cada linea guardaba discountTotal: 0, asi que la suma de las lineas
       * no coincidia con lo cobrado y el detalle de una boleta no habria cuadrado.
       * El delivery no entra en el reparto: no es una linea de producto. */
      const lineDiscounts = allocateProportionally(
        quote.discountTotal,
        quote.items.map((line) => line.lineTotal),
      );

      // Lineas con snapshot inmutable (RN-017)
      for (let index = 0; index < quote.items.length; index += 1) {
        const line = quote.items[index];
        const source = input.items[index];
        const product = await Product.findByPk(line.productId, { transaction });

        const lineDiscount = lineDiscounts[index] ?? 0;
        const lineGross = round2(Math.max(0, line.lineTotal - lineDiscount));
        const lineTax = splitTaxFromGross(lineGross, quote.taxRate);
        const snapshot = buildOrderItemSnapshot(line);

        const item = await OrderItem.create(
          {
            orderId: created.id,
            productId: line.productId,
            variantId: line.variantId,
            designQuoteId: source?.designQuoteId ?? null,
            requestedServings: line.requestedServings ?? null,
            themeSnapshotJson: line.theme ?? null,
            productNameSnapshot: line.theme?.name ?? product?.name ?? 'Producto',
            variantNameSnapshot: snapshot.variantNameSnapshot,
            descriptionSnapshot: snapshot.descriptionSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            extrasTotal: line.extrasTotal,
            discountTotal: lineDiscount,
            lineTotal: line.lineTotal,
            taxableBase: lineTax.base,
            taxTotal: lineTax.tax,
            allergenSnapshotJson: source?.designQuoteId
              ? ((await CakeDesignQuote.findByPk(source.designQuoteId, { transaction }))
                  ?.allergenCodesJson ??
                allergensByProduct.get(line.productId) ??
                [])
              : [
                  ...new Set([
                    ...(allergensByProduct.get(line.productId) ?? []),
                    ...(line.theme?.allergens ?? []),
                    ...(line.allergenCodes ?? []),
                  ]),
                ],
            designDetailsJson: source?.designDetails
              ? { ...source.designDetails, originalInstructions: source.specialInstructions ?? '' }
              : null,
            specialInstructions: source?.designQuoteId
              ? null
              : [
                  source?.specialInstructions,
                  source?.designDetails?.inscription
                    ? 'Texto exacto: ' + source.designDetails.inscription
                    : '',
                  source?.designDetails?.occasion
                    ? 'Ocasión: ' + source.designDetails.occasion
                    : '',
                  source?.designDetails?.finish ? 'Acabado: ' + source.designDetails.finish : '',
                ]
                  .filter(Boolean)
                  .join('\n') || null,
          },
          { transaction },
        );

        if (source)
          await cakeOrderImagesService.save(item.id, source, product?.family, transaction);

        for (const selection of line.selections) {
          await OrderItemCustomization.create(
            {
              orderItemId: item.id,
              groupId: selection.groupId,
              groupNameSnapshot: selection.groupName,
              optionId: selection.optionId,
              optionNameSnapshot: selection.optionName,
              quantity: selection.quantity,
              priceDelta: selection.priceDelta,
              lineExtra: selection.lineExtra,
              cakeScaleWithServings: selection.cakeScaleWithServings,
            },
            { transaction },
          );
        }
      }

      if (quote.experience && input.experience) {
        const digitalTax = splitTaxFromGross(quote.experience.price, quote.taxRate);
        await OrderItem.create(
          {
            orderId: created.id,
            itemKind: 'EXPERIENCE',
            productId: null,
            variantId: null,
            productNameSnapshot: 'Experiencia QR · ' + quote.experience.name,
            descriptionSnapshot:
              quote.experience.description +
              ' · Vigencia: ' +
              quote.experience.validityDays +
              ' días · Revisiones: ' +
              quote.experience.revisionsIncluded,
            quantity: 1,
            unitPrice: quote.experience.price,
            lineTotal: quote.experience.price,
            taxableBase: digitalTax.base,
            taxTotal: digitalTax.tax,
          },
          { transaction },
        );
        await experiencePricing.create(
          created.id,
          input.experience,
          quote.experience,
          input.userId ?? null,
          transaction,
        );
      }

      // Descuentos explicados. Los de cupon ademas reservan el canje (RN-011).
      for (const discount of quote.discounts) {
        await OrderDiscount.create(
          {
            orderId: created.id,
            source:
              discount.source === 'COUPON' ? DISCOUNT_SOURCE.COUPON : DISCOUNT_SOURCE.PLAN_BENEFIT,
            referenceId: discount.couponId ?? discount.userPlanId ?? null,
            code: discount.code,
            description: discount.description,
            amount: discount.amount,
          },
          { transaction },
        );

        if (discount.source === 'COUPON' && discount.couponId) {
          const coupon = await Coupon.findByPk(discount.couponId, {
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
          if (!coupon?.isActive) throw ApiError.unprocessable('El cupón dejó de estar disponible');
          const reservedUses = await CouponRedemption.count({
            where: {
              couponId: coupon.id,
              status: { [Op.in]: [REDEMPTION_STATUS.RESERVED, REDEMPTION_STATUS.CONFIRMED] },
            },
            transaction,
          });
          if (coupon.usageLimit !== null && reservedUses >= coupon.usageLimit) {
            throw ApiError.unprocessable('El cupón alcanzó su límite de usos');
          }
          if (input.userId) {
            const userUses = await CouponRedemption.count({
              where: {
                couponId: coupon.id,
                userId: input.userId,
                status: { [Op.in]: [REDEMPTION_STATUS.RESERVED, REDEMPTION_STATUS.CONFIRMED] },
              },
              transaction,
            });
            if (userUses >= coupon.usageLimitPerUser)
              throw ApiError.unprocessable('Ya usaste este cupón');
          }
          await CouponRedemption.create(
            {
              couponId: discount.couponId,
              userId: input.userId ?? null,
              orderId: created.id,
              amount: discount.amount,
              status: REDEMPTION_STATUS.RESERVED,
            },
            { transaction },
          );
        }
      }

      // El saldo se DEBITA al crear el pedido, igual que el cupon y el stock: si el
      // pago falla o el pedido se cancela, se devuelve (RN-013).
      if (quote.walletAmount > 0 && input.userId) {
        await walletService.move(
          {
            userId: input.userId,
            type: WALLET_TX_TYPE.DEBIT,
            amount: quote.walletAmount,
            description: `Pedido ${created.orderNumber}`,
            idempotencyKey: `order-${created.id}-wallet-debit`,
            orderId: created.id,
          },
          transaction,
        );
      }

      await OrderStatusHistory.create(
        {
          orderId: created.id,
          fromStatus: null,
          toStatus: ORDER_STATUS.PENDING_PAYMENT,
          actorId: input.userId ?? null,
          source: 'CUSTOMER',
          comment: 'Pedido creado, esperando el pago',
        },
        { transaction },
      );

      // Reserva atómica durante 15 minutos mientras el cliente completa el pago.
      // El job de expiración la libera si el pedido permanece pendiente.
      await inventoryService.reserveForOrder(created, transaction, true);
      await cakeFinanceService.snapshotOrderEstimate(created, transaction);
      await cakeProductionService.reserveForOrder(created, input.items, transaction);

      if (mobileProvider && directSnapshot) {
        await directPaymentsService.create(
          created,
          mobileProvider,
          directSnapshot,
          transaction,
          undefined,
          input.mobilePayment ?? undefined,
        );
      }

      return created;
    });

    // --- Caso 1: el saldo cubrio TODO el pedido ---
    // No hay nada que cobrar, asi que no se pasa por Stripe. Igual se registra un
    // pago (provider "wallet") para que el pedido tenga su comprobante y su rastro.
    if (quote.grandTotal <= 0) {
      const walletPayment = await Payment.create({
        payableType: PAYABLE_TYPE.ORDER,
        payableId: order.id,
        userId: input.userId ?? null,
        provider: 'wallet',
        amount: 0,
        currency: quote.currency,
        status: PAYMENT_STATUS.SUCCEEDED,
        stage:
          cakePlan.paymentPlan === 'DEPOSIT_BALANCE' ? PAYMENT_STAGE.DEPOSIT : PAYMENT_STAGE.FULL,
        method: 'wallet',
        idempotencyKey,
        capturedAt: new Date(),
        authorizedAt: new Date(),
      });

      await sequelize.transaction(async (transaction) => {
        await confirmPaidOrder(
          order,
          transaction,
          'WALLET',
          `Pagado con el saldo del plan (S/ ${quote.walletAmount.toFixed(2)})`,
        );
      });

      return { order, payment: walletPayment, checkoutUrl: null, reused: false };
    }

    // The order and pending direct payment already exist atomically. Transfer comes next.
    if (mobileProvider) {
      const payment = await Payment.findOne({ where: { idempotencyKey } });
      return { order, payment, checkoutUrl: null, reused: false };
    }

    /*
     * --- Caso 4: queda un importe por cobrar -> pasarela ---
     *
     * Abrir la sesion es trabajo de `openOrderCheckoutSession`, el mismo contrato
     * que usa el reintento del cobro. Mientras vivieron dos copias, cualquier
     * cambio en las URLs de retorno, en el registro del PaymentAttempt o en el
     * tratamiento del fallo del proveedor habia que hacerlo dos veces, y el primer
     * pago y el reintento se desincronizaban. Aqui se queda solo lo propio del
     * checkout: crear el cobro y matar el pedido si no se pudo abrir.
     */
    const payment = await Payment.create({
      payableType: PAYABLE_TYPE.ORDER,
      payableId: order.id,
      userId: input.userId ?? null,
      provider: getPaymentProvider().name,
      amount:
        cakePlan.paymentPlan === 'DEPOSIT_BALANCE'
          ? cakePlan.depositAmount
          : round2(quote.grandTotal),
      stage:
        cakePlan.paymentPlan === 'DEPOSIT_BALANCE' ? PAYMENT_STAGE.DEPOSIT : PAYMENT_STAGE.FULL,
      currency: quote.currency,
      status: PAYMENT_STATUS.CREATED,
      idempotencyKey,
    });

    try {
      const checkoutUrl = await openOrderCheckoutSession(order, payment, {
        client: input.client,
        customerEmail: input.userEmail,
      });
      return { order, payment, checkoutUrl, reused: false };
    } catch (error) {
      // `openOrderCheckoutSession` ya dejo el cobro en FAILED con su motivo y su
      // PaymentAttempt: aqui solo queda matar el pedido recien nacido para que no
      // se quede reteniendo stock, cupo de franja, cupon y saldo sin poder pagarse.
      await sequelize.transaction(async (transaction) => {
        const locked = await Order.findByPk(order.id, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        if (!locked || locked.status !== ORDER_STATUS.PENDING_PAYMENT) return;
        locked.cancelReason = 'No se pudo iniciar el pago';
        await inventoryService.releaseForOrder(locked, transaction);
        await ordersService.releaseReservations(locked, transaction);
        await ordersService.changeStatus(locked, ORDER_STATUS.CANCELLED, {
          source: 'SYSTEM',
          comment: locked.cancelReason,
          transaction,
        });
      });
      throw error;
    }
  },

  /** Consulta de un cupon sin crear el pedido (para el input del checkout). */
  async previewCoupon(code: string): Promise<Coupon> {
    const coupon = await Coupon.findOne({
      where: { code: code.trim().toUpperCase(), isActive: true },
    });
    if (!coupon) throw ApiError.notFound('El cupon no existe');
    return coupon;
  },
};

export type CheckoutService = typeof checkoutService;
