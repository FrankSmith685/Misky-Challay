import { logger } from '@config/logger';
import { Coupon } from '../models';
import { DISCOUNT_TYPE } from '../models/coupon.model';

/** Cupones de ejemplo para probar el checkout (RN-010, RN-011). */
const COUPONS = [
  {
    code: 'VERDE10',
    description: '10% de descuento en tu pedido',
    discountType: DISCOUNT_TYPE.PERCENT,
    value: 10,
    minOrderAmount: 30,
    maxDiscountAmount: 15,
    usageLimitPerUser: 3,
  },
  {
    code: 'BIENVENIDO',
    description: 'S/ 8 de descuento en tu primer pedido',
    discountType: DISCOUNT_TYPE.FIXED,
    value: 8,
    minOrderAmount: 35,
    maxDiscountAmount: null,
    usageLimitPerUser: 1,
  },
  {
    code: 'ENVIOGRATIS',
    description: 'Delivery gratis',
    discountType: DISCOUNT_TYPE.FREE_DELIVERY,
    value: 0,
    minOrderAmount: 40,
    maxDiscountAmount: null,
    usageLimitPerUser: 2,
  },
];

export const seedCoupons = async (): Promise<void> => {
  for (const coupon of COUPONS) {
    await Coupon.findOrCreate({
      where: { code: coupon.code },
      defaults: {
        ...coupon,
        validFrom: null,
        validUntil: null,
        usageLimit: null,
        usedCount: 0,
        isActive: true,
      },
    });
  }

  logger.success(`Cupones listos: ${COUPONS.map((coupon) => coupon.code).join(', ')}`);
};
