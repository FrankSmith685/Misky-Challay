export type ServiceMode = 'DELIVERY' | 'PICKUP' | 'DINE_IN';

export interface User {
  id: number;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
  branchIds: number[];
}

export interface Branch {
  id: number;
  cityId?: number;
  name: string;
  slug: string;
  addressLine: string;
  phone: string | null;
  prepMinutes: number;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  sortOrder: number;
}

export interface Nutrition {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sodium?: number;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: 'FIXED' | 'CUSTOMIZABLE';
  categoryId: number;
  imageUrl: string | null;
  isFeatured: boolean;
  priceFrom: number;
  defaultVariantId: number | null;
  defaultVariantName: string | null;
  defaultVariantPrice: number;
  nutrition: Nutrition | null;
  dietaryTags: string[];
  allergens: string[];
  isAvailable: boolean;
}

export interface ProductVariant {
  id: number;
  name: string;
  sku: string;
  basePrice: number;
  isDefault: boolean;
  nutrition: Nutrition | null;
}

export interface ProductDetail {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  type: 'FIXED' | 'CUSTOMIZABLE';
  categoryId: number;
  imageUrl: string | null;
  isAvailable: boolean;
  variants: ProductVariant[];
  dietaryTags: Array<{ code: string; name: string }>;
  allergens: Array<{ code: string; name: string; warning: string | null }>;
}

/** GET /catalog/allergens — RN-009: informamos, no garantizamos ausencia de trazas. */
export interface Allergen {
  id: number;
  code: string;
  name: string;
  warning: string | null;
}

/** GET /catalog/dietary-tags — vegano, sin gluten, alto en proteina... */
export interface DietaryTag {
  id: number;
  code: string;
  name: string;
  color: string | null;
}

/**
 * Filtros de GET /catalog/products, tal cual los declara
 * backend/src/modules/catalog/catalog.validation.ts.
 * `dietaryTags` y `excludeAllergens` viajan como lista separada por comas.
 */
export interface ProductFilters {
  branchId?: number | null;
  categoryId?: number | null;
  search?: string;
  /** Codigos de etiqueta dietetica: el producto debe tenerlas TODAS. */
  dietaryTags?: string[];
  /** Codigos de alergeno: el producto no debe tener NINGUNO. */
  excludeAllergens?: string[];
  maxCalories?: number;
  minProtein?: number;
  featured?: boolean;
}

export interface ProductReview {
  id: number;
  rating: number;
  comment: string | null;
  verifiedPurchase: boolean;
  authorName: string;
  createdAt: string;
}

export interface ProductReviews {
  summary: { average: number; count: number };
  reviews: ProductReview[];
}

export interface PendingReview {
  orderItemId: number;
  orderNumber: string;
  deliveredAt: string | null;
  productId: number;
  productName: string;
  productSlug: string | null;
  imageUrl: string | null;
}

export interface Recommendation {
  product: Product;
  reason: string;
}

export interface NewsletterStatus {
  subscribed: boolean;
  email: string | null;
}

export interface PublicSettings {
  business: {
    legalName: string;
    commercialName: string;
    ruc: string;
    address: string;
    phone: string;
    email: string;
    supportEmail: string;
    complaintResponseDays: number;
  };
  igvRate: number;
  cod: { enabled: boolean; maxAmount: number };
  invoicing: { boletaDniThreshold: number };
  localPayments: {
    yapeEnabled: boolean; yapePhone: string; yapeRecipient: string; yapeQrImageUrl: string;
    plinEnabled: boolean; plinPhone: string; plinRecipient: string; plinQrImageUrl: string;
    instructions: string;
  };
  /** Pago con tarjeta. En false el backend rechazaria el cobro: no lo ofrezcas. */
  payments: { onlineEnabled: boolean };
  /**
   * Compuerta de la app. `minSupportedVersion` bloquea, `latestVersion` solo
   * avisa y `maintenance` corta el servicio con un mensaje propio.
   * `maintenance` va en castellano porque asi lo publica el servidor.
   */
  mobile: {
    minSupportedVersion: string;
    latestVersion: string;
    updateUrl: string;
    maintenance: { activo: boolean; mensaje: string };
  };
}

export type OrderStatus = 'PENDING_PAYMENT' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED';

/**
 * Reparto de un pedido a domicilio. Llega en GET /orders/:orderNumber y es lo
 * que permite pintar el seguimiento con repartidor y ETA. Es `null` en recojo y
 * en consumo en local. El telefono del repartidor NO viaja a proposito: es un
 * dato personal suyo.
 */
export interface OrderDelivery {
  id: number;
  status: 'PENDING' | 'ASSIGNED' | 'PICKED_UP' | 'ON_ROUTE' | 'DELIVERED' | 'FAILED';
  etaMinutes: number | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  driver: { id: number; fullName: string; vehicle: string | null } | null;
}

export interface OrderSummary {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  deliveryType: ServiceMode;
  grandTotal: number | string;
  currency: string;
  placedAt: string;
  branch?: { id: number; name: string; addressLine: string; phone: string | null } | null;
  items?: Array<{ id: number; productNameSnapshot?: string; quantity: number }>;
  /* Las filas del historial ya traen estos campos; el detalle los declara sin
   * `?` mas abajo. Aqui son opcionales porque el listado puede recortarlos. */
  serviceMode?: 'ASAP' | 'SCHEDULED';
  scheduledAt?: string | null;
  cancelReason?: string | null;
  addressSnapshotJson?: { line1?: string; districtName?: string | null } | null;
  discounts?: Array<{ code: string | null; description: string; amount: number | string }>;
}

export interface OrderItemDetail {
  id: number;
  productId: number | null;
  variantId: number | null;
  productNameSnapshot: string;
  variantNameSnapshot: string | null;
  descriptionSnapshot: string | null;
  quantity: number;
  unitPrice: number | string;
  lineTotal: number | string;
  nutritionSnapshotJson: Nutrition | null;
  allergenSnapshotJson: string[] | null;
  customizations?: Array<{
    id: number; groupId: number | null; groupNameSnapshot: string; optionId: number | null;
    optionNameSnapshot: string; quantity: number; priceDelta: number | string; lineExtra: number | string;
  }>;
}

export interface OrderDetail extends OrderSummary {
  serviceMode: 'ASAP' | 'SCHEDULED';
  scheduledAt: string | null;
  subtotal: number | string;
  deliveryFee: number | string;
  discountTotal: number | string;
  taxRate?: number | string;
  taxTotal: number | string;
  confirmedAt: string | null;
  cancelReason: string | null;
  documentType?: 'BOLETA' | 'FACTURA';
  invoiceStatus?: 'PENDING' | 'ISSUED' | 'FAILED' | 'VOIDED';
  invoiceSeries?: string | null;
  invoiceNumber?: string | null;
  invoiceIssuedAt?: string | null;
  invoicePdfUrl?: string | null;
  invoiceXmlUrl?: string | null;
  addressSnapshotJson: { line1: string; reference?: string | null; districtName?: string | null } | null;
  items: OrderItemDetail[];
  discounts: Array<{ code: string | null; description: string; amount: number | string }>;
  statusHistory?: Array<{ id?: number; toStatus: OrderStatus; source: string; comment?: string | null; createdAt: string }>;
  delivery?: OrderDelivery | null;
}

export interface OrderWithPayment {
  order: OrderDetail;
  payment: null | {
    id: number; status: string; provider: string; providerReference?: string | null;
    checkoutUrl: string | null; amount: number | string; currency?: string; failureReason?: string | null;
    /**
     * Si el enlace de pago guardado todavia sirve para cobrar. En false, y con el
     * pedido en PENDING_PAYMENT, hay que pedir uno nuevo con
     * `ordersApi.retryPayment` antes de abrir nada: abrir el viejo lleva a una
     * sesion caducada y el cliente se queda sin poder pagar.
     */
    checkoutUrlIsLive?: boolean;
    mobileClaim?: null | { status: 'PENDING' | 'APPROVED' | 'REJECTED'; operationCode: string; submittedAt: string; reviewedAt: string | null; rejectionReason: string | null };
  };
}

export interface BuilderOption {
  id: number;
  name: string;
  description: string | null;
  imageUrl: string | null;
  dietaryTags: string[];
  allergens: string[];
  spiceLevel: number;
  priceDelta: number;
  chargeAlways: boolean;
  nutrition: Nutrition;
  maxPerItem: number;
  isAvailable: boolean;
  incompatibleWith: number[];
  incompatibilities: Array<{ optionId: number; reason: string | null }>;
}

export interface BuilderGroup {
  id: number;
  code: string;
  name: string;
  description: string | null;
  selectionType: 'SINGLE' | 'MULTIPLE';
  minSelection: number;
  maxSelection: number;
  freeQuantity: number;
  sortOrder: number;
  options: BuilderOption[];
}

export interface BuilderConfig {
  product: { id: number; name: string; slug: string; type: string; imageUrl: string | null };
  variants: Array<{ id: number; name: string; basePrice: number; isDefault: boolean; nutrition: Nutrition }>;
  groups: BuilderGroup[];
  presets: Array<{
    id: number; code: string; name: string; description: string | null; imageUrl: string | null;
    badge: string | null; isFeatured: boolean; selections: Array<{ optionId: number; quantity: number }>;
  }>;
}

export interface CustomizationQuote {
  productId: number;
  variantId: number;
  variantName?: string;
  quantity: number;
  basePrice: number;
  extrasTotal: number;
  unitPrice: number;
  lineTotal: number;
  nutrition: Nutrition;
  selections: Array<{
    groupId: number; groupName: string; optionId: number; optionName: string;
    quantity: number; chargedQuantity: number; priceDelta: number; lineExtra: number;
  }>;
  description: string;
}

export interface CartItem {
  id: string;
  productId: number;
  variantId: number;
  productName: string;
  variantName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  description: string;
  selections: Array<{ optionId: number; quantity: number; groupName?: string; optionName?: string }>;
  specialInstructions?: string;
}

export interface Address {
  id: number;
  label: string;
  line1: string;
  reference: string | null;
  districtId: number | null;
  ubigeoCode: string | null;
  departmentName: string | null;
  provinceName: string | null;
  districtName: string | null;
  latitude: number | null;
  longitude: number | null;
  isDefault: boolean;
}

export interface AddressSuggestion {
  id: string; label: string; line1: string; district: string | null; districtId: number | null;
  ubigeoCode: string | null; province?: string | null; region?: string | null;
  latitude: number | null; longitude: number | null; precision?: 'exact' | 'near' | 'approximate' | 'manual';
}

export interface CoverageResult {
  covered: boolean;
  reason?: string;
  /**
   * `polygon` es la zona de reparto dibujable sobre el mapa (el equivalente
   * movil del `coveragePolygon` de la web). El backend lo devuelve en
   * `{ lat, lng }`, no en `{ latitude, longitude }`: conviertelo antes de
   * pasarselo a <Polygon> de react-native-maps.
   */
  zone?: {
    id: number; name: string; deliveryFee: number; minimumOrder: number; estimatedMinutes: number;
    polygon?: Array<{ lat: number; lng: number }> | null;
  };
  branch?: { id: number; name: string; addressLine: string; prepMinutes: number; isOpenNow: boolean };
  etaMinutes?: number;
  demandLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  etaSource?: 'LIVE_ROUTE' | 'ESTIMATE';
  routeDistanceKm?: number;
  /** Local mas cercano cuando el punto queda fuera de reparto: «recoge aqui». */
  nearestPickup?: { id: number; name: string; addressLine: string; distanceKm: number; isOpenNow: boolean };
}

export interface CheckoutInput {
  items: Array<{ productId: number; variantId: number; quantity: number; selections: Array<{ optionId: number; quantity: number }>; specialInstructions?: string }>;
  deliveryType: 'DELIVERY' | 'PICKUP';
  serviceMode: 'ASAP' | 'SCHEDULED';
  deliverySlotId?: number;
  address?: { label?: string; line1: string; reference?: string; districtId?: number; latitude?: number; longitude?: number };
  branchId?: number;
  couponCode?: string;
  useWallet?: boolean;
  paymentMethod: 'ONLINE' | 'CASH' | 'YAPE' | 'PLIN';
  mobilePayment?: { operationCode: string; payerPhone?: string };
  client?: 'WEB' | 'MOBILE';
  billing: { documentType: 'BOLETA' | 'FACTURA'; docNumber?: string; name?: string; address?: string };
  contactName?: string;
  contactPhone?: string;
  notes?: string;
}

export interface DeliverySlot {
  id: number;
  startsAt: string;
  endsAt: string;
  available: number;
  orderCutoffAt: string;
}

export type PlanBenefitType = 'DISCOUNT_PERCENT' | 'FREE_DELIVERY';

export interface Plan {
  id: number;
  code: string;
  name: string;
  description: string | null;
  price: number | string;
  grantedCredit: number | string;
  validityDays: number;
  isFeatured: boolean;
  benefits: Array<{ id: number; type: PlanBenefitType; value: number | string; maxAmountPerOrder: number | string | null; description: string }>;
}

export interface WalletSummary {
  balance: number;
  paidBalance: number;
  bonusBalance: number;
  currency: string;
  nextExpiry: string | null;
  paidCreditValidityDays: number;
  lots: Array<{ id: number; kind: 'PAID' | 'BONUS' | 'REFUND' | 'LEGACY'; remainingAmount: number; expiresAt: string | null; userPlanId: number | null; planName: string | null }>;
  activePlans: Array<{ id: number; name: string; credit: number; paidRemaining: number; bonusRemaining: number; expiresAt: string | null; benefits: Array<{ type: PlanBenefitType; description: string }> }>;
}

export interface WalletTransaction {
  id: number;
  type: 'CREDIT' | 'DEBIT' | 'ADJUSTMENT' | 'EXPIRATION' | 'REFUND';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface PlanPurchase {
  userPlanId: number | null;
  status: string | null;
  checkoutUrl: string | null;
  reused: boolean;
}

export interface OrderQuote {
  subtotal: number; deliveryFee: number; discountTotal: number; walletAmount: number; walletBalance: number;
  taxRate: number; taxableBase: number; taxTotal: number; grandTotal: number; currency: string;
  minimumOrder: number; meetsMinimum: boolean; branchId: number; branchName: string; isOpenNow: boolean;
  etaMinutes: number; demandLevel: 'LOW' | 'MEDIUM' | 'HIGH'; routeDistanceKm?: number;
  discounts: Array<{ source: string; code: string; description: string; amount: number }>;
}

export interface PlacedOrder {
  orderNumber: string; orderId: number; status: string; grandTotal: number; currency: string;
  checkoutUrl: string | null; provider: string | null; reused: boolean;
}

export interface DiningProduct {
  productId: number; name: string; imageUrl: string | null; categoryId: number; variantId: number;
  variantName: string | null; price: number; isAvailable: boolean;
  offering: null | { id: number; name: string; remaining: number | null; activeNow: boolean };
}

export interface PublicDiningTable {
  table: { id: number; code: string; area: string; capacity: number };
  branch: { id: number; name: string };
  command: { orderNumber: string; status: string; total: number } | null;
  catalog: DiningProduct[];
}

/* ------------------------------------------------------------------ */
/* Cuenta del cliente (modulo account del backend)                     */
/* ------------------------------------------------------------------ */

/** GET|PATCH /account/profile. El correo no se edita desde aqui. */
export interface Profile {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface ProfileInput {
  firstName?: string;
  lastName?: string;
  /** Cadena vacia borra el telefono guardado. */
  phone?: string;
}

/**
 * GET|PUT /account/food-preferences.
 * Cuando el cliente nunca las guardo, el backend devuelve el mismo objeto con
 * las listas vacias y los objetivos en null (no un 404).
 */
export interface FoodPreferences {
  allergens: string[];
  dietaryTags: string[];
  dislikedOptionIds: number[];
  calorieTarget: number | null;
  proteinTarget: number | null;
}

export interface SavedBowlSelection {
  optionId: number;
  quantity: number;
}

/**
 * GET /account/saved-bowls. `product` y `variant` solo vienen en el listado:
 * al crear o editar, el backend responde con la fila desnuda.
 * Los precios llegan como DECIMAL, es decir cadena: normalizalos con Number().
 */
export interface SavedBowl {
  id: number;
  name: string;
  productId: number;
  variantId: number;
  selections: SavedBowlSelection[];
  product?: { id: number; name: string; slug: string; imageUrl: string | null } | null;
  variant?: { id: number; name: string; basePrice: number | string } | null;
  updatedAt: string;
}

export interface SavedBowlInput {
  name: string;
  productId: number;
  variantId: number;
  selections: SavedBowlSelection[];
}

/**
 * Aviso de vuelta a stock (GET|POST|DELETE /account/availability-alerts).
 * Se da de alta por producto Y sede: el mismo plato puede faltar en una cocina
 * y estar en otra, asi que sin `branchId` el aviso no se puede crear.
 */
export interface AvailabilityAlert {
  id: number;
  productId: number;
  branchId: number;
  notifyEmail: boolean;
  notifyInApp: boolean;
  status: 'WAITING' | 'NOTIFIED' | 'CANCELLED';
  notifiedAt: string | null;
  createdAt: string;
}

export interface AvailabilityAlertInput {
  productId: number;
  branchId: number;
  notifyEmail: boolean;
  notifyInApp: boolean;
}

/** Lo que devuelve DELETE /account: que se llevo la baja y que se queda. */
export interface DeleteAccountSummary {
  deletedAt: string;
  /** Pedidos y comprobantes que se conservan por obligacion tributaria (SUNAT). */
  keptOrders: number;
  /** Saldo de billetera que se pierde al cerrar la cuenta. */
  forfeitedWalletBalance: number;
  removed: {
    addresses: number;
    savedBowls: number;
    favorites: number;
    availabilityAlerts: number;
    devices: number;
  };
}

export type NotificationStatus = 'SENT' | 'FAILED';

/** GET /account/notifications — la campana. Devuelve como mucho 50, las mas nuevas primero. */
export interface AccountNotification {
  id: number;
  subject: string;
  template: string;
  channel: string;
  status: NotificationStatus;
  /** Destino al pulsar el aviso (por ejemplo la ficha del plato que volvio a haber). */
  actionUrl: string | null;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
  order?: { orderNumber: string; status: OrderStatus } | null;
}

/**
 * El backend no publica un contador de no leidos: se deriva de la propia lista
 * (readAt === null). El servicio lo calcula una vez y lo entrega ya resuelto
 * para que la campana no lo recuente en cada render.
 */
export interface AccountNotificationsFeed {
  items: AccountNotification[];
  unreadCount: number;
}

/**
 * GET /account/purchase-context — donde entregamos, para rehidratar la app en un
 * dispositivo nuevo. `source` distingue lo que el cliente eligio de lo que
 * estamos suponiendo:
 *   SAVED           su ultima seleccion real
 *   DEFAULT_ADDRESS no hay seleccion; proponemos su direccion principal
 *   EMPTY           no hay nada que proponer, hay que preguntarle
 * Nunca trae cobertura: hay que volver a consultarla antes de dar la direccion por buena.
 */
export interface PurchaseContext {
  source: 'SAVED' | 'DEFAULT_ADDRESS' | 'EMPTY';
  deliveryType: 'DELIVERY' | 'PICKUP';
  cityId: number | null;
  branch: { id: number; name: string; addressLine: string } | null;
  address: Address | null;
}

export interface PurchaseContextInput {
  deliveryType: 'DELIVERY' | 'PICKUP';
  cityId?: number | null;
  branchId?: number | null;
  addressId?: number | null;
}
