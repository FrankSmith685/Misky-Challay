export interface CheckoutItemInput {
  designDetails?: { inscription: string; occasion: string; finish: string };
  productId: number;
  variantId: number;
  quantity: number;
  selections: Array<{ optionId: number; quantity: number }>;
  designQuoteId?: number;
  themeId?: number;
  themeVersion?: number;
  requestedServings?: number;
  specialInstructions?: string;
  referenceDataUrl?: string;
  aiProposalDataUrl?: string;
}

export interface CheckoutAddressInput {
  label?: string;
  line1: string;
  reference?: string;
  hasHouseNumber?: boolean;
  districtId?: number;
  latitude?: number;
  longitude?: number;
}

export interface CheckoutInput {
  gift?: { recipientName: string; recipientPhone?: string; hidePrices: boolean; message?: string };
  experience?: { packageId: number; expectedVersion: number; brief: string };
  items: CheckoutItemInput[];
  deliveryType: 'DELIVERY' | 'PICKUP';
  serviceMode: 'ASAP' | 'SCHEDULED';
  address?: CheckoutAddressInput;
  branchId?: number;
  deliverySlotId?: number;
  couponCode?: string;
  /** Gastar el saldo del plan en este pedido. */
  useWallet?: boolean;
  /** Pasarela online o transferencia directa a la cuenta de Yape/Plin de la tienda. */
  paymentMethod?: 'ONLINE' | 'YAPE' | 'PLIN' | 'CASH';
  mobilePayment?: { operationCode: string; payerPhone?: string };
  /** Comprobante: boleta (por defecto) o factura con RUC. */
  billing?: {
    documentType: 'BOLETA' | 'FACTURA';
    docNumber?: string;
    name?: string;
    address?: string;
  };
  contactName?: string;
  contactPhone?: string;
  whatsappOptIn?: boolean;
  termsAccepted?: boolean;
  termsVersion?: number;
  notes?: string;
}

export interface QuoteLine {
  allergenCodes?: string[];
  productId: number;
  variantId: number;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  description: string;
}

export interface OrderQuote {
  deliveryVehicleType?: 'CAR' | null;
  deliveryHandlingInstructions?: string | null;
  productSubtotal?: number;
  experience?: { name: string; price: number } | null;
  /** Se cotizó el importe, pero falta elegir una franja para confirmar disponibilidad. */
  schedulePending?: boolean;
  /** Reglas vigentes del catálogo; prevalecen sobre los datos guardados del carrito. */
  requiresScheduledDelivery?: boolean;
  minimumLeadHours?: number;
  items: QuoteLine[];
  subtotal: number;
  deliveryFee: number;
  /** Recargo logístico aplicado una sola vez por un pedido con tortas. */
  cakeDeliveryFee?: number;
  extraDeliveryFee?: number;
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
  paymentPlan?: 'FULL' | 'DEPOSIT_BALANCE';
  depositAmount?: number;
  balanceAmount?: number;
  balanceDueAt?: string | null;
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
  paymentPlan?: 'FULL' | 'DEPOSIT_BALANCE';
  depositAmount?: number;
  balanceAmount?: number;
  balanceDueAt?: string | null;
  depositPaidAt?: string | null;
  balancePaidAt?: string | null;
  currency: string;
  checkoutUrl: string | null;
  provider: string | null;
  reused: boolean;
}

/**
 * Personalizacion historica de una linea (RN-017: nombres congelados). `optionId`
 * es referencial y puede venir nulo si la opcion desaparecio del catalogo.
 */
export interface OrderItemCustomizationDetail {
  id: number;
  groupId: number | null;
  groupNameSnapshot: string;
  optionId: number | null;
  optionNameSnapshot: string;
  quantity: number;
  priceDelta: number;
  lineExtra: number;
}

export interface OrderItemDetail {
  designDetailsJson?: { inscription: string; occasion: string; finish: string ; originalInstructions?: string } | null;
  designImages?: import('@features/cakes/components/OrderCakeReference').OrderDesignImage[];
  id: number;
  reference?: { id: number } | null;
  specialInstructions?: string | null;
  designQuoteId?: number | null;
  requestedServings?: number | null;
  themeSnapshotJson?: import('@features/cakes/cakeThemes.service').ThemeSnapshot | null;
  /**
   * Referencias al catalogo vivo, no al pedido: el detalle se lee siempre de los
   * snapshots. Solo sirven para reconstruir el carrito en "Volver a pedir", y por
   * eso pueden ser nulas cuando el producto ya no existe.
   */
  productId: number | null;
  variantId: number | null;
  productNameSnapshot: string;
  variantNameSnapshot?: string | null;
  descriptionSnapshot: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  allergenSnapshotJson: string[] | null;
  customizations?: OrderItemCustomizationDetail[];
}

export interface OrderDetail {
  termsAcceptanceJson?: import('@features/orders/components/OrderTermsEvidence').TermsAcceptance | null;
  deliveryVehicleType?: 'CAR' | null;
  deliveryHandlingInstructions?: string | null;
  directPaymentState?: string | null;
  id: number;
  orderNumber: string;
  status: string;
  whatsappOptInAt?: string | null;
  deliveryType: 'DELIVERY' | 'PICKUP';
  serviceMode: 'ASAP' | 'SCHEDULED';
  scheduledAt: string | null;
  subtotal: number;
  deliveryFee: number;
  cakeDeliveryFee?: number;
  discountTotal: number;
  walletAmount?: number;
  /** Tasa de IGV congelada en el pedido. Opcional: los pedidos anteriores al
   *  desglose no la tienen. */
  taxRate?: number;
  /** IGV incluido en el total. Informativo: no se suma. */
  taxTotal: number;
  grandTotal: number;
  paymentPlan?: 'FULL' | 'DEPOSIT_BALANCE';
  depositAmount?: number;
  balanceAmount?: number;
  balanceDueAt?: string | null;
  depositPaidAt?: string | null;
  balancePaidAt?: string | null;
  currency: string;
  /** Comprobante emitido para el pedido. */
  documentType?: 'BOLETA' | 'FACTURA';
  billingDocType?: string | null;
  billingDocNumber?: string | null;
  billingName?: string | null;
  invoiceStatus?: 'PENDING' | 'ISSUED' | 'FAILED' | 'VOIDED';
  invoiceSeries?: string | null;
  invoiceNumber?: string | null;
  invoiceIssuedAt?: string | null;
  invoicePdfUrl?: string | null;
  invoiceXmlUrl?: string | null;
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
  customerSummary?: import('@features/orders/components/OrderFinancialSummary').CustomerOrderSummary;
  directPayments?: import('./directPayments').DirectPaymentDetail[];
  order: OrderDetail;
  payment: {
    id: number;
    status: string;
    provider: string;
    checkoutUrl: string | null;
    checkoutUrlIsLive?: boolean;
    amount: number;
    stage?: 'FULL' | 'DEPOSIT' | 'BALANCE';
    directPayment?: import('./directPayments').DirectPaymentDetail | null;
  } | null;
}
