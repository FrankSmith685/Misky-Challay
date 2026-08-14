import crypto from 'node:crypto';
import { Op, Transaction } from 'sequelize';
import {
  Allergen,
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
  MobilePaymentClaim,
  Product,
  sequelize,
} from '@database/models';
import { deriveIdempotencyKey } from '@shared/utils/idempotency';
import { round2 } from '@shared/utils/money';
import { allocateProportionally, splitTaxFromGross } from '@shared/utils/tax';
import { isValidDni, isValidRuc } from '@shared/utils/peruDocs';
import { REDEMPTION_STATUS } from '@database/models/couponRedemption.model';
import { DISCOUNT_SOURCE } from '@database/models/orderDiscount.model';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { MOBILE_PAYMENT_PROVIDER } from '@database/models/mobilePaymentClaim.model';
import type { AddressSnapshot } from '@database/models/order.model';
import {
  BILLING_DOC_TYPE,
  DELIVERY_TYPE,
  DOCUMENT_TYPE,
  INVOICE_STATUS,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_PROVIDER,
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
import { ordersService } from '@modules/orders/orders.service';
import { settingsService } from '@modules/settings/settings.service';
import { buildOrderItemSnapshot } from './orderItemSnapshot';

export interface CheckoutAddress {
  label?: string;
  line1: string;
  reference?: string | null;
  districtId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CheckoutInput {
  items: QuoteItemInput[];
  deliveryType: DeliveryType;
  serviceMode: ServiceMode;
  address?: CheckoutAddress | null;
  branchId?: number | null;
  deliverySlotId?: number | null;
  couponCode?: string | null;
  /** El cliente decide si gasta el saldo de su plan en este pedido. */
  useWallet?: boolean;
  /** ONLINE = pasarela; CASH = pago contra entrega. Por defecto ONLINE. */
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
  contactName?: string | null;
  contactPhone?: string | null;
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
}

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
const resolveDestination = async (input: CheckoutInput): Promise<ResolvedDestination> => {
  if (input.deliveryType === DELIVERY_TYPE.PICKUP) {
    if (!input.branchId) throw ApiError.badRequest('Elige el local donde vas a recoger');

    const branch = await geoService.getBranchOrFail(input.branchId);
    if (!branch.acceptsPickup) throw ApiError.unprocessable('Este local no acepta recojo');
    const isOpenNow = geoService.isBranchOpenNow(branch);
    if (input.serviceMode === SERVICE_MODE.ASAP && !isOpenNow) {
      throw ApiError.unprocessable('Esta tienda está cerrada ahora. Puedes programar tu pedido para la siguiente franja disponible');
    }

    return { branchId: branch.id, branchName: branch.name, coverageZoneId: null, addressSnapshot: null, isOpenNow, etaMinutes: branch.prepMinutes, demandLevel: 'LOW', etaSource: 'ESTIMATE' };
  }

  if (!input.address) throw ApiError.badRequest('Falta la direccion de entrega');

  const coverage = await geoService.checkCoverage({
    districtId: input.address.districtId ?? undefined,
    latitude: input.address.latitude ?? undefined,
    longitude: input.address.longitude ?? undefined,
  });

  if (!coverage.covered || !coverage.branch || !coverage.zone) {
    throw ApiError.unprocessable(coverage.reason ?? 'No tenemos cobertura en esa direccion');
  }
  if (input.serviceMode === SERVICE_MODE.ASAP && !coverage.branch.isOpenNow) {
    throw ApiError.unprocessable('La cocina asignada está cerrada ahora. Programa tu pedido para la siguiente franja disponible');
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

  slot.reservedCount += 1;
  await slot.save({ transaction });
  return slot;
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
  /** Cotizacion previa: lo que el cliente ve antes de pagar (RN-007). */
  async quote(input: CheckoutInput): Promise<OrderQuote & { branchId: number; branchName: string; isOpenNow: boolean; etaMinutes: number; demandLevel: 'LOW' | 'MEDIUM' | 'HIGH'; etaSource: 'LIVE_ROUTE' | 'ESTIMATE'; routeDistanceKm?: number }> {
    const destination = await resolveDestination(input);
    await inventoryService.assertCartAvailability(destination.branchId, input.items);

    const quote = await pricingService.quoteOrder({
      items: input.items,
      branchId: destination.branchId,
      coverageZoneId: destination.coverageZoneId,
      deliveryType: input.deliveryType,
      couponCode: input.couponCode,
      userId: input.userId,
      useWallet: input.useWallet,
    });

    return {
      ...quote,
      branchId: destination.branchId,
      branchName: destination.branchName,
      isOpenNow: destination.isOpenNow,
      etaMinutes: destination.etaMinutes,
      demandLevel: destination.demandLevel,
      etaSource: destination.etaSource,
      routeDistanceKm: destination.routeDistanceKm,
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
    await inventoryService.assertCartAvailability(destination.branchId, input.items);

    const quote = await pricingService.quoteOrder({
      items: input.items,
      branchId: destination.branchId,
      coverageZoneId: destination.coverageZoneId,
      deliveryType: input.deliveryType,
      couponCode: input.couponCode,
      userId: input.userId,
      useWallet: input.useWallet,
    });

    if (!quote.meetsMinimum) {
      throw ApiError.unprocessable(
        `El pedido minimo para tu zona es S/ ${quote.minimumOrder.toFixed(2)}`,
      );
    }

    // Guardas del pago contra entrega ANTES de crear nada: si se rechazan despues de
    // la transaccion, el pedido queda huerfano y el saldo del plan ya debitado.
    if (input.paymentMethod === PAYMENT_METHOD.CASH && quote.grandTotal > 0) {
      if (!env.COD_ENABLED) {
        throw ApiError.unprocessable('El pago contra entrega no esta disponible por ahora');
      }
      if (quote.grandTotal > env.COD_MAX_AMOUNT) {
        throw ApiError.unprocessable(
          `El pago contra entrega admite hasta S/ ${env.COD_MAX_AMOUNT.toFixed(2)}. Para montos mayores usa pago con tarjeta.`,
        );
      }
    }

    const mobileProvider = input.paymentMethod === PAYMENT_METHOD.YAPE
      ? MOBILE_PAYMENT_PROVIDER.YAPE
      : input.paymentMethod === PAYMENT_METHOD.PLIN
        ? MOBILE_PAYMENT_PROVIDER.PLIN
        : null;
    let normalizedOperationCode: string | null = null;
    if (mobileProvider && quote.grandTotal > 0) {
      const localPayments = await settingsService.getLocalPaymentSettings();
      const enabled = mobileProvider === MOBILE_PAYMENT_PROVIDER.YAPE
        ? localPayments.yapeEnabled
        : localPayments.plinEnabled;
      if (!enabled) throw ApiError.unprocessable(`${mobileProvider === 'yape' ? 'Yape' : 'Plin'} no esta disponible por ahora`);
      normalizedOperationCode = input.mobilePayment?.operationCode.trim().toUpperCase() ?? null;
      if (!normalizedOperationCode) throw ApiError.badRequest('Ingresa el codigo de operacion despues de pagar');
      const alreadyClaimed = await MobilePaymentClaim.findOne({
        where: { provider: mobileProvider, operationCode: normalizedOperationCode },
      });
      if (alreadyClaimed) throw ApiError.conflict('Ese codigo de operacion ya fue registrado');
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
      ? input.billing?.documentType ?? DOCUMENT_TYPE.BOLETA
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
    if (fiscalEnabled && isInvoice && (!billing.docNumber || !isValidRuc(billing.docNumber) || !billing.name)) {
      throw ApiError.badRequest('La factura necesita un RUC valido y la razon social');
    }
    if (fiscalEnabled && !isInvoice && billing.docNumber && !isValidDni(billing.docNumber)) {
      throw ApiError.badRequest('El DNI debe tener 8 digitos');
    }
    // El comprobante se emite por el valor total de la venta, no por lo que se cobra a
    // la tarjeta: el saldo (wallet) es un medio de pago, no un descuento. Sobre el umbral
    // SUNAT, la boleta debe identificar al comprador con DNI.
    const invoiceTotal = round2(quote.grandTotal + quote.walletAmount);
    if (fiscalEnabled && !isInvoice && invoiceTotal >= env.BOLETA_DNI_THRESHOLD && !billing.docNumber) {
      throw ApiError.badRequest(
        `Para una boleta de S/ ${invoiceTotal.toFixed(2)} o mas necesitamos tu DNI.`,
      );
    }

    const allergensByProduct = await loadAllergenCodes([
      ...new Set(input.items.map((item) => item.productId)),
    ]);

    // --- Transaccion: pedido + lineas + descuentos + reserva de cupo ---
    const order = await sequelize.transaction(async (transaction) => {
      let scheduledAt: Date | null = null;

      if (input.serviceMode === SERVICE_MODE.SCHEDULED && input.deliverySlotId) {
        const slot = await reserveSlot(input.deliverySlotId, destination.branchId, transaction);
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
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          subtotal: quote.subtotal,
          deliveryFee: quote.deliveryFee,
          discountTotal: quote.discountTotal,
          walletAmount: quote.walletAmount,
          taxRate: quote.taxRate,
          taxableBase: quote.taxableBase,
          taxTotal: quote.taxTotal,
          grandTotal: quote.grandTotal,
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
            productNameSnapshot: product?.name ?? 'Producto',
            variantNameSnapshot: snapshot.variantNameSnapshot,
            descriptionSnapshot: snapshot.descriptionSnapshot,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            extrasTotal: line.extrasTotal,
            discountTotal: lineDiscount,
            lineTotal: line.lineTotal,
            taxableBase: lineTax.base,
            taxTotal: lineTax.tax,
            nutritionSnapshotJson: line.nutrition,
            allergenSnapshotJson: allergensByProduct.get(line.productId) ?? [],
            specialInstructions: source?.specialInstructions ?? null,
          },
          { transaction },
        );

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
              nutritionSnapshotJson: null,
            },
            { transaction },
          );
        }
      }

      // Descuentos explicados. Los de cupon ademas reservan el canje (RN-011).
      for (const discount of quote.discounts) {
        await OrderDiscount.create(
          {
            orderId: created.id,
            source:
              discount.source === 'COUPON'
                ? DISCOUNT_SOURCE.COUPON
                : DISCOUNT_SOURCE.PLAN_BENEFIT,
            referenceId: discount.couponId ?? discount.userPlanId ?? null,
            code: discount.code,
            description: discount.description,
            amount: discount.amount,
          },
          { transaction },
        );

        if (discount.source === 'COUPON' && discount.couponId) {
          const coupon = await Coupon.findByPk(discount.couponId, { transaction, lock: transaction.LOCK.UPDATE });
          if (!coupon?.isActive) throw ApiError.unprocessable('El cupón dejó de estar disponible');
          const reservedUses = await CouponRedemption.count({
            where: { couponId: coupon.id, status: { [Op.in]: [REDEMPTION_STATUS.RESERVED, REDEMPTION_STATUS.CONFIRMED] } },
            transaction,
          });
          if (coupon.usageLimit !== null && reservedUses >= coupon.usageLimit) {
            throw ApiError.unprocessable('El cupón alcanzó su límite de usos');
          }
          if (input.userId) {
            const userUses = await CouponRedemption.count({
              where: { couponId: coupon.id, userId: input.userId, status: { [Op.in]: [REDEMPTION_STATUS.RESERVED, REDEMPTION_STATUS.CONFIRMED] } },
              transaction,
            });
            if (userUses >= coupon.usageLimitPerUser) throw ApiError.unprocessable('Ya usaste este cupón');
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

    // --- Caso 2: pago contra entrega ---
    // No hay cobro online: el pedido se acepta de una vez (entra a cocina) y el
    // efectivo se cobra al entregar. El pago queda PENDING hasta ese momento.
    // El tope y el interruptor ya se validaron antes de crear el pedido.
    if (input.paymentMethod === PAYMENT_METHOD.CASH) {
      const cashPayment = await Payment.create({
        payableType: PAYABLE_TYPE.ORDER,
        payableId: order.id,
        userId: input.userId ?? null,
        provider: PAYMENT_PROVIDER.CASH,
        method: PAYMENT_PROVIDER.CASH,
        amount: round2(quote.grandTotal),
        currency: quote.currency,
        status: PAYMENT_STATUS.PENDING,
        idempotencyKey,
      });

      await sequelize.transaction(async (transaction) => {
        await confirmPaidOrder(
          order,
          transaction,
          'CUSTOMER',
          `Pago contra entrega: cobrar S/ ${quote.grandTotal.toFixed(2)} al recibir`,
        );
      });

      return { order, payment: cashPayment, checkoutUrl: null, reused: false };
    }

    // --- Caso 3: Yape/Plin declarado por el cliente ---
    // Se reserva el pedido, pero NO entra a cocina hasta que Caja contraste el
    // codigo con el movimiento real y lo apruebe desde el panel.
    if (mobileProvider && normalizedOperationCode) {
      try {
        const localPayment = await sequelize.transaction(async (transaction) => {
          const payment = await Payment.create({
            payableType: PAYABLE_TYPE.ORDER,
            payableId: order.id,
            userId: input.userId ?? null,
            provider: mobileProvider,
            providerReference: normalizedOperationCode,
            method: mobileProvider,
            amount: round2(quote.grandTotal),
            currency: quote.currency,
            status: PAYMENT_STATUS.PENDING,
            idempotencyKey,
            safeResponseJson: { submittedAt: new Date().toISOString() },
          }, { transaction });
          await MobilePaymentClaim.create({
            paymentId: payment.id,
            provider: mobileProvider,
            operationCode: normalizedOperationCode,
            payerPhone: input.mobilePayment?.payerPhone?.trim() || null,
          }, { transaction });
          return payment;
        });
        return { order, payment: localPayment, checkoutUrl: null, reused: false };
      } catch (error) {
        // Una carrera con el mismo codigo no puede dejar un pedido reteniendo
        // stock, cupo, cupon o saldo.
        await sequelize.transaction(async (transaction) => {
          const locked = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
          if (!locked || locked.status !== ORDER_STATUS.PENDING_PAYMENT) return;
          await ordersService.releaseReservations(locked, transaction);
          await inventoryService.releaseForOrder(locked, transaction);
          locked.cancelReason = 'Codigo de operacion duplicado';
          await ordersService.changeStatus(locked, ORDER_STATUS.CANCELLED, {
            source: 'SYSTEM', comment: 'No se pudo registrar el pago movil', transaction,
          });
        });
        throw error;
      }
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
      amount: round2(quote.grandTotal),
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
        const locked = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
        if (!locked || locked.status !== ORDER_STATUS.PENDING_PAYMENT) return;
        locked.cancelReason = 'No se pudo iniciar el pago';
        await inventoryService.releaseForOrder(locked, transaction);
        await ordersService.releaseReservations(locked, transaction);
        await ordersService.changeStatus(locked, ORDER_STATUS.CANCELLED, {
          source: 'SYSTEM', comment: locked.cancelReason, transaction,
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
