import crypto from 'crypto';
import { Op, type Transaction } from 'sequelize';
import {
  Branch,
  CakeProductProfile,
  Coupon,
  CouponRedemption,
  DiningOffering,
  DiningOrderRequest,
  DiningTable,
  KitchenTicket,
  Order,
  OrderDiscount,
  OrderItem,
  OrderItemCustomization,
  OrderStatusHistory,
  Payment,
  MobilePaymentClaim,
  Product,
  ProductVariant,
  User,
  sequelize,
} from '@database/models';
import { PAYABLE_TYPE } from '@database/models/payment.model';
import { DISCOUNT_SOURCE } from '@database/models/orderDiscount.model';
import { REDEMPTION_STATUS } from '@database/models/couponRedemption.model';
import { TICKET_STATUS } from '@database/models/kitchenTicket.model';
import {
  BILLING_DOC_TYPE,
  DELIVERY_TYPE,
  DOCUMENT_TYPE,
  INVOICE_STATUS,
  ORDER_SOURCE,
  ORDER_STATUS,
  PAYMENT_PROVIDER,
  PAYMENT_STATUS,
  PERMISSIONS,
  PUSH_CHANNEL,
  PUSH_TEMPLATE,
  SERVICE_MODE,
  type BillingDocType,
  type DocumentType,
} from '@config/constants';
import { PRODUCT_TYPE } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { round2 } from '@shared/utils/money';
import { splitTaxFromGross } from '@shared/utils/tax';
import { pricingService, type OrderQuote, type QuoteItemInput } from '@modules/pricing/pricing.service';
import { catalogService } from '@modules/catalog/catalog.service';
import { inventoryService } from './inventory.service';
import { publishKitchenEvent } from './kitchenEvents';
import { kitchenPushService } from './kitchenPush.service';
import { confirmPaidOrder } from '@modules/payments/payments.service';
import { directPaymentsService } from '@modules/payments/directPayments.service';
import { ordersService } from '@modules/orders/orders.service';
import { settingsService } from '@modules/settings/settings.service';
import { RECEIPT_MODE } from '@database/models/receiptSetting.model';
import { buildOrderItemSnapshot } from '@modules/checkout/orderItemSnapshot';
import { operationsService } from './operations.service';
import { sendMobilePushToStaff } from '@modules/notifications/mobilePush.service';

const OPEN_STATUSES = [ORDER_STATUS.CONFIRMED, ORDER_STATUS.PREPARING, ORDER_STATUS.READY] as const;
const ADDABLE_TICKET_STATUSES = [TICKET_STATUS.QUEUED, TICKET_STATUS.ACCEPTED] as const;

/**
 * Cuanto tiempo una peticion de mesa repetida se considera el mismo reintento.
 * Diez minutos cubre de sobra una red mala; pasado ese plazo, quien vuelve a
 * pulsar esta pidiendo mas comida de verdad y hay que atenderle.
 */
const REQUEST_REPLAY_MS = 10 * 60 * 1_000;
type DiningPaymentMethod = 'cash' | 'card' | 'yape' | 'plin';
type DiningItemInput = QuoteItemInput & { offeringId?: number };
type PosPaymentInput = {
  method: DiningPaymentMethod;
  amount: number;
  reference?: string | null;
  operationCode?: string | null;
  payerPhone?: string | null;
};

const orderNumber = (): string =>
  `VB-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(1000, 9999)}`;

const allocateDiscounts = (total: number, lineTotals: number[]): number[] => {
  const gross = lineTotals.reduce((sum, value) => sum + value, 0);
  if (gross <= 0 || total <= 0) return lineTotals.map(() => 0);
  let assigned = 0;
  return lineTotals.map((lineTotal, index) => {
    if (index === lineTotals.length - 1) return round2(Math.max(0, total - assigned));
    const amount = round2(Math.min(lineTotal, total * lineTotal / gross));
    assigned = round2(assigned + amount);
    return amount;
  });
};

export const limaClock = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
    weekday,
  };
};

export const offeringState = (
  offering: Pick<DiningOffering, 'weekdaysJson' | 'soldDate' | 'soldCount' | 'dailyLimit' | 'startsAt' | 'endsAt' | 'isActive'>,
  now = new Date(),
) => {
  const clock = limaClock(now);
  const weekdays = Array.isArray(offering.weekdaysJson) ? offering.weekdaysJson.map(Number) : [];
  const sold = String(offering.soldDate ?? '') === clock.date ? offering.soldCount : 0;
  const remaining = offering.dailyLimit === null ? null : Math.max(0, offering.dailyLimit - sold);
  const scheduled = weekdays.includes(clock.weekday)
    && clock.time >= String(offering.startsAt)
    && clock.time <= String(offering.endsAt);
  return { activeNow: offering.isActive && scheduled && (remaining === null || remaining > 0), remaining };
};

const serializeOffering = (offering: DiningOffering) => ({
  id: offering.id,
  branchId: offering.branchId,
  productId: offering.productId,
  variantId: offering.variantId,
  name: offering.name,
  price: Number(offering.price),
  weekdays: offering.weekdaysJson,
  startsAt: String(offering.startsAt).slice(0, 5),
  endsAt: String(offering.endsAt).slice(0, 5),
  dailyLimit: offering.dailyLimit,
  soldToday: String(offering.soldDate ?? '') === limaClock().date ? offering.soldCount : 0,
  isActive: offering.isActive,
  ...offeringState(offering),
});

const applyOfferings = async (
  quote: OrderQuote,
  inputs: DiningItemInput[],
  branchId: number,
  transaction: Transaction,
  consume: boolean,
): Promise<OrderQuote> => {
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    if (!input.offeringId) continue;
    const offering = await DiningOffering.findOne({
      where: { id: input.offeringId, branchId, productId: input.productId, variantId: input.variantId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!offering) throw ApiError.unprocessable('El menú elegido ya no está disponible en este local');

    const clock = limaClock();
    if (String(offering.soldDate ?? '') !== clock.date) {
      offering.soldDate = clock.date;
      offering.soldCount = 0;
    }
    const state = offeringState(offering);
    if (!state.activeNow || (state.remaining !== null && state.remaining < input.quantity)) {
      throw ApiError.unprocessable(`Se agotó o terminó el horario de ${offering.name}`);
    }

    const line = quote.items[index];
    line.basePrice = Number(offering.price);
    line.unitPrice = round2(Number(offering.price) + Number(line.extrasTotal));
    line.lineTotal = round2(line.unitPrice * line.quantity);
    if (consume) {
      offering.soldCount += input.quantity;
      await offering.save({ transaction });
    }
  }
  quote.subtotal = round2(quote.items.reduce((sum, line) => sum + Number(line.lineTotal), 0));
  quote.grandTotal = quote.subtotal;
  const tax = splitTaxFromGross(quote.grandTotal, quote.taxRate);
  quote.taxableBase = tax.base;
  quote.taxTotal = tax.tax;
  return quote;
};

const createOrderItems = async (
  order: Order,
  quote: OrderQuote,
  inputs: DiningItemInput[],
  transaction: Transaction,
) => {
  const lineDiscounts = allocateDiscounts(quote.discountTotal, quote.items.map((line) => line.lineTotal));
  for (let index = 0; index < quote.items.length; index += 1) {
    const line = quote.items[index];
    const source = inputs[index];
    const product = await Product.findByPk(line.productId, { transaction });
    const discount = lineDiscounts[index] ?? 0;
    const tax = splitTaxFromGross(round2(Math.max(0, line.lineTotal - discount)), quote.taxRate);
    const snapshot = buildOrderItemSnapshot(line);
    const item = await OrderItem.create({
      orderId: order.id,
      productId: line.productId,
      variantId: line.variantId,
      productNameSnapshot: product?.name ?? 'Producto',
      variantNameSnapshot: snapshot.variantNameSnapshot,
      descriptionSnapshot: snapshot.descriptionSnapshot,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      extrasTotal: line.extrasTotal,
      discountTotal: discount,
      lineTotal: line.lineTotal,
      taxableBase: tax.base,
      taxTotal: tax.tax,
      allergenSnapshotJson: [],
      specialInstructions: source?.specialInstructions?.trim() || null,
    }, { transaction });

    for (const selection of line.selections) {
      await OrderItemCustomization.create({
        orderItemId: item.id,
        groupId: selection.groupId,
        groupNameSnapshot: selection.groupName,
        optionId: selection.optionId,
        optionNameSnapshot: selection.optionName,
        quantity: selection.quantity,
        priceDelta: selection.priceDelta,
        lineExtra: selection.lineExtra,
      }, { transaction });
    }
  }
};

const receipt = async (order: Order, transaction?: Transaction) => {
  const [items, payments, table, branch] = await Promise.all([
    OrderItem.findAll({ where: { orderId: order.id }, transaction }),
    Payment.findAll({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id }, transaction }),
    order.diningTableId ? DiningTable.findByPk(order.diningTableId, { transaction }) : null,
    Branch.findByPk(order.branchId, { transaction }),
  ]);
  return {
    orderNumber: order.orderNumber,
    status: order.status,
    branchName: branch?.name ?? `Local ${order.branchId}`,
    tableCode: table?.code ?? null,
    guestName: order.contactName,
    documentType: order.documentType,
    billingDocType: order.billingDocType,
    billingDocNumber: order.billingDocNumber,
    billingName: order.billingName,
    subtotal: Number(order.subtotal),
    taxableBase: Number(order.taxableBase),
    taxTotal: Number(order.taxTotal),
    total: Number(order.grandTotal),
    items: items.map((item) => ({ name: item.productNameSnapshot, variant: item.variantNameSnapshot, quantity: item.quantity, unitPrice: Number(item.unitPrice), total: Number(item.lineTotal) })),
    payments: payments.filter((payment) => payment.status === PAYMENT_STATUS.SUCCEEDED).map((payment) => ({ method: payment.method, amount: Number(payment.amount) })),
    issuedAt: new Date(),
  };
};

export const diningService = {
  /** Catálogo simplificado para el mostrador: el cajero vende la presentación
   * predeterminada y el servidor vuelve a cotizar el precio real. */
  async counterCatalog(branchId: number) {
    const products = await catalogService.listProducts({ branchId });
    return products
      // El diseño especial necesita su cotización y aprobación; el mostrador
      // solo ofrece bases listas o personalizables con precio publicado.
      .filter((product) => product.isAvailable && product.defaultVariantId !== null && product.cakeSaleMode !== 'ADVANCED')
      .map((product) => ({
        productId: product.id,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        variantId: product.defaultVariantId as number,
        variantName: product.defaultVariantName,
        price: product.defaultVariantPrice,
        categoryId: product.categoryId,
        categoryName: product.categoryName,
        cakeSaleMode: product.cakeSaleMode,
      }));
  },

  async quoteCounterSale(input: { branchId: number; items: DiningItemInput[]; couponCode?: string | null }) {
    const branch = await Branch.findByPk(input.branchId);
    if (!branch) throw ApiError.notFound('Sucursal no encontrada');
    const profileRows = await CakeProductProfile.findAll({ where: { productId: [...new Set(input.items.map((item) => item.productId))] } });
    if (profileRows.some((profile) => profile.saleMode === 'ADVANCED')) {
      throw ApiError.unprocessable('Los diseños especiales se cotizan y se venden desde Pedidos; no se pueden registrar como venta directa');
    }
    const quote = await pricingService.quoteOrder({
      branchId: input.branchId,
      deliveryType: DELIVERY_TYPE.PICKUP,
      items: input.items,
      userId: null,
      useWallet: false,
      couponCode: input.couponCode,
    });
    return { subtotal: quote.subtotal, discountTotal: quote.discountTotal, total: quote.grandTotal, currency: quote.currency };
  },

  /**
   * Registra una venta de mostrador como un pedido POS real. Así la venta entra
   * a la misma cocina, reserva los mismos insumos y deja el mismo rastro de pago
   * que una compra web, pero el cajero ya marcó el medio de pago como cobrado.
   */
  async createCounterSale(input: {
    branchId: number;
    actorId: number;
    items: DiningItemInput[];
    payments?: PosPaymentInput[];
    /** Compatibilidad con clientes POS anteriores. Se convierte a un pago. */
    paymentMethod?: DiningPaymentMethod;
    cashReceived?: number | null;
    customerName?: string | null;
    notes?: string | null;
    couponCode?: string | null;
    documentType?: DocumentType;
    billingDocType?: BillingDocType | null;
    billingDocNumber?: string | null;
    billingName?: string | null;
    billingAddress?: string | null;
    idempotencyKey?: string | null;
  }) {
    const legacyPayment = !input.payments?.length;
    const payments: PosPaymentInput[] = input.payments?.length
      ? input.payments
      : [{ method: input.paymentMethod ?? 'cash', amount: 0 }];
    if (payments.length > 4) throw ApiError.unprocessable('Puedes combinar hasta cuatro medios de pago');
    if (!legacyPayment && payments.some((part) => !Number.isFinite(part.amount) || part.amount <= 0)) {
      throw ApiError.unprocessable('Cada medio de pago debe tener un importe positivo');
    }
    const directPayments = payments.filter((part) => part.method === 'yape' || part.method === 'plin');
    if (directPayments.length > 0 && (directPayments.length !== 1 || payments.length !== 1)) {
      throw ApiError.unprocessable('Yape o Plin debe verificarse como un único pago de la venta');
    }
    const rawKey = input.idempotencyKey?.trim() || crypto.randomUUID();
    const idempotencyKey = `pos-${input.branchId}-${rawKey}`.slice(0, 100);
    const previous = await Order.findOne({ where: { idempotencyKey } });
    if (previous) {
      const pending = await Payment.findOne({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: previous.id, status: PAYMENT_STATUS.PENDING }, order: [['id', 'ASC']] });
      return { orderNumber: previous.orderNumber, status: previous.status, total: Number(previous.grandTotal), reused: true, paymentPending: Boolean(pending), paymentId: pending?.id ?? null, change: 0 };
    }

    const receiptSettings = await settingsService.getReceiptSettings();
    const fiscalEnabled = receiptSettings.mode !== RECEIPT_MODE.INTERNAL_ONLY;

    return sequelize.transaction(async (transaction) => {
      const branch = await Branch.findByPk(input.branchId, { transaction, lock: transaction.LOCK.UPDATE });
      if (!branch) throw ApiError.notFound('Sucursal no encontrada');
      const existing = await Order.findOne({ where: { idempotencyKey }, transaction });
      if (existing) {
        return { orderNumber: existing.orderNumber, status: existing.status, total: Number(existing.grandTotal), reused: true, paymentPending: existing.status === ORDER_STATUS.PENDING_PAYMENT, paymentId: null, change: 0 };
      }
      const profileRows = await CakeProductProfile.findAll({ where: { productId: [...new Set(input.items.map((item) => item.productId))] }, transaction });
      if (profileRows.some((profile) => profile.saleMode === 'ADVANCED')) {
        throw ApiError.unprocessable('Los diseños especiales se cotizan y se venden desde Pedidos; no se pueden registrar como venta directa');
      }

      const quote = await pricingService.quoteOrder({
        branchId: input.branchId,
        deliveryType: DELIVERY_TYPE.PICKUP,
        items: input.items,
        userId: null,
        useWallet: false,
        couponCode: input.couponCode,
      });
      await inventoryService.assertCartAvailability(input.branchId, input.items);

      const expected = round2(quote.grandTotal);
      if (legacyPayment) payments[0].amount = expected;
      const registered = round2(payments.reduce((sum, part) => sum + Number(part.amount), 0));
      if (Math.abs(registered - expected) > 0.01) {
        throw ApiError.unprocessable(`Los medios de pago deben sumar S/ ${expected.toFixed(2)}`);
      }
      if (fiscalEnabled && (input.documentType ?? DOCUMENT_TYPE.BOLETA) === DOCUMENT_TYPE.FACTURA && (
        input.billingDocType !== BILLING_DOC_TYPE.RUC ||
        !/^\d{11}$/.test(input.billingDocNumber ?? '') ||
        !input.billingName?.trim() ||
        !input.billingAddress?.trim()
      )) {
        throw ApiError.unprocessable('Para factura ingresa RUC, razón social y domicilio fiscal');
      }
      if (fiscalEnabled && (input.documentType ?? DOCUMENT_TYPE.BOLETA) === DOCUMENT_TYPE.BOLETA && input.billingDocNumber && !/^(\d{8}|[A-Za-z0-9]{6,12})$/.test(input.billingDocNumber)) {
        throw ApiError.unprocessable('Documento de boleta inválido');
      }

      const created = await Order.create({
        orderNumber: orderNumber(),
        userId: null,
        branchId: input.branchId,
        diningTableId: null,
        waiterId: null,
        source: ORDER_SOURCE.POS,
        coverageZoneId: null,
        deliveryType: DELIVERY_TYPE.PICKUP,
        serviceMode: SERVICE_MODE.ASAP,
        deliverySlotId: null,
        scheduledAt: null,
        status: ORDER_STATUS.PENDING_PAYMENT,
        addressSnapshotJson: null,
        contactName: input.customerName?.trim() || 'Cliente de mostrador',
        contactPhone: null,
        subtotal: quote.subtotal,
        deliveryFee: 0,
        discountTotal: quote.discountTotal,
        walletAmount: 0,
        taxRate: quote.taxRate,
        taxableBase: quote.taxableBase,
        taxTotal: quote.taxTotal,
        grandTotal: quote.grandTotal,
        paymentPlan: 'FULL',
        depositAmount: 0,
        balanceAmount: 0,
        balanceDueAt: null,
        depositPaidAt: null,
        balancePaidAt: null,
        currency: quote.currency,
        documentType: fiscalEnabled ? input.documentType ?? DOCUMENT_TYPE.BOLETA : DOCUMENT_TYPE.BOLETA,
        billingDocType: fiscalEnabled ? input.billingDocType ?? null : null,
        billingDocNumber: fiscalEnabled ? input.billingDocNumber?.trim() || null : null,
        billingName: fiscalEnabled ? input.billingName?.trim() || input.customerName?.trim() || 'Cliente de mostrador' : null,
        billingAddress: fiscalEnabled ? input.billingAddress?.trim() || null : null,
        invoiceStatus: INVOICE_STATUS.PENDING,
        notes: input.notes?.trim() || null,
        idempotencyKey,
      }, { transaction });

      await createOrderItems(created, quote, input.items, transaction);
      for (const discount of quote.discounts) {
        await OrderDiscount.create({
          orderId: created.id,
          source: discount.source === 'COUPON' ? DISCOUNT_SOURCE.COUPON : DISCOUNT_SOURCE.PLAN_BENEFIT,
          referenceId: discount.couponId ?? discount.userPlanId ?? null,
          code: discount.code,
          description: discount.description,
          amount: discount.amount,
        }, { transaction });
        if (discount.source === 'COUPON' && discount.couponId) {
          const coupon = await Coupon.findByPk(discount.couponId, { transaction, lock: transaction.LOCK.UPDATE });
          if (!coupon?.isActive) throw ApiError.unprocessable('El cupón dejó de estar disponible');
          const reservedUses = await CouponRedemption.count({ where: { couponId: coupon.id, status: { [Op.in]: [REDEMPTION_STATUS.RESERVED, REDEMPTION_STATUS.CONFIRMED] } }, transaction });
          if (coupon.usageLimit !== null && reservedUses >= coupon.usageLimit) throw ApiError.unprocessable('El cupón alcanzó su límite de usos');
          await CouponRedemption.create({ couponId: coupon.id, userId: null, orderId: created.id, amount: discount.amount, status: REDEMPTION_STATUS.RESERVED }, { transaction });
        }
      }
      await OrderStatusHistory.create({
        orderId: created.id,
        fromStatus: null,
        toStatus: ORDER_STATUS.PENDING_PAYMENT,
        actorId: input.actorId,
        source: 'STAFF',
        comment: 'Venta de mostrador creada en Punto de venta',
      }, { transaction });

      await inventoryService.reserveForOrder(created, transaction, true);

      const now = new Date();
      let change = 0;
      const createdPayments: Payment[] = [];
      for (let index = 0; index < payments.length; index += 1) {
        const part = payments[index];
        const isDirect = part.method === 'yape' || part.method === 'plin';
        const cashReceived = part.method === 'cash' ? round2(input.cashReceived ?? part.amount) : 0;
        if (part.method === 'cash' && cashReceived < part.amount) throw ApiError.unprocessable('El efectivo recibido no cubre el importe');
        if (part.method === 'card' && !legacyPayment && !part.reference?.trim()) throw ApiError.unprocessable('Registra la referencia del POS o voucher de la tarjeta');
        if (isDirect && !part.operationCode?.trim()) throw ApiError.unprocessable('Registra el código de operación de Yape o Plin');
        if (part.method === 'cash') change = round2(Math.max(0, cashReceived - part.amount));
        const directSnapshot = isDirect
          ? directPaymentsService.snapshot(part.method as 'yape' | 'plin', await settingsService.getLocalPaymentSettings())
          : null;
        const payment = await Payment.create({
          payableType: PAYABLE_TYPE.ORDER,
          payableId: created.id,
          userId: null,
          provider: part.method === 'card' ? PAYMENT_PROVIDER.POS : part.method,
          method: part.method,
          amount: part.amount,
          currency: quote.currency,
          status: isDirect ? PAYMENT_STATUS.PENDING : PAYMENT_STATUS.SUCCEEDED,
          stage: 'FULL',
          idempotencyKey: `pos-payment-${idempotencyKey}-${index}`.slice(0, 80),
          safeResponseJson: { posSale: { capturedBy: input.actorId, reference: part.reference?.trim() || null, operationCode: part.operationCode?.trim() || null, cashReceived, change }, ...(directSnapshot ? { directPayment: directSnapshot } : {}) },
          authorizedAt: isDirect ? null : now,
          capturedAt: isDirect ? null : now,
        }, { transaction });
        createdPayments.push(payment);
        if (isDirect) {
          await MobilePaymentClaim.create({
            paymentId: payment.id,
            provider: part.method as 'yape' | 'plin',
            operationCode: part.operationCode!.trim(),
            payerPhone: part.payerPhone?.trim() || null,
            payerName: input.customerName?.trim() || null,
            paidAt: now,
            declaredAmount: part.amount,
            status: 'PENDING',
          }, { transaction });
        }
      }

      const pendingPayment = createdPayments.find((payment) => payment.status === PAYMENT_STATUS.PENDING);
      if (!pendingPayment) {
        await confirmPaidOrder(created, transaction, 'STAFF', `Venta de mostrador cobrada con ${payments.map((part) => part.method).join(' + ')}`, createdPayments[0], { skipCakeProduction: true });
      }

      return {
        orderNumber: created.orderNumber,
        status: created.status,
        total: Number(created.grandTotal),
        reused: false,
        paymentPending: Boolean(pendingPayment),
        paymentId: pendingPayment?.id ?? null,
        change,
      };
    });
  },

  async catalog(branchId: number) {
    const [products, offerings] = await Promise.all([
      catalogService.listProducts({ branchId }),
      DiningOffering.findAll({ where: { branchId, isActive: true }, order: [['createdAt', 'DESC']] }),
    ]);
    const activeOfferingByVariant = new Map(
      offerings.filter((offering) => offeringState(offering).activeNow).map((offering) => [offering.variantId, offering]),
    );
    return products
      .filter((product) => product.type === PRODUCT_TYPE.FIXED && product.defaultVariantId !== null)
      .map((product) => {
        const offering = activeOfferingByVariant.get(product.defaultVariantId as number);
        return {
          productId: product.id,
          name: offering?.name ?? product.name,
          imageUrl: product.imageUrl,
          categoryId: product.categoryId,
          variantId: product.defaultVariantId as number,
          variantName: product.defaultVariantName,
          price: offering ? Number(offering.price) : product.defaultVariantPrice,
          isAvailable: product.isAvailable && (!offering || offeringState(offering).activeNow),
          offering: offering ? serializeOffering(offering) : null,
        };
      });
  },

  async tables(branchId: number) {
    const [tables, openOrders] = await Promise.all([
      DiningTable.findAll({ where: { branchId, isActive: true }, order: [['area', 'ASC'], ['sortOrder', 'ASC'], ['code', 'ASC']] }),
      Order.findAll({
        where: { branchId, deliveryType: DELIVERY_TYPE.DINE_IN, status: { [Op.in]: [...OPEN_STATUSES] } },
        include: [
          { model: OrderItem, as: 'items', attributes: ['id', 'productNameSnapshot', 'variantNameSnapshot', 'quantity', 'unitPrice', 'lineTotal'] },
          { model: KitchenTicket, as: 'kitchenTicket', attributes: ['status'] },
        ],
        order: [['placedAt', 'ASC']],
      }),
    ]);
    const waiterIds = [...new Set(openOrders.map((order) => order.waiterId).filter((id): id is number => id !== null))];
    const waiters = waiterIds.length ? await User.findAll({ where: { id: waiterIds }, attributes: ['id', 'firstName', 'lastName'] }) : [];
    const waiterById = new Map(waiters.map((waiter) => [waiter.id, [waiter.firstName, waiter.lastName].filter(Boolean).join(' ')]));
    const orderByTable = new Map(openOrders.map((order) => [order.diningTableId, order]));

    return tables.map((table) => {
      const order = orderByTable.get(table.id);
      const ticket = order?.get('kitchenTicket') as KitchenTicket | undefined;
      return {
        id: table.id, code: table.code, area: table.area, capacity: table.capacity,
        qrToken: table.qrToken, qrEnabled: table.qrEnabled,
        status: order ? 'OCCUPIED' : 'AVAILABLE',
        command: order ? {
          orderNumber: order.orderNumber,
          status: order.status,
          kitchenStatus: ticket?.status ?? null,
          canAddItems: ticket ? (ADDABLE_TICKET_STATUSES as readonly string[]).includes(ticket.status) : false,
          guestName: order.contactName,
          waiterName: order.waiterId ? waiterById.get(order.waiterId) ?? `Personal #${order.waiterId}` : 'Pedido desde QR',
          subtotal: Number(order.subtotal), taxableBase: Number(order.taxableBase), taxTotal: Number(order.taxTotal), total: Number(order.grandTotal),
          openedAt: order.placedAt,
          items: (order.items ?? []).map((item) => ({ id: item.id, name: item.productNameSnapshot, variant: item.variantNameSnapshot, quantity: item.quantity, unitPrice: Number(item.unitPrice), total: Number(item.lineTotal) })),
        } : null,
      };
    });
  },

  async createTable(input: { branchId: number; code: string; area: string; capacity: number }) {
    const [table, created] = await DiningTable.findOrCreate({
      where: { branchId: input.branchId, code: input.code.trim().toUpperCase() },
      defaults: { branchId: input.branchId, code: input.code.trim().toUpperCase(), area: input.area.trim(), capacity: input.capacity, isActive: true },
    });
    if (!created) throw ApiError.conflict('Ya existe una mesa con ese código en el local');
    return table;
  },

  async setTableQr(input: { branchId: number; tableId: number; enabled?: boolean; regenerate?: boolean }) {
    const table = await DiningTable.findOne({ where: { id: input.tableId, branchId: input.branchId } });
    if (!table) throw ApiError.notFound('Mesa no encontrada');
    if (typeof input.enabled === 'boolean') table.qrEnabled = input.enabled;
    if (input.regenerate) table.qrToken = crypto.randomUUID();
    await table.save();
    return { id: table.id, qrToken: table.qrToken, qrEnabled: table.qrEnabled };
  },

  async offerings(branchId: number) {
    const rows = await DiningOffering.findAll({ where: { branchId }, order: [['createdAt', 'DESC']] });
    return rows.map(serializeOffering);
  },

  async createOffering(input: { branchId: number; productId: number; variantId: number; name: string; price: number; weekdays: number[]; startsAt: string; endsAt: string; dailyLimit?: number | null }) {
    const variant = await ProductVariant.findOne({ where: { id: input.variantId, productId: input.productId, isActive: true } });
    if (!variant) throw ApiError.unprocessable('El producto o su presentación ya no está disponible');
    const offering = await DiningOffering.create({
      branchId: input.branchId, productId: input.productId, variantId: input.variantId,
      name: input.name.trim(), price: input.price, weekdaysJson: [...new Set(input.weekdays)].sort(),
      startsAt: input.startsAt, endsAt: input.endsAt, dailyLimit: input.dailyLimit ?? null,
      soldDate: null, soldCount: 0, isActive: true,
    });
    return serializeOffering(offering);
  },

  async updateOffering(input: { branchId: number; offeringId: number; isActive?: boolean; price?: number; dailyLimit?: number | null; startsAt?: string; endsAt?: string }) {
    const offering = await DiningOffering.findOne({ where: { id: input.offeringId, branchId: input.branchId } });
    if (!offering) throw ApiError.notFound('Menú programado no encontrado');
    if (typeof input.isActive === 'boolean') offering.isActive = input.isActive;
    if (input.price !== undefined) offering.price = input.price;
    if (input.dailyLimit !== undefined) offering.dailyLimit = input.dailyLimit;
    if (input.startsAt) offering.startsAt = input.startsAt;
    if (input.endsAt) offering.endsAt = input.endsAt;
    await offering.save();
    return serializeOffering(offering);
  },

  async openCommand(input: { branchId: number; tableId: number; waiterId: number | null; guestName?: string | null; notes?: string | null; items: DiningItemInput[]; idempotencyKey?: string | null }) {

    return sequelize.transaction(async (transaction) => {
      const table = await DiningTable.findOne({ where: { id: input.tableId, branchId: input.branchId, isActive: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!table) throw ApiError.notFound('Mesa no encontrada en este local');
      if (input.idempotencyKey) {
        const previous = await DiningOrderRequest.findOne({ where: { diningTableId: table.id, idempotencyKey: input.idempotencyKey }, transaction });
        if (previous) return { orderNumber: previous.orderNumber, status: previous.status, total: Number(previous.total) };
      }
    const baseQuote = await pricingService.quoteOrder({ branchId: input.branchId, deliveryType: DELIVERY_TYPE.DINE_IN, items: input.items, userId: null, useWallet: false });
    await inventoryService.assertCartAvailability(input.branchId, input.items);

      const occupied = await Order.count({ where: { diningTableId: table.id, status: { [Op.in]: [...OPEN_STATUSES] } }, transaction });
      if (occupied > 0) throw ApiError.conflict(`${table.code} ya tiene una comanda abierta`);
      const quote = await applyOfferings(baseQuote, input.items, input.branchId, transaction, true);
      const created = await Order.create({
        orderNumber: orderNumber(), userId: null, branchId: input.branchId, diningTableId: table.id, waiterId: input.waiterId,
        source: ORDER_SOURCE.POS, coverageZoneId: null, deliveryType: DELIVERY_TYPE.DINE_IN, serviceMode: SERVICE_MODE.ASAP,
        status: ORDER_STATUS.PENDING_PAYMENT, addressSnapshotJson: null, contactName: input.guestName?.trim() || `Cliente ${table.code}`, contactPhone: null,
        subtotal: quote.subtotal, deliveryFee: 0, discountTotal: 0, walletAmount: 0, taxRate: quote.taxRate,
        taxableBase: quote.taxableBase, taxTotal: quote.taxTotal, grandTotal: quote.grandTotal, currency: quote.currency,
        documentType: DOCUMENT_TYPE.BOLETA, invoiceStatus: INVOICE_STATUS.PENDING, notes: input.notes?.trim() || null,
        /*
         * La clave del cliente cuando la manda: la generada con `Date.now()` es
         * distinta en cada intento y por tanto no deduplica nada. Se prefija
         * para no chocar con la de un pedido web.
         */
        idempotencyKey: input.idempotencyKey
          ? `mesa-${table.id}-${crypto.createHash('sha256').update(input.idempotencyKey).digest('hex')}`
          : `pos-${input.branchId}-${table.id}-${Date.now()}-${crypto.randomInt(100, 999)}`,
      }, { transaction });
      await createOrderItems(created, quote, input.items, transaction);
      await Payment.create({ payableType: PAYABLE_TYPE.ORDER, payableId: created.id, userId: null, provider: PAYMENT_PROVIDER.CASH, method: PAYMENT_PROVIDER.CASH, amount: quote.grandTotal, currency: quote.currency, status: PAYMENT_STATUS.PENDING, idempotencyKey: `pos-payment-${created.id}` }, { transaction });
      await OrderStatusHistory.create({ orderId: created.id, fromStatus: null, toStatus: ORDER_STATUS.PENDING_PAYMENT, actorId: input.waiterId, source: 'STAFF', comment: `Comanda abierta en ${table.code}` }, { transaction });
      await inventoryService.reserveForOrder(created, transaction, true);
      await confirmPaidOrder(created, transaction, 'STAFF', `Comanda enviada desde ${table.code}`);
      if (input.idempotencyKey) await DiningOrderRequest.create({ diningTableId: table.id, idempotencyKey: input.idempotencyKey, orderId: created.id, orderNumber: created.orderNumber, status: created.status, total: Number(created.grandTotal) }, { transaction });
      return { orderNumber: created.orderNumber, status: created.status, total: Number(created.grandTotal) };
    });
  },

  async addItems(input: { orderNumber: string; branchId: number; actorId: number | null; items: DiningItemInput[]; idempotencyKey?: string | null }) {
    return sequelize.transaction(async (transaction) => {
      const order = await Order.findOne({ where: { orderNumber: input.orderNumber, branchId: input.branchId, deliveryType: DELIVERY_TYPE.DINE_IN }, transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw ApiError.notFound('No existe una comanda abierta que pueda ampliarse');
      if (input.idempotencyKey && order.diningTableId) {
        const previous = await DiningOrderRequest.findOne({ where: { diningTableId: order.diningTableId, idempotencyKey: input.idempotencyKey }, transaction });
        if (previous) return { orderNumber: previous.orderNumber, status: previous.status, total: Number(previous.total) };
      }
      if (order.status !== ORDER_STATUS.CONFIRMED) throw ApiError.conflict('La comanda ya no puede ampliarse.');
    const baseQuote = await pricingService.quoteOrder({ branchId: input.branchId, deliveryType: DELIVERY_TYPE.DINE_IN, items: input.items, userId: null, useWallet: false });
    await inventoryService.assertCartAvailability(input.branchId, input.items);
      const ticket = await KitchenTicket.findOne({ where: { orderId: order.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!ticket || !(ADDABLE_TICKET_STATUSES as readonly string[]).includes(ticket.status)) throw ApiError.conflict('Cocina ya empezó a preparar. Abre una nueva comanda adicional para evitar confusiones');
      const quote = await applyOfferings(baseQuote, input.items, input.branchId, transaction, true);
      await createOrderItems(order, quote, input.items, transaction);
      order.subtotal = round2(Number(order.subtotal) + quote.subtotal);
      order.grandTotal = round2(Number(order.grandTotal) + quote.grandTotal);
      const tax = splitTaxFromGross(Number(order.grandTotal), Number(order.taxRate));
      order.taxableBase = tax.base;
      order.taxTotal = tax.tax;
      await order.save({ transaction });
      const pendingPayment = await Payment.findOne({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id, status: PAYMENT_STATUS.PENDING }, transaction, lock: transaction.LOCK.UPDATE });
      if (!pendingPayment) throw ApiError.conflict('La comanda no tiene un cobro pendiente');
      pendingPayment.amount = order.grandTotal;
      await pendingPayment.save({ transaction });
      await inventoryService.reserveForOrder(order, transaction, true);
      await OrderStatusHistory.create({ orderId: order.id, fromStatus: order.status, toStatus: order.status, actorId: input.actorId, source: 'STAFF', comment: `${input.items.length} producto(s) agregado(s) a la comanda` }, { transaction });
      transaction.afterCommit(() => {
        publishKitchenEvent({ type: 'TICKET_UPDATED', branchId: order.branchId, ticketId: ticket.id, orderNumber: order.orderNumber, status: ticket.status });
        void kitchenPushService.notifyBranch(order.branchId, {
          title: `Actualización ${order.orderNumber}`,
          body: 'La mesa agregó productos a su comanda.',
          tag: `kitchen-ticket-${ticket.id}`,
        }).catch(() => undefined);
        void sendMobilePushToStaff({
          branchId: order.branchId,
          permission: PERMISSIONS.KITCHEN_READ,
          title: `Actualización ${order.orderNumber}`,
          body: 'La mesa agregó productos a su comanda.',
          actionUrl: `/staff/kitchen?branchId=${order.branchId}`,
          channel: PUSH_CHANNEL.KITCHEN_OPERATIONS,
          template: PUSH_TEMPLATE.KITCHEN_OPERATION,
          orderId: order.id,
          idempotencyKey: `kitchen-ticket-${ticket.id}-items-${order.updatedAt.getTime()}`,
        }).catch(() => undefined);
      });
      if (input.idempotencyKey && order.diningTableId) await DiningOrderRequest.create({ diningTableId: order.diningTableId, idempotencyKey: input.idempotencyKey, orderId: order.id, orderNumber: order.orderNumber, status: order.status, total: Number(order.grandTotal) }, { transaction });
      return { orderNumber: order.orderNumber, status: order.status, total: Number(order.grandTotal) };
    });
  },

  async closeCommand(input: {
    orderNumber: string; branchId: number; actorId: number;
    payments: Array<{ method: DiningPaymentMethod; amount: number }>;
    documentType: DocumentType; billingDocType?: BillingDocType | null; billingDocNumber?: string | null; billingName?: string | null; billingAddress?: string | null;
  }) {
    const receiptSettings = await settingsService.getReceiptSettings();
    const fiscalEnabled = receiptSettings.mode !== RECEIPT_MODE.INTERNAL_ONLY;
    return sequelize.transaction(async (transaction) => {
      const order = await Order.findOne({ where: { orderNumber: input.orderNumber, branchId: input.branchId, deliveryType: DELIVERY_TYPE.DINE_IN }, transaction, lock: transaction.LOCK.UPDATE });
      if (!order) throw ApiError.notFound('Comanda no encontrada');
      if (order.status !== ORDER_STATUS.READY) throw ApiError.unprocessable('La cocina debe marcar la comanda como lista antes de cobrar y liberar la mesa');
      const paid = round2(input.payments.reduce((sum, payment) => sum + payment.amount, 0));
      if (Math.abs(paid - Number(order.grandTotal)) > 0.01) throw ApiError.unprocessable(`Los medios de pago deben sumar S/ ${Number(order.grandTotal).toFixed(2)}`);
      if (fiscalEnabled && input.documentType === DOCUMENT_TYPE.FACTURA && (input.billingDocType !== BILLING_DOC_TYPE.RUC || !/^\d{11}$/.test(input.billingDocNumber ?? '') || !input.billingName?.trim() || !input.billingAddress?.trim())) {
        throw ApiError.unprocessable('Para factura ingresa RUC, razón social y domicilio fiscal');
      }
      if (fiscalEnabled && input.documentType === DOCUMENT_TYPE.BOLETA && input.billingDocNumber && !/^(\d{8}|[A-Za-z0-9]{6,12})$/.test(input.billingDocNumber)) throw ApiError.unprocessable('Documento de boleta inválido');

      const pending = await Payment.findOne({ where: { payableType: PAYABLE_TYPE.ORDER, payableId: order.id, status: PAYMENT_STATUS.PENDING }, transaction, lock: transaction.LOCK.UPDATE });
      if (!pending) throw ApiError.conflict('La comanda no tiene un cobro pendiente');
      const now = new Date();
      for (let index = 0; index < input.payments.length; index += 1) {
        const part = input.payments[index];
        const provider = part.method === 'card' ? 'pos' : part.method;
        if (index === 0) {
          pending.provider = provider; pending.method = part.method; pending.amount = part.amount;
          pending.status = PAYMENT_STATUS.SUCCEEDED; pending.capturedAt = now; pending.authorizedAt = now;
          await pending.save({ transaction });
        } else {
          await Payment.create({ payableType: PAYABLE_TYPE.ORDER, payableId: order.id, userId: null, provider, method: part.method, amount: part.amount, currency: order.currency, status: PAYMENT_STATUS.SUCCEEDED, authorizedAt: now, capturedAt: now, idempotencyKey: `pos-payment-${order.id}-${index}-${crypto.randomUUID()}` }, { transaction });
        }
      }
      order.documentType = fiscalEnabled ? input.documentType : DOCUMENT_TYPE.BOLETA;
      order.billingDocType = fiscalEnabled ? input.billingDocType ?? null : null;
      order.billingDocNumber = fiscalEnabled ? input.billingDocNumber?.trim() || null : null;
      order.billingName = fiscalEnabled ? input.billingName?.trim() || order.contactName : null;
      order.billingAddress = fiscalEnabled ? input.billingAddress?.trim() || null : null;
      await order.save({ transaction });
      await operationsService.dispatchTicketForOrder(
        order.id,
        input.actorId,
        'Comanda entregada a Salon',
        transaction,
      );
      await ordersService.changeStatus(order, ORDER_STATUS.DELIVERED, { actorId: input.actorId, source: 'STAFF', comment: `Mesa cerrada · ${input.payments.map((part) => part.method).join(' + ')}`, transaction });
      return receipt(order, transaction);
    });
  },

  async publicTable(token: string) {
    const table = await DiningTable.findOne({ where: { qrToken: token, qrEnabled: true, isActive: true } });
    if (!table) throw ApiError.notFound('Este QR de mesa no está activo');
    const branch = await Branch.findByPk(table.branchId);
    const open = await Order.findOne({ where: { diningTableId: table.id, status: { [Op.in]: [...OPEN_STATUSES] } }, order: [['placedAt', 'DESC']] });
    return { table: { id: table.id, code: table.code, area: table.area, capacity: table.capacity }, branch: { id: table.branchId, name: branch?.name ?? 'Misky Challay' }, command: open ? { orderNumber: open.orderNumber, status: open.status, total: Number(open.grandTotal) } : null, catalog: await this.catalog(table.branchId) };
  },

  /**
   * Pedido publico desde el QR de la mesa.
   *
   * Es la unica entrada al sistema sin sesion ni personal detras, y AÑADE a la
   * comanda abierta en vez de crear un pedido nuevo. Con la red del local
   * saturada el comensal reintenta, asi que la clave de idempotencia que manda
   * el cliente decide: si esa clave ya se atendio en esta mesa dentro de la
   * ventana, se devuelve el mismo resultado sin volver a preparar nada.
   */
  async publicOrder(
    token: string,
    input: {
      guestName?: string | null;
      notes?: string | null;
      items: DiningItemInput[];
      idempotencyKey?: string | null;
    },
  ) {
    const table = await DiningTable.findOne({ where: { qrToken: token, qrEnabled: true, isActive: true } });
    if (!table) throw ApiError.notFound('Este QR de mesa no está activo');

    const idempotencyKey = input.idempotencyKey?.trim() || null;

    if (idempotencyKey) {
      const already = await DiningOrderRequest.findOne({
        where: { diningTableId: table.id, idempotencyKey },
      });
      if (already && Date.now() - already.createdAt.getTime() < REQUEST_REPLAY_MS) {
        return {
          orderNumber: already.orderNumber,
          status: already.status,
          total: Number(already.total),
        };
      }
    }

    const open = await Order.findOne({ where: { diningTableId: table.id, status: { [Op.in]: [...OPEN_STATUSES] } }, order: [['placedAt', 'DESC']] });
    const result = open
      ? await this.addItems({ orderNumber: open.orderNumber, branchId: table.branchId, actorId: null, items: input.items, idempotencyKey })
      : await this.openCommand({ branchId: table.branchId, tableId: table.id, waiterId: null, guestName: input.guestName, notes: input.notes, items: input.items, idempotencyKey });

    return result;
  },
};

export type DiningService = typeof diningService;
