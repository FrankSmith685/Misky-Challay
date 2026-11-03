import { experiencePricing, type ExperienceSelection } from '@modules/experiences/experience.pricing';
import type { PackageSnapshot } from '@modules/experiences/experience.logic';
import { Op } from 'sequelize';
import { Branch, CakeProductProfile, Coupon, CouponRedemption, CoverageZone, Product, ProductVariant } from '@database/models';
import { carTransport } from '@modules/delivery/carTransport.service';
import { PRODUCT_STATUS } from '@database/models/product.model';
import { DISCOUNT_TYPE } from '@database/models/coupon.model';
import { REDEMPTION_STATUS } from '@database/models/couponRedemption.model';
import { CURRENCY, DELIVERY_TYPE, type DeliveryType } from '@config/constants';
import { ApiError } from '@shared/errors/ApiError';
import { round2 } from '@shared/utils/money';
import { splitTaxFromGross } from '@shared/utils/tax';
import { env } from '@config/env';
import {
  customizationService,
  type QuoteResult,
} from '@modules/customization/customization.service';
import { plansService } from '@modules/plans/plans.service';
import { walletService } from '@modules/plans/wallet.service';
import { BENEFIT_TYPE } from '@database/models/planBenefit.model';
import { cakeDesignService } from '@modules/cakes/cakeDesign.service';

export interface QuoteItemInput {
  themeId?: number;
  themeVersion?: number;
  productId: number;
  variantId: number;
  requestedServings?: number;
  quantity: number;
  selections?: Array<{ optionId: number; quantity: number }>;
  designDetails?: { inscription: string; occasion: string; finish: string };
  specialInstructions?: string;
  referenceDataUrl?: string;
  aiProposalDataUrl?: string;
  designQuoteId?: number;
}

export interface OrderQuoteInput {
  experience?: ExperienceSelection;
  items: QuoteItemInput[];
  branchId: number;
  coverageZoneId?: number | null;
  extraDeliveryFee?: number;
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
  deliveryVehicleType?: 'CAR' | null;
  deliveryHandlingInstructions?: string | null;
  experience?: PackageSnapshot | null;
  productSubtotal?: number;
  items: QuoteResult[];
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  /** Saldo del plan aplicado a este pedido. */
  walletAmount: number;
  /** Saldo disponible del cliente (para que la UI pueda ofrecerlo). */
  walletBalance: number;
  /** Tasa de IGV aplicada, congelada en el pedido (0.18 = 18%). */
  taxRate: number;
  /** Valor de venta: lo cobrado sin el IGV que ya lleva dentro. */
  taxableBase: number;
  /** IGV contenido en el importe cobrado. No se suma al total: ya esta dentro. */
  taxTotal: number;
  /** Lo que se cobra con tarjeta. Si es 0, el saldo cubrio todo el pedido. */
  grandTotal: number;
  currency: string;
  discounts: AppliedDiscount[];
  /** Aviso cuando el pedido aun no llega al minimo de la zona. */
  minimumOrder: number;
  meetsMinimum: boolean;
}

// round2 vive en @shared/utils/money: mismo redondeo para precios, reembolsos y saldo.

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
      if (item.designQuoteId && item.themeId) throw ApiError.unprocessable('Una cotización aprobada ya incluye su diseño');
      if (item.designQuoteId && item.requestedServings != null) throw ApiError.unprocessable('La cotizacion de diseno ya fija las porciones');
      const cakeProfile = await CakeProductProfile.findByPk(item.productId);
      if (!cakeProfile?.isActive) throw ApiError.unprocessable('Este producto ya no está disponible en Misky Challay');
      if (item.designQuoteId) {
        const { quote, request } = await cakeDesignService.purchasableQuote(item.designQuoteId, {
          userId: input.userId, branchId: input.branchId, productId: item.productId,
          variantId: item.variantId, quantity: item.quantity, selections: item.selections ?? [],
        });
        if (request.requestKind === 'FREEFORM') {
          const [product, variant] = await Promise.all([Product.findByPk(item.productId), ProductVariant.findByPk(item.variantId)]);
          if (!product || product.status !== PRODUCT_STATUS.ACTIVE || !variant?.isActive || variant.productId !== product.id) throw ApiError.unprocessable('La torta a medida ya no esta disponible');
          const servings = request.briefJson.servings;
          const price = Number(quote.price);
          items.push({ productId: item.productId, variantId: item.variantId, variantName: `A medida · ${servings} porciones`, quantity: 1,
            theme: request.themeSnapshotJson,
            basePrice: price, extrasTotal: 0, unitPrice: price, lineTotal: price, selections: [],
            description: `Torta a medida · ${servings} porciones · Cotización v${quote.version}\n${quote.terms}` });
          continue;
        }
      }
      const calculated = await customizationService.quote({
          productId: item.productId,
          variantId: item.variantId,
          requestedServings: item.requestedServings,
          themeId: item.themeId,
          themeVersion: item.themeVersion,
          quantity: item.quantity,
          branchId: input.branchId,
          selections: item.selections ?? [],
        });
      if (item.designQuoteId) {
        const { quote } = await cakeDesignService.purchasableQuote(item.designQuoteId, {
          userId: input.userId, branchId: input.branchId, productId: item.productId,
          variantId: item.variantId, quantity: item.quantity, selections: item.selections ?? [],
        });
        const price = Number(quote.price);
        items.push({ ...calculated, basePrice: price, extrasTotal: 0, unitPrice: price, lineTotal: price,
          description: `${calculated.description} · Diseño aprobado, cotización v${quote.version}\n${quote.terms}`,
          selections: calculated.selections.map((entry) => ({ ...entry, priceDelta: 0, lineExtra: 0, chargedQuantity: 0 })),
        });
      } else items.push(calculated);
    }

    const productSubtotal = round2(items.reduce((total, line) => total + line.lineTotal, 0));

    // 2) Delivery según ubicación. El mínimo es opcional (0 = desactivado)
    // y solo se aplica a productos en delivery; el recojo siempre queda sin mínimo.
    let deliveryFee = 0;
    let minimumOrder = 0;
    const deliveryVehicleType = await carTransport.requiresCar(input.items.map((item) => item.productId), input.deliveryType) ? 'CAR' as const : null;
    const deliveryHandlingInstructions = deliveryVehicleType
      ? (await Branch.findByPk(input.branchId))?.carDeliveryInstructions ?? null : null;

    if (input.deliveryType === DELIVERY_TYPE.DELIVERY) {
      if (!input.coverageZoneId) {
        throw ApiError.unprocessable('Necesitamos una direccion con cobertura para el delivery');
      }
      const zone = await CoverageZone.findOne({
        where: { id: input.coverageZoneId, isActive: true },
      });
      if (!zone) throw ApiError.unprocessable('La zona de entrega ya no esta activa');

      deliveryFee = round2(Number(zone.deliveryFee) + Math.max(0, input.extraDeliveryFee ?? 0));
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
          let amount = (productSubtotal * benefit.value) / 100;
          if (benefit.maxAmountPerOrder !== null) {
            amount = Math.min(amount, benefit.maxAmountPerOrder);
          }
          amount = round2(Math.min(amount, productSubtotal));

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
        productSubtotal,
        input.userId,
      );

      const applied = freeDelivery ? deliveryFee : Math.min(amount, productSubtotal - discountTotal);
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

    const experience = await experiencePricing.quote(input.experience);
    const subtotal = round2(productSubtotal + (experience?.price ?? 0));
    const payable = round2(Math.max(0, subtotal + deliveryFee - discountTotal));

    // 5) Saldo del plan (RN-013). Pago mixto: si el saldo no alcanza, se usa todo
    //    y el resto se cobra con tarjeta.
    const walletBalance = input.userId ? await walletService.getBalance(input.userId) : 0;
    const walletAmount = input.useWallet ? round2(Math.min(walletBalance, payable)) : 0;
    const grandTotal = round2(Math.max(0, payable - walletAmount));

    /* 6) Desglose del IGV.
     * Se calcula sobre `payable` y no sobre `grandTotal`: la operacion gravada es la
     * venta completa, y pagar parte con saldo del plan es una forma de pago, no un
     * descuento. Si se desglosara sobre lo cobrado con tarjeta, la boleta declararia
     * menos venta de la que hubo. */
    const { base: taxableBase, tax: taxTotal } = splitTaxFromGross(payable, env.IGV_RATE);

    return {
      items,
      productSubtotal,
      subtotal,
      experience,
      deliveryFee: round2(deliveryFee),
      deliveryVehicleType,
      deliveryHandlingInstructions,
      discountTotal: round2(discountTotal),
      walletAmount,
      walletBalance: round2(walletBalance),
      taxRate: env.IGV_RATE,
      taxableBase,
      taxTotal,
      grandTotal,
      currency: CURRENCY,
      discounts,
      minimumOrder,
      meetsMinimum: productSubtotal >= minimumOrder,
    };
  },
};

export type PricingService = typeof pricingService;
