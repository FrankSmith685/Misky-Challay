export type TicketStatus =
  | 'QUEUED'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'DISPATCHED'
  | 'CANCELLED';

export type DeliveryStatus =
  | 'PENDING'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'ON_ROUTE'
  | 'DELIVERED'
  | 'FAILED';

/** Los ocho estados del pedido, tal cual los declara el backend (ORDER_STATUS). */
export type AdminOrderStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

/**
 * Direccion congelada al comprar (AddressSnapshot del backend).
 * La REFERENCIA es lo que hace entregable un pedido en Peru y ya viajaba dentro
 * del snapshot sin que nadie la tipara ni la pintara.
 */
export interface OrderAddressSnapshot {
  label?: string;
  line1: string;
  reference?: string | null;
  districtId?: number | null;
  districtName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface TicketItem {
  designImages?: import('@features/cakes/components/OrderCakeReference').OrderDesignImage[];
  id: number;
  themeSnapshotJson?: import('@features/cakes/cakeThemes.service').ThemeSnapshot | null;
  name: string;
  quantity: number;
  description: string | null;
  specialInstructions: string | null;
  customizations: Array<{ group: string; option: string; quantity: number }>;
  /**
   * Alergenos congelados al comprar (`OrderItem.allergenSnapshotJson`). El backend
   * los rellena de verdad en el checkout; la proyeccion del tablero no los mapeaba,
   * asi que la cocina no veia el dato que el sistema ya tenia guardado.
   * Opcional mientras el paquete D no amplia la proyeccion.
   */
  allergens?: string[];
}

export interface KitchenTicket {
    id: number;
    status: TicketStatus;
    priority: number;
    createdAt: string;
    acceptedAt: string | null;
    targetAt: string;
  notes: string | null;
  isLate: boolean;
  order: {
    id: number;
    orderNumber: string;
    deliveryType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
    diningTable?: { id: number; code: string; area: string } | null;
    serviceMode: 'ASAP' | 'SCHEDULED';
    scheduledAt: string | null;
    contactName: string | null;
    /** Solo indica una cobranza operativa pendiente; no expone importe ni datos financieros. */
    paymentDueOnDelivery: boolean;
    notes: string | null;
    items: TicketItem[];
  } | null;
}

/** Pedido pagado visible para Cocina antes de convertirse en comanda activa. */
export interface ScheduledKitchenOrder {
  id: number;
  orderNumber: string;
  deliveryType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  serviceMode: 'SCHEDULED';
  scheduledAt: string;
  releaseAt: string;
  contactName: string | null;
  diningTable?: { id: number; code: string; area: string } | null;
  notes: string | null;
  productionTasks?: Array<{ station: string; workDate: string; status: string; assigned: boolean }>;
  items: TicketItem[];
}

export interface KitchenBoard {
  tickets: KitchenTicket[];
  scheduled: ScheduledKitchenOrder[];
  stats: { queued: number; preparing: number; ready: number; late: number; scheduled: number };
}

export interface DiningTableRow {
  id: number;
  code: string;
  area: string;
  capacity: number;
  qrToken: string;
  qrEnabled: boolean;
  status: 'AVAILABLE' | 'OCCUPIED';
  command: null | {
    orderNumber: string;
    status: AdminOrderStatus | string;
    kitchenStatus: string | null;
    canAddItems: boolean;
    guestName: string | null;
    waiterName: string | null;
    total: number;
    subtotal: number;
    taxableBase: number;
    taxTotal: number;
    openedAt: string;
    items: Array<{ id: number; name: string; variant: string | null; quantity: number; unitPrice: number; total: number }>;
  };
}

export interface DiningProduct {
  productId: number;
  name: string;
  imageUrl: string | null;
  categoryId: number;
  variantId: number;
  variantName: string | null;
  price: number;
  isAvailable: boolean;
  offering: DiningOffering | null;
}

export interface DiningOffering {
  id: number;
  branchId: number;
  productId: number;
  variantId: number;
  name: string;
  price: number;
  weekdays: number[];
  startsAt: string;
  endsAt: string;
  dailyLimit: number | null;
  soldToday: number;
  remaining: number | null;
  activeNow: boolean;
  isActive: boolean;
}

export type DiningPaymentMethod = 'cash' | 'card' | 'yape' | 'plin';

export interface DiningReceipt {
  orderNumber: string;
  status: string;
  branchName: string;
  tableCode: string | null;
  guestName: string | null;
  documentType: 'BOLETA' | 'FACTURA';
  billingDocType: 'DNI' | 'RUC' | 'CE' | null;
  billingDocNumber: string | null;
  billingName: string | null;
  subtotal: number;
  taxableBase: number;
  taxTotal: number;
  total: number;
  items: Array<{ name: string; variant: string | null; quantity: number; unitPrice: number; total: number }>;
  payments: Array<{ method: DiningPaymentMethod; amount: number }>;
  issuedAt: string;
}

export interface PosProduct {
  productId: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  variantId: number;
  variantName: string | null;
  price: number;
  cakeSaleMode: 'STANDARD' | 'SEMI_CUSTOM' | 'ADVANCED';
}

export interface PosSaleResult {
  orderNumber: string;
  status: string;
  total: number;
  reused: boolean;
}

export interface Driver {
  vehicleType?: 'CAR' | 'MOTORCYCLE' | 'OTHER' | 'UNSPECIFIED';
  id: number;
  fullName: string;
  phone: string | null;
  vehicle: string | null;
  status: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
}

export interface DeliveryRow {
  evidence?: string[];
  proofJson?: Record<string, unknown> | null;
  id: number;
  status: DeliveryStatus;
  carrier: 'OWN' | 'EXTERNAL';
  cost: number;
  order: {
    orderNumber: string;
    deliveryVehicleType?: 'CAR' | null;
    deliveryHandlingInstructions?: string | null;
    /** Estado comercial/preparacion: impide retirar antes de que Cocina marque READY. */
    status: AdminOrderStatus;
    contactName: string | null;
    contactPhone: string | null;
    grandTotal: number;
    /** Nota del cliente ("timbre malogrado, tocar la puerta"). El include debe pedirla. */
    notes?: string | null;
    addressSnapshotJson: OrderAddressSnapshot | null;
  } | null;
  driver: { id: number; fullName: string; phone: string | null } | null;
}

export interface StockRow {
  inventoryItemId: number;
  itemType: 'INGREDIENT' | 'FINISHED_PRODUCT';
  code: string;
  imageUrl: string | null;
  allergens: string[] | null;
  usedInCake: boolean;
  name: string;
  unit: string;
  onHand: number;
  reserved: number;
  available: number;
  unitCost: number;
  averageUnitCost: number;
  stockValue: number;
  minLevel: number;
  isLow: boolean;
  stockStatus: 'OUT' | 'CRITICAL' | 'LOW' | 'HEALTHY';
  consumedLast7Days: number;
  averageDailyUsage: number;
  daysRemaining: number | null;
  targetLevel: number;
  suggestedPurchase: number;
  impactedOptions: string[];
  suggestedSubstitutes: string[];
}

export interface StockMovementRow {
  id: number;
  inventoryItemId: number;
  itemName: string;
  unit: string;
  type: 'PURCHASE' | 'RESERVE' | 'RELEASE' | 'CONSUME' | 'WASTE' | 'ADJUSTMENT';
  quantity: number;
  onHandAfter: number;
  reservedAfter: number;
  totalCost: number | null;
  reason: string | null;
  orderId: number | null;
  purchaseOrderId: number | null;
  lotId: number | null;
  actorName: string | null;
  createdAt: string;
}

export interface AuditLogRow {
  id: number;
  action: string;
  entity: string;
  entityId: string | null;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
  /** Quien lo hizo. La bitacora filtra por el. */
  actorId?: number | null;
  /** Nombre del responsable, si el endpoint lo resuelve; si no, se muestra el id. */
  actor?: { id: number; firstName: string | null; lastName: string | null; email: string | null } | null;
}

export interface AdminOrderRow {
  customerContactJson?: CustomerContactRecord | null;
  id: number;
  orderNumber: string;
  status: AdminOrderStatus | string;
  deliveryType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
  diningTableId?: number | null;
  waiterId?: number | null;
  source?: 'WEB' | 'POS';
  serviceMode?: 'ASAP' | 'SCHEDULED';
  scheduledAt?: string | null;
  grandTotal: number;
  placedAt: string;
  /** Estado del comprobante; el tablero lo usa para explicar el cierre real. */
  invoiceStatus?: 'PENDING' | 'ISSUED' | 'FAILED' | 'VOIDED' | string;
  contactName: string | null;
  /** Ya viajaba en la respuesta de /admin/orders: solo faltaba tiparlo. */
  contactPhone?: string | null;
  notes?: string | null;
  addressSnapshotJson?: OrderAddressSnapshot | null;
  branch?: { id: number; name: string; prepMinutes?: number } | null;
  diningTable?: { id: number; code: string; area: string } | null;
  kitchenTicket?: { id: number; status: TicketStatus } | null;
  kitchenReleaseAt?: string | null;
  cakeTasks?: Array<{ id: number; station: string; workDate: string; status: 'PENDING' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE'; assigned: boolean }>;
  items: Array<{ id: number; productNameSnapshot: string; quantity: number }>;
}

/** Linea de la ficha del pedido, con lo que Soporte necesita por telefono. */
export interface AdminOrderItemDetail {
  designImages?: import('@features/cakes/components/OrderCakeReference').OrderDesignImage[];
  id: number;
  hasReference?: boolean;
  themeSnapshotJson?: import('@features/cakes/cakeThemes.service').ThemeSnapshot | null;
  productNameSnapshot: string;
  variantNameSnapshot: string | null;
  descriptionSnapshot: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  specialInstructions: string | null;
  customizations: Array<{ group: string; option: string; quantity: number; priceDelta: number }>;
  allergens: string[];
}

export interface AdminOrderPayment {
  id: number;
  provider: string;
  method: string | null;
  status: 'CREATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED' | string;
  amount: number;
  currency: string;
  providerReference: string | null;
  failureReason: string | null;
  createdAt: string;
  mobileClaim: {
    status: 'PENDING' | 'OBSERVED' | 'APPROVED' | 'REJECTED';
    operationCode: string;
    payerPhone: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    rejectionReason: string | null;
  } | null;
  /** Devoluciones ya emitidas contra ese cobro (RN-019). */
  refunds: Array<{
    id: number;
    amount: number;
    reason: string;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | string;
    createdAt: string;
  }>;
}

/**
 * Ficha completa del pedido (`GET /admin/orders/:orderNumber`).
 *
 * El endpoint lo crea el paquete F; el contrato se declara aqui para que la
 * pantalla y el servicio hablen el mismo idioma desde el primer dia.
 */
export interface AdminOrderDetail extends AdminOrderRow {
  customerEmail?: string | null;
  termsAcceptanceJson?: import('@features/orders/components/OrderTermsEvidence').TermsAcceptance | null;
  deliveryProof?: { id: number; status: string; recipientName: string | null; evidence: string[] } | null;
  deliveryVehicleType?: 'CAR' | null;
  deliveryHandlingInstructions?: string | null;
  serviceMode: 'ASAP' | 'SCHEDULED';
  scheduledAt: string | null;
  cancelReason: string | null;
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  walletAmount: number;
  taxRate: number;
  taxableBase: number;
  taxTotal: number;
  currency: string;
  documentType: 'BOLETA' | 'FACTURA';
  billingDocType: 'DNI' | 'CE' | 'RUC' | null;
  billingDocNumber: string | null;
  billingName: string | null;
  billingAddress: string | null;
  invoiceStatus: 'PENDING' | 'ISSUED' | 'FAILED' | 'VOIDED' | string;
  invoiceSeries: string | null;
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
  invoiceProviderReference: string | null;
  invoicePdfUrl: string | null;
  invoiceXmlUrl: string | null;
  receiptMode: 'INTERNAL_ONLY' | 'EXTERNAL_MANUAL' | 'INTEGRATED';
  receiptSettings: {
    mode: 'INTERNAL_ONLY' | 'EXTERNAL_MANUAL' | 'INTEGRATED';
    autoPrintKitchenTicket: boolean;
    autoPrintCustomerTicket: boolean;
    paperWidth: 58 | 80;
  };
  internalReceiptFirstPrintedAt: string | null;
  internalReceiptLastPrintedAt: string | null;
  internalReceiptPrintCount: number;
  detailItems: AdminOrderItemDetail[];
  statusHistory: Array<{
    id: number;
    fromStatus: string | null;
    toStatus: string;
    source: string;
    comment: string | null;
    createdAt: string;
  }>;
  payments: AdminOrderPayment[];
}

export interface CustomerContactRecord { contactedAt: string; actorId: number; channel: 'WHATSAPP' | 'EMAIL' | 'PHONE' | 'IN_PERSON'; note: string }

export interface Reports {
  range: { from: string; to: string };
  /**
   * OPCIONAL a proposito: el Resumen se abre tambien con `report.operations.read`
   * y entonces el servidor no envia el bloque de dinero. El administrador de
   * sucursal, que solo tiene ese permiso, aterrizaba cada dia en una pantalla en
   * blanco. Quien pinte importes tiene que comprobar antes que el bloque llego.
   */
  sales?: {
    orders: number;
    revenue: number;
    averageTicket: number;
    discounts: number;
    deliveryShare: number;
  };
  quality: { cancelled: number; cancellationRate: number };
  operations: { avgPrepMinutes: number; ticketsMeasured: number };
  experience: Partial<Record<'COVERAGE_SUCCESS' | 'COVERAGE_FAIL' | 'COVERAGE_ERROR' | 'CHECKOUT_START' | 'CHECKOUT_ERROR' | 'PAYMENT_REDIRECT' | 'APP_OPEN' | 'MENU_VIEW' | 'PRODUCT_VIEW' | 'FAVORITE_ADD' | 'FAVORITE_REMOVE' | 'CART_ADD' | 'CHECKOUT_STEP' | 'ORDER_COMPLETED' | 'REVIEW_SUBMITTED' | 'RECOMMENDATION_OPEN', number>>;
  topProducts: Array<{ name: string; units: number; revenue: number }>;
  channelBreakdown: Array<{ channel: string; orders: number; revenue: number }>;
  hourlySales: Array<{ hour: number; orders: number; revenue: number }>;
  paymentBreakdown?: Array<{ method: string; transactions: number; amount: number }>;
}

export interface PendingMobilePayment {
  id: number;
  paymentId: number;
  provider: 'yape' | 'plin';
  operationCode: string;
  payerPhone: string | null;
  amount: number;
  currency: string;
  submittedAt: string;
  order: {
    orderNumber: string;
    contactName: string | null;
    contactPhone: string | null;
    placedAt: string;
    branch: { id: number; name: string } | null;
  };
}
