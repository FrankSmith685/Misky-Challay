import { Op } from 'sequelize';
import { Coupon, CouponRedemption, CoverageZone } from '@database/models';
import { DISCOUNT_TYPE } from '@database/models/coupon.model';
import { REDEMPTION_STATUS } from '@database/models/couponRedemption.model';
import { CURRENCY, DELIVERY_TYPE, type DeliveryType } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import {
  customizationService,
  type QuoteResult,
} from '@modules/customization/customization.service';
import { plansService } from '@modules/plans/plans.service';
import { walletService } from '@modules/plans/wallet.service';
import { BENEFIT_TYPE } from '@database/models/planBenefit.model';

export interface QuoteItemInput {
  productId: number;
  variantId: number;
  quantity: number;
  selections?: Array<{ optionId: number; quantity: number }>;
  specialInstructions?: string;
}

export interface OrderQuoteInput {
  items: QuoteItemInput[];
  branchId: number;
  coverageZoneId?: number | null;
  deliveryType: DeliveryType;
  couponCode?: string | null;
  userId?: number | null;
  /** El cliente decide si gasta su saldo en este pedido. */
  useWallet?: boolean;
}

export interface AppliedDiscount {
  source: 'COUPON' | 'PLAN_BENEFIT';
  code: string;
  description: string;
  amount: number;
  couponId?: number;
  userPlanId?: number;
}

export interface OrderQuote {
  items: QuoteResult[];
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  /** Saldo del plan aplicado a este pedido. */
  walletAmount: number;
  /** Saldo disponible del cliente (para que la UI pueda ofrecerlo). */
  walletBalance: number;
  taxTotal: number;
  /** Lo que se cobra con tarjeta. Si es 0, el saldo cubrio todo el pedido. */
  grandTotal: number;
  currency: string;
  discounts: AppliedDiscount[];
  /** Aviso cuando el pedido aun no llega al minimo de la zona. */
  minimumOrder: number;
  meetsMinimum: boolean;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** RN-011: valida vigencia, monto minimo y limites de uso del cupon. */
const resolveCoupon = async (
  code: string,
  subtotal: number,
  userId: number | null | undefined,
): Promise<{ coupon: Coupon; amount: number; freeDelivery: boolean }> => {
  const coupon = await Coupon.findOne({ where: { code: code.trim().toUpperCase() } });

  if (!coupon || !coupon.isActive) throw ApiError.unprocessable('El cupon no existe o no esta activo');

  const now = new Date();
  if (coupon.validFrom && now < coupon.validFrom) {
    throw ApiError.unprocessable('El cupon todavia no esta vigente');
  }
  if (coupon.validUntil && now > coupon.validUntil) {
    throw ApiError.unprocessable('El cupon ya vencio');
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.unprocessable('El cupon alcanzo su limite de usos');
  }
  if (subtotal < Number(coupon.minOrderAmount)) {
    throw ApiError.unprocessable(
      `El cupon aplica desde S/ ${Number(coupon.minOrderAmount).toFixed(2)} de pedido`,
    );
  }

  if (userId) {
    const usedByUser = await CouponRedemption.count({
      where: {
        couponId: coupon.id,
        userId,
        status: { [Op.in]: [REDEMPTION_STATUS.RESERVED, REDEMPTION_STATUS.CONFIRMED] },
      },
    });
    if (usedByUser >= coupon.usageLimitPerUser) {
      throw ApiError.unprocessable('Ya usaste este cupon');
    }
  }

  if (coupon.discountType === DISCOUNT_TYPE.FREE_DELIVERY) {
    return { coupon, amount: 0, freeDelivery: true };
  }

  let amount =
    coupon.discountType === DISCOUNT_TYPE.PERCENT
      ? (subtotal * Number(coupon.value)) / 100
      : Number(coupon.value);

  if (coupon.maxDiscountAmount !== null) {
    amount = Math.min(amount, Number(coupon.maxDiscountAmount));
  }

  return { coupon, amount: round2(Math.min(amount, subtotal)), freeDelivery: false };
};

export const pricingService = {
  /**
   * Cotiza el pedido completo. Es la fuente de verdad (RN-007):
   * cada item se recotiza contra el catalogo real, no se confia en lo que
   * envia el frontend.
   *
   * Formula (seccion 11.1):
   *   subtotal + extras + delivery - descuentos - saldo = total
   */
  async quoteOrder(input: OrderQuoteInput): Promise<OrderQuote> {
    if (input.items.length === 0) throw ApiError.badRequest('El carrito esta vacio');

    // 1) Recotizar cada linea (valida limites, incompatibilidades y disponibilidad)
    const items: QuoteResult[] = [];
    for (const item of input.items) {
      items.push(
        await customizationService.quote({
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          branchId: input.branchId,
          selections: item.selections ?? [],
        }),
      );
    }

    const subtotal = round2(items.reduce((total, line) => total + line.lineTotal, 0));

    // 2) Delivery y pedido minimo segun la zona (RN-001)
    let deliveryFee = 0;
    let minimumOrder = 0;

    if (input.deliveryType === DELIVERY_TYPE.DELIVERY) {
      if (!input.coverageZoneId) {
        throw ApiError.unprocessable('Necesitamos una direccion con cobertura para el delivery');
      }
      const zone = await CoverageZone.findOne({
        where: { id: input.coverageZoneId, isActive: true },
      });
      if (!zone) throw ApiError.unprocessable('La zona de entrega ya no esta activa');

      deliveryFee = Number(zone.deliveryFee);
      minimumOrder = Number(zone.minimumOrder);
    }

    const discounts: AppliedDiscount[] = [];
    let discountTotal = 0;

    // 3) Beneficios del plan vigente (RN-012): descuento y/o delivery gratis.
    if (input.userId) {
      const benefits = await plansService.activeBenefits(input.userId);

      for (const benefit of benefits) {
        if (benefit.type === BENEFIT_TYPE.FREE_DELIVERY && deliveryFee > 0) {
          discounts.push({
            source: 'PLAN_BENEFIT',
            code: 'PLAN_FREE_DELIVERY',
            description: benefit.description,
            amount: round2(deliveryFee),
            userPlanId: benefit.userPlanId,
          });
          deliveryFee = 0;
        }

        if (benefit.type === BENEFIT_TYPE.DISCOUNT_PERCENT && benefit.value > 0) {
          let amount = (subtotal * benefit.value) / 100;
          if (benefit.maxAmountPerOrder !== null) {
            amount = Math.min(amount, benefit.maxAmountPerOrder);
          }
          amount = round2(Math.min(amount, subtotal));

          if (amount > 0) {
            discountTotal += amount;
            discounts.push({
              source: 'PLAN_BENEFIT',
              code: 'PLAN_DISCOUNT',
              description: benefit.description,
              amount,
              userPlanId: benefit.userPlanId,
            });
          }
        }
      }
    }

    // 4) Cupón: solo se aplica el que el cliente escribió explícitamente.
    // No se autoselecciona ninguno: un cupón es una campaña con cupo limitado y
    // aplicarlo sin que nadie lo pida quema ese cupo en pedidos que ya iban a ocurrir.
    const selectedCouponCode = input.couponCode?.trim() || null;

    if (selectedCouponCode) {
      const { coupon, amount, freeDelivery } = await resolveCoupon(
        selectedCouponCode,
        subtotal,
        input.userId,
      );

      const applied = freeDelivery ? deliveryFee : Math.min(amount, subtotal - discountTotal);
      if (freeDelivery) deliveryFee = 0;
      else discountTotal += applied;

      discounts.push({
        source: 'COUPON',
        code: coupon.code,
        description: coupon.description,
        amount: round2(Math.max(0, applied)),
        couponId: coupon.id,
      });
    }

    const payable = round2(Math.max(0, subtotal + deliveryFee - discountTotal));

    // 5) Saldo del plan (RN-013). Pago mixto: si el saldo no alcanza, se usa todo
    //    y el resto se cobra con tarjeta.
    const walletBalance = input.userId ? await walletService.getBalance(input.userId) : 0;
    const walletAmount = input.useWallet ? round2(Math.min(walletBalance, payable)) : 0;
    const grandTotal = round2(Math.max(0, payable - walletAmount));

    return {
      items,
      subtotal,
      deliveryFee: round2(deliveryFee),
      discountTotal: round2(discountTotal),
      walletAmount,
      walletBalance: round2(walletBalance),
      taxTotal: 0, // el IGV ya va incluido en el precio; se separa cuando se facture
      grandTotal,
      currency: CURRENCY,
      discounts,
      minimumOrder,
      meetsMinimum: subtotal >= minimumOrder,
    };
  },
};

export type PricingService = typeof pricingService;
