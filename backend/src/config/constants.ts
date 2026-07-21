/**
 * Constantes de dominio compartidas por todos los modulos.
 * Reflejan las reglas de negocio del analisis funcional (RN-001 a RN-022).
 */

export const ORDER_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY: 'READY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
} as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** Transiciones validas del ciclo de vida del pedido (figura 3 del analisis). */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: ['REFUNDED'],
  REFUNDED: [],
};

export const DELIVERY_TYPE = { DELIVERY: 'DELIVERY', PICKUP: 'PICKUP' } as const;
export type DeliveryType = (typeof DELIVERY_TYPE)[keyof typeof DELIVERY_TYPE];

/**
 * Comprobante de pago (SUNAT). BOLETA al consumidor final; FACTURA a una empresa
 * (da credito fiscal y exige RUC + razon social).
 */
export const DOCUMENT_TYPE = { BOLETA: 'BOLETA', FACTURA: 'FACTURA' } as const;
export type DocumentType = (typeof DOCUMENT_TYPE)[keyof typeof DOCUMENT_TYPE];

/** Documento de identidad del receptor del comprobante. */
export const BILLING_DOC_TYPE = { DNI: 'DNI', RUC: 'RUC', CE: 'CE' } as const;
export type BillingDocType = (typeof BILLING_DOC_TYPE)[keyof typeof BILLING_DOC_TYPE];

/**
 * Estado de emision del comprobante ante el OSE/SUNAT. Nace PENDING: los datos ya
 * estan capturados, pero la emision real (XML+CDR) se hace cuando haya OSE contratado.
 */
export const INVOICE_STATUS = {
  PENDING: 'PENDING',
  ISSUED: 'ISSUED',
  FAILED: 'FAILED',
  VOID: 'VOID',
} as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];

export const SERVICE_MODE = { ASAP: 'ASAP', SCHEDULED: 'SCHEDULED' } as const;
export type ServiceMode = (typeof SERVICE_MODE)[keyof typeof SERVICE_MODE];

export const PRODUCT_TYPE = { FIXED: 'FIXED', CUSTOMIZABLE: 'CUSTOMIZABLE' } as const;
export type ProductType = (typeof PRODUCT_TYPE)[keyof typeof PRODUCT_TYPE];

export const PAYMENT_STATUS = {
  CREATED: 'CREATED',
  PENDING: 'PENDING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];

/**
 * Proveedor de cada pago. `stripe` y `wallet` ya existian; `cash` es el pago contra
 * entrega: el pedido se confirma sin cobro online y el efectivo se cobra al entregar.
 */
export const PAYMENT_PROVIDER = {
  STRIPE: 'stripe',
  WALLET: 'wallet',
  CASH: 'cash',
} as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDER)[keyof typeof PAYMENT_PROVIDER];

/** Como paga el cliente al hacer el checkout. */
export const PAYMENT_METHOD = {
  ONLINE: 'ONLINE',
  CASH: 'CASH',
} as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

export const WALLET_TX_TYPE = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  ADJUSTMENT: 'ADJUSTMENT',
  EXPIRATION: 'EXPIRATION',
  REFUND: 'REFUND',
} as const;
export type WalletTxType = (typeof WALLET_TX_TYPE)[keyof typeof WALLET_TX_TYPE];

export const USER_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  BLOCKED: 'BLOCKED',
  DELETED: 'DELETED',
} as const;
export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

/** Roles base del sistema (seccion 7 del analisis). Son de sistema: no se borran. */
export const ROLES = {
  CUSTOMER: 'customer',
  KITCHEN: 'kitchen',
  DISPATCHER: 'dispatcher',
  DRIVER: 'driver',
  SUPPORT: 'support',
  CATALOG_MANAGER: 'catalog_manager',
  NUTRITIONIST: 'nutritionist',
  BRANCH_ADMIN: 'branch_admin',
  ADMIN: 'admin',
  AUDITOR: 'auditor',
} as const;
export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

/**
 * PERMISOS (RBAC)
 * ---------------------------------------------------------------------------
 * El permiso es la unidad atomica: un verbo sobre un recurso (`recurso.accion`).
 * El ROL es solo un paquete de permisos con nombre. Las pantallas del panel se
 * muestran u ocultan segun los permisos, pero la seguridad real la valida el
 * backend en cada endpoint (seccion 7.1).
 *
 * Los permisos los define el CODIGO (esta lista). Los roles se arman con ellos
 * desde el panel, sin programar.
 */
export const PERMISSIONS = {
  // --- Catalogo ---
  CATALOG_PRODUCT_READ: 'catalog.product.read',
  CATALOG_PRODUCT_WRITE: 'catalog.product.write',
  CATALOG_PRODUCT_PUBLISH: 'catalog.product.publish',
  CATALOG_CATEGORY_WRITE: 'catalog.category.write',
  CATALOG_AVAILABILITY_WRITE: 'catalog.availability.write',
  CATALOG_CUSTOMIZATION_WRITE: 'catalog.customization.write',

  // --- Nutricion (el nutricionista toca esto y nada mas) ---
  NUTRITION_READ: 'nutrition.read',
  NUTRITION_WRITE: 'nutrition.write',
  ALLERGEN_WRITE: 'allergen.write',
  DIETARY_TAG_WRITE: 'dietary_tag.write',

  // --- Cobertura y sucursales ---
  GEO_READ: 'geo.read',
  GEO_WRITE: 'geo.write',

  // --- Pedidos ---
  ORDER_READ: 'order.read',
  ORDER_UPDATE_STATUS: 'order.update_status',
  ORDER_CANCEL: 'order.cancel',

  // --- Cocina ---
  KITCHEN_READ: 'kitchen.read',
  KITCHEN_OPERATE: 'kitchen.operate',

  // --- Inventario ---
  INVENTORY_READ: 'inventory.read',
  INVENTORY_MANAGE: 'inventory.manage',

  // --- Delivery ---
  DELIVERY_READ: 'delivery.read',
  DELIVERY_ASSIGN: 'delivery.assign',
  DELIVERY_OPERATE: 'delivery.operate',

  // --- Pagos ---
  PAYMENT_READ: 'payment.read',
  PAYMENT_REFUND: 'payment.refund',

  // --- Planes y promociones ---
  PLAN_READ: 'plan.read',
  PLAN_MANAGE: 'plan.manage',
  PROMOTION_MANAGE: 'promotion.manage',

  // --- Reportes ---
  REPORT_SALES_READ: 'report.sales.read',
  REPORT_OPERATIONS_READ: 'report.operations.read',

  // --- Gobierno de accesos ---
  USER_READ: 'user.read',
  USER_MANAGE: 'user.manage',
  ROLE_READ: 'role.read',
  ROLE_MANAGE: 'role.manage',
  AUDIT_READ: 'audit.read',
  SETTINGS_MANAGE: 'settings.manage',
  COMPLAINT_MANAGE: 'complaint.manage',
} as const;
export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Descripcion de cada permiso, agrupada por modulo.
 * La pantalla de roles la usa para pintar las casillas con nombres humanos.
 */
export const PERMISSION_CATALOG: Array<{
  module: string;
  label: string;
  permissions: Array<{ code: PermissionCode; label: string }>;
}> = [
  {
    module: 'catalog',
    label: 'Catalogo',
    permissions: [
      { code: PERMISSIONS.CATALOG_PRODUCT_READ, label: 'Ver productos' },
      { code: PERMISSIONS.CATALOG_PRODUCT_WRITE, label: 'Crear y editar productos' },
      { code: PERMISSIONS.CATALOG_PRODUCT_PUBLISH, label: 'Publicar o retirar productos' },
      { code: PERMISSIONS.CATALOG_CATEGORY_WRITE, label: 'Gestionar categorias' },
      { code: PERMISSIONS.CATALOG_AVAILABILITY_WRITE, label: 'Marcar disponibilidad por sucursal' },
      { code: PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE, label: 'Editar el constructor de bowls' },
    ],
  },
  {
    module: 'nutrition',
    label: 'Nutricion',
    permissions: [
      { code: PERMISSIONS.NUTRITION_READ, label: 'Ver informacion nutricional' },
      { code: PERMISSIONS.NUTRITION_WRITE, label: 'Editar calorias y macros' },
      { code: PERMISSIONS.ALLERGEN_WRITE, label: 'Gestionar alergenos' },
      { code: PERMISSIONS.DIETARY_TAG_WRITE, label: 'Gestionar etiquetas dietarias' },
    ],
  },
  {
    module: 'geo',
    label: 'Cobertura y sucursales',
    permissions: [
      { code: PERMISSIONS.GEO_READ, label: 'Ver zonas y sucursales' },
      { code: PERMISSIONS.GEO_WRITE, label: 'Editar zonas, sucursales y horarios' },
    ],
  },
  {
    module: 'orders',
    label: 'Pedidos',
    permissions: [
      { code: PERMISSIONS.ORDER_READ, label: 'Ver pedidos' },
      { code: PERMISSIONS.ORDER_UPDATE_STATUS, label: 'Cambiar el estado de un pedido' },
      { code: PERMISSIONS.ORDER_CANCEL, label: 'Cancelar pedidos' },
    ],
  },
  {
    module: 'kitchen',
    label: 'Cocina',
    permissions: [
      { code: PERMISSIONS.KITCHEN_READ, label: 'Ver el tablero de cocina' },
      { code: PERMISSIONS.KITCHEN_OPERATE, label: 'Aceptar, preparar y despachar tickets' },
    ],
  },
  {
    module: 'inventory',
    label: 'Inventario',
    permissions: [
      { code: PERMISSIONS.INVENTORY_READ, label: 'Ver el stock' },
      { code: PERMISSIONS.INVENTORY_MANAGE, label: 'Registrar entradas, mermas y ajustes' },
    ],
  },
  {
    module: 'delivery',
    label: 'Reparto',
    permissions: [
      { code: PERMISSIONS.DELIVERY_READ, label: 'Ver los repartos' },
      { code: PERMISSIONS.DELIVERY_ASSIGN, label: 'Asignar repartidores' },
      { code: PERMISSIONS.DELIVERY_OPERATE, label: 'Avanzar el estado de un reparto' },
    ],
  },
  {
    module: 'payments',
    label: 'Pagos',
    permissions: [
      { code: PERMISSIONS.PAYMENT_READ, label: 'Ver pagos' },
      { code: PERMISSIONS.PAYMENT_REFUND, label: 'Emitir reembolsos' },
    ],
  },
  {
    module: 'plans',
    label: 'Planes y promociones',
    permissions: [
      { code: PERMISSIONS.PLAN_READ, label: 'Ver planes y saldos' },
      { code: PERMISSIONS.PLAN_MANAGE, label: 'Gestionar planes y beneficios' },
      { code: PERMISSIONS.PROMOTION_MANAGE, label: 'Gestionar cupones y promociones' },
    ],
  },
  {
    module: 'reports',
    label: 'Reportes',
    permissions: [
      { code: PERMISSIONS.REPORT_SALES_READ, label: 'Ver reportes de ventas' },
      { code: PERMISSIONS.REPORT_OPERATIONS_READ, label: 'Ver reportes de operacion' },
    ],
  },
  {
    module: 'access',
    label: 'Usuarios y accesos',
    permissions: [
      { code: PERMISSIONS.USER_READ, label: 'Ver usuarios internos' },
      { code: PERMISSIONS.USER_MANAGE, label: 'Crear usuarios y asignar roles' },
      { code: PERMISSIONS.ROLE_READ, label: 'Ver roles' },
      { code: PERMISSIONS.ROLE_MANAGE, label: 'Crear y editar roles' },
      { code: PERMISSIONS.AUDIT_READ, label: 'Ver la bitacora de auditoria' },
      { code: PERMISSIONS.SETTINGS_MANAGE, label: 'Cambiar la configuracion del sistema' },
      { code: PERMISSIONS.COMPLAINT_MANAGE, label: 'Gestionar el Libro de Reclamaciones' },
    ],
  },
];

export const CURRENCY = 'PEN';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
