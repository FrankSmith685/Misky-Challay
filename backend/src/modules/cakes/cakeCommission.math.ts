import { round2 } from '@shared/utils/money';

/**
 * Base de comision de la plataforma: todos los conceptos vendidos del pedido,
 * despues de descuentos y sin incluir delivery. Los pedidos antiguos pueden no
 * tener el descuento repartido en cada linea; en ese caso se resta el remanente
 * global una sola vez.
 */
export const orderProductBase = (
  lines: Array<{ productId: number | null; lineTotal: number; discountTotal: number }>,
  orderDiscountTotal = 0,
): number => {
  const productGross = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  const allocatedDiscount = lines.reduce((sum, line) => sum + Number(line.discountTotal), 0);
  const legacyRemainder = Math.max(0, Number(orderDiscountTotal) - allocatedDiscount);
  return round2(Math.max(0, productGross - allocatedDiscount - legacyRemainder));
};

export const cakeLineBase = (
  lines: Array<{ productId: number | null; lineTotal: number; discountTotal: number }>,
  cakeProductIds: ReadonlySet<number>,
  orderDiscountTotal = 0,
): number => {
  const cakeGross = lines.reduce((sum, line) => sum + (line.productId !== null && cakeProductIds.has(line.productId) ? Number(line.lineTotal) : 0), 0);
  const totalGross = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  const cakeLineDiscount = lines.reduce((sum, line) => sum + (line.productId !== null && cakeProductIds.has(line.productId) ? Number(line.discountTotal) : 0), 0);
  const allocatedDiscount = lines.reduce((sum, line) => sum + Number(line.discountTotal), 0);
  // Los pedidos antiguos guardaban el descuento solo en orders, no en cada línea.
  const legacyRemainder = Math.max(0, orderDiscountTotal - allocatedDiscount);
  return round2(Math.max(0, cakeGross - cakeLineDiscount - (totalGross > 0 ? legacyRemainder * cakeGross / totalGross : 0)));
};

export const accruedCakeBase = (fullCakeBase: number, paidValue: number, collectible: number): number =>
  round2(collectible > 0 ? fullCakeBase * Math.min(1, Math.max(0, paidValue) / collectible) : fullCakeBase);

export const cakeRefundShare = (fullCakeBase: number, collectible: number): number =>
  collectible > 0 ? Math.min(1, fullCakeBase / collectible) : 0;

export const cakeCommissionAmount = (base: number, adjustment: number, refund: number, rate: number): number =>
  round2(Math.max(0, base + adjustment - refund) * rate);
