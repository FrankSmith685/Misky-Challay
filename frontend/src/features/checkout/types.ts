import type { Nutrition } from '@features/catalog/types';

export interface CheckoutItemInput {
  productId: number;
  variantId: number;
  quantity: number;
  selections: Array<{ optionId: number; quantity: number }>;
}

export interface CheckoutAddressInput {
  label?: string;
  line1: string;
  reference?: string;
  districtId?: number;
  latitude?: number;
  longitude?: number;
}

export interface CheckoutInput {
  items: CheckoutItemInput[];
  deliveryType: 'DELIVERY' | 'PICKUP';
  serviceMode: 'ASAP' | 'SCHEDULED';
  address?: CheckoutAddressInput;
  branchId?: number;
  deliverySlotId?: number;
  couponCode?: string;
  /** Gastar el saldo del plan en este pedido. */
  useWallet?: boolean;
  /** ONLINE = tarjeta; CASH = pago contra entrega (efectivo al recibir). */
  paymentMethod?: 'ONLINE' | 'CASH';
  /** Comprobante: boleta (por defecto) o factura con RUC. */
  billing?: {
    documentType: 'BOLETA' | 'FACTURA';
    docNumber?: string;
    name?: string;
    address?: string;
  };
  contactName?: string;
  contactPhone?: string;
  notes?: string;
}

export interface QuoteLine {
  productId: number;
  variantId: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  description: string;
  nutrition: Nutrition;
}

export interface OrderQuote {
  items: QuoteLine[];
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  /** Saldo del plan aplicado a este pedido. */
  walletAmount: number;
  /** Saldo total disponible del cliente. */
  walletBalance: number;
  /** Tasa de IGV aplicada (0.18 = 18%). */
  taxRate: number;
  /** Valor de venta: el total sin el IGV que ya lleva dentro. */
  taxableBase: number;
  /** IGV incluido en el precio. Informativo: NO se suma al total. */
  taxTotal: number;
  /** Lo que se cobra con tarjeta (0 si el saldo cubrio todo). */
  grandTotal: number;
  currency: string;
  minimumOrder: number;
  meetsMinimum: boolean;
  branchId: number;
  branchName: string;
  isOpenNow: boolean;
  etaMinutes: number;
  demandLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  etaSource: 'LIVE_ROUTE' | 'ESTIMATE';
  routeDistanceKm?: number;
  discounts: Array<{ source: string; code: string; description: string; amount: number }>;
}

export interface PlacedOrder {
  orderNumber: string;
  orderId: number;
  status: string;
  grandTotal: number;
  currency: string;
  checkoutUrl: string | null;
  provider: string | null;
  reused: boolean;
}

export interface OrderItemDetail {
  id: number;
  productNameSnapshot: string;
  descriptionSnapshot: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  nutritionSnapshotJson: Nutrition | null;
  allergenSnapshotJson: string[] | null;
}

export interface OrderDetail {
  id: number;
  orderNumber: string;
  status: string;
  deliveryType: 'DELIVERY' | 'PICKUP';
  serviceMode: 'ASAP' | 'SCHEDULED';
  scheduledAt: string | null;
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  /** Tasa de IGV congelada en el pedido. Opcional: los pedidos anteriores al
   *  desglose no la tienen. */
  taxRate?: number;
  /** IGV incluido en el total. Informativo: no se suma. */
  taxTotal: number;
  grandTotal: number;
  currency: string;
  /** Comprobante emitido para el pedido. */
  documentType?: 'BOLETA' | 'FACTURA';
  billingDocType?: string | null;
  billingDocNumber?: string | null;
  billingName?: string | null;
  placedAt: string;
  confirmedAt: string | null;
  cancelReason: string | null;
  addressSnapshotJson: { line1: string; districtName?: string | null } | null;
  items: OrderItemDetail[];
  discounts: Array<{ code: string | null; description: string; amount: number }>;
  branch?: { id: number; name: string; addressLine: string } | null;
  statusHistory?: Array<{ toStatus: string; source: string; createdAt: string }>;
}

export interface OrderWithPayment {
  order: OrderDetail;
  payment: {
    id: number;
    status: string;
    provider: string;
    checkoutUrl: string | null;
    amount: number;
  } | null;
}
