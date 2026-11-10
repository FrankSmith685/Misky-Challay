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

export const DELIVERY_TYPE = {
  DELIVERY: 'DELIVERY',
  PICKUP: 'PICKUP',
  /** Consumo dentro del local: se asigna a una mesa y nunca abre reparto. */
  DINE_IN: 'DINE_IN',
} as const;
export type DeliveryType = (typeof DELIVERY_TYPE)[keyof typeof DELIVERY_TYPE];

export const ORDER_SOURCE = { WEB: 'WEB', POS: 'POS' } as const;
export type OrderSource = (typeof ORDER_SOURCE)[keyof typeof ORDER_SOURCE];

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
  MERCADOPAGO: 'mercadopago',
  MERCADOPAGO_SUBSCRIPTION: 'mercadopago_subscription',
  WALLET: 'wallet',
  CASH: 'cash',
  POS: 'pos',
  YAPE: 'yape',
  PLIN: 'plin',
} as const;
export type PaymentProviderName = (typeof PAYMENT_PROVIDER)[keyof typeof PAYMENT_PROVIDER];

/** Como paga el cliente al hacer el checkout. */
export const PAYMENT_METHOD = {
  ONLINE: 'ONLINE',
  CASH: 'CASH',
  YAPE: 'YAPE',
  PLIN: 'PLIN',
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

/** Origen y tratamiento de cada lote de saldo de la billetera. */
export const WALLET_LOT_KIND = {
  /** Dinero efectivamente pagado por el cliente al comprar un plan. */
  PAID: 'PAID',
  /** Crédito adicional entregado gratuitamente por una promoción o plan. */
  BONUS: 'BONUS',
  /** Saldo restituido por la cancelación de un pedido. */
  REFUND: 'REFUND',
  /** Saldo anterior a la introducción del control por lotes. No se recorta al migrar. */
  LEGACY: 'LEGACY',
} as const;
export type WalletLotKind = (typeof WALLET_LOT_KIND)[keyof typeof WALLET_LOT_KIND];

export const WALLET_LOT_STATUS = {
  ACTIVE: 'ACTIVE',
  EXHAUSTED: 'EXHAUSTED',
  EXPIRED: 'EXPIRED',
} as const;
export type WalletLotStatus = (typeof WALLET_LOT_STATUS)[keyof typeof WALLET_LOT_STATUS];

/** Política comercial: el capital pagado y los reembolsos pueden usarse por 180 días. */
export const PAID_CREDIT_VALIDITY_DAYS = 180;
/** Versión de las condiciones específicas aceptadas al adquirir un plan. */
export const PLAN_TERMS_VERSION = '2026-08-02';

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
  PURCHASING: 'purchasing',
  WAITER: 'waiter',
  CASHIER: 'cashier',
  DISPATCHER: 'dispatcher',
  DRIVER: 'driver',
  SUPPORT: 'support',
  CATALOG_MANAGER: 'catalog_manager',
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
  EXPERIENCE_READ: 'experience.read',
  EXPERIENCE_WRITE: 'experience.write',
  EXPERIENCE_PUBLISH: 'experience.publish',
  KITCHEN_READ: 'kitchen.read',
  KITCHEN_OPERATE: 'kitchen.operate',

  // --- Salón y comandas ---
  DINING_READ: 'dining.read',
  DINING_OPERATE: 'dining.operate',
  POS_SELL: 'pos.sell',

  // --- Inventario ---
  INVENTORY_READ: 'inventory.read',
  INVENTORY_MANAGE: 'inventory.manage',
  PROCUREMENT_READ: 'procurement.read',
  PROCUREMENT_MANAGE: 'procurement.manage',

  // --- Delivery ---
  DELIVERY_READ: 'delivery.read',
  DELIVERY_ASSIGN: 'delivery.assign',
  DELIVERY_OPERATE: 'delivery.operate',

  // --- Pagos ---
  PAYMENT_READ: 'payment.read',
  PAYMENT_VERIFY: 'payment.verify',
  INVOICE_MANAGE: 'invoice.manage',
  PAYMENT_REFUND: 'payment.refund',

  // --- Planes y promociones ---
  PLAN_READ: 'plan.read',
  PLAN_MANAGE: 'plan.manage',
  PROMOTION_MANAGE: 'promotion.manage',

  // --- Reportes ---
  REPORT_SALES_READ: 'report.sales.read',
  REPORT_OPERATIONS_READ: 'report.operations.read',
  CAKE_FINANCE_READ: 'cake.finance.read',
  CAKE_FINANCE_MANAGE: 'cake.finance.manage',

  // --- Gobierno de accesos ---
  CUSTOMER_READ: 'customer.read',
  CUSTOMER_MANAGE: 'customer.manage',
  USER_READ: 'user.read',
  USER_MANAGE: 'user.manage',
  ROLE_READ: 'role.read',
  ROLE_MANAGE: 'role.manage',
  AUDIT_READ: 'audit.read',
  AUDIT_EXPORT: 'audit.export',
  AUDIT_VERIFY: 'audit.verify',
  AUDIT_RETENTION: 'audit.retention',
  SETTINGS_MANAGE: 'settings.manage',
  SETTINGS_DESIGN_READ: 'settings.design.read',
  SETTINGS_DESIGN_MANAGE: 'settings.design.manage',
  SETTINGS_DESIGN_PUBLISH: 'settings.design.publish',
  COMMUNICATION_READ: 'communication.read',
  COMMUNICATION_REPLY: 'communication.reply',
  COMPLAINT_MANAGE: 'complaint.manage',
  COMPLAINT_READ: 'complaint.read',
  COMPLAINT_RESPOND: 'complaint.respond',
  COMPLAINT_EXPORT: 'complaint.export',
  COMPLAINT_REOPEN: 'complaint.reopen',
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
      { code: PERMISSIONS.CATALOG_CUSTOMIZATION_WRITE, label: 'Editar el constructor de tortas' },
      { code: PERMISSIONS.ALLERGEN_WRITE, label: 'Gestionar alérgenos' },
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
      { code: PERMISSIONS.EXPERIENCE_READ, label: 'Ver experiencias QR' },
      { code: PERMISSIONS.EXPERIENCE_WRITE, label: 'Crear y editar experiencias QR' },
      { code: PERMISSIONS.EXPERIENCE_PUBLISH, label: 'Publicar experiencias QR' },
      { code: PERMISSIONS.KITCHEN_READ, label: 'Ver el tablero de cocina' },
      { code: PERMISSIONS.KITCHEN_OPERATE, label: 'Aceptar, preparar y despachar tickets' },
    ],
  },
  {
    module: 'dining',
    label: 'Salón y comandas',
    permissions: [
      { code: PERMISSIONS.DINING_READ, label: 'Ver mesas y comandas' },
      { code: PERMISSIONS.DINING_OPERATE, label: 'Abrir, cobrar y cerrar comandas' },
      { code: PERMISSIONS.POS_SELL, label: 'Vender en el punto de venta' },
    ],
  },
  {
    module: 'inventory',
    label: 'Inventario',
    permissions: [
      { code: PERMISSIONS.INVENTORY_READ, label: 'Ver el stock' },
      { code: PERMISSIONS.INVENTORY_MANAGE, label: 'Registrar entradas, mermas y ajustes' },
      { code: PERMISSIONS.PROCUREMENT_READ, label: 'Ver proveedores, compras, lotes y costos' },
      { code: PERMISSIONS.PROCUREMENT_MANAGE, label: 'Gestionar proveedores y órdenes de compra' },
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
      { code: PERMISSIONS.PAYMENT_VERIFY, label: 'Validar pagos Yape y Plin' },
      { code: PERMISSIONS.INVOICE_MANAGE, label: 'Registrar comprobantes emitidos' },
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
      { code: PERMISSIONS.CAKE_FINANCE_READ, label: 'Ver costos y margen de tortas' },
      { code: PERMISSIONS.CAKE_FINANCE_MANAGE, label: 'Registrar gastos, pagos y tarifas de tortas' },
    ],
  },
  {
    module: 'access',
    label: 'Usuarios y accesos',
    permissions: [
      { code: PERMISSIONS.CUSTOMER_READ, label: 'Ver clientes y su actividad' },
      { code: PERMISSIONS.CUSTOMER_MANAGE, label: 'Bloquear o reactivar clientes' },
      { code: PERMISSIONS.USER_READ, label: 'Ver usuarios internos' },
      { code: PERMISSIONS.USER_MANAGE, label: 'Crear usuarios y asignar roles' },
      { code: PERMISSIONS.ROLE_READ, label: 'Ver roles' },
      { code: PERMISSIONS.ROLE_MANAGE, label: 'Crear y editar roles' },
      { code: PERMISSIONS.AUDIT_READ, label: 'Ver la bitacora de auditoria' },
        { code: PERMISSIONS.AUDIT_EXPORT, label: 'Exportar la bitacora con motivo' },
        { code: PERMISSIONS.AUDIT_VERIFY, label: 'Verificar la integridad de la bitacora' },
        { code: PERMISSIONS.AUDIT_RETENTION, label: 'Gestionar la retencion de auditoria' },
      { code: PERMISSIONS.SETTINGS_MANAGE, label: 'Cambiar la configuracion del sistema' },
      { code: PERMISSIONS.SETTINGS_DESIGN_READ, label: 'Consultar el sistema de diseño' },
      { code: PERMISSIONS.SETTINGS_DESIGN_MANAGE, label: 'Editar borradores del sistema de diseño' },
      { code: PERMISSIONS.SETTINGS_DESIGN_PUBLISH, label: 'Publicar el sistema de diseño' },
      { code: PERMISSIONS.COMMUNICATION_READ, label: 'Consultar conversaciones y avisos (alcance global)' },
      { code: PERMISSIONS.COMMUNICATION_REPLY, label: 'Atender conversaciones y reintentar avisos (alcance global)' },
      { code: PERMISSIONS.COMPLAINT_MANAGE, label: 'Gestionar el Libro de Reclamaciones' },
      { code: PERMISSIONS.COMPLAINT_READ, label: 'Consultar reclamos y datos personales' },
      { code: PERMISSIONS.COMPLAINT_RESPOND, label: 'Responder reclamos' },
      { code: PERMISSIONS.COMPLAINT_EXPORT, label: 'Exportar el Libro de Reclamaciones' },
      { code: PERMISSIONS.COMPLAINT_REOPEN, label: 'Reabrir reclamos atendidos' },
    ],
  },
];

/**
 * COMPUERTA DE VERSION DE LA APP MOVIL
 * ---------------------------------------------------------------------------
 * La app pregunta estos valores al arrancar (GET /settings/public) y decide sola:
 * si su version es menor que la minima soportada, bloquea y lleva a la tienda.
 *
 * Es la unica pieza que NO se puede anadir de forma retroactiva: una instalacion
 * que ya esta en el telefono de un cliente solo obedece lo que su primera version
 * sabia consultar. Por eso el bloque viaja desde el primer dia, aunque hoy no
 * bloquee a nadie.
 *
 * Los valores por defecto son deliberadamente permisivos (nadie queda fuera y el
 * mantenimiento esta apagado). Se ajustan por variables de entorno, sin publicar
 * codigo nuevo: MOBILE_MIN_SUPPORTED_VERSION, MOBILE_LATEST_VERSION,
 * MOBILE_UPDATE_URL, MOBILE_UPDATE_URL_ANDROID, MOBILE_UPDATE_URL_IOS,
 * MOBILE_MAINTENANCE y MOBILE_MAINTENANCE_MESSAGE.
 */
export const MOBILE_APP = {
  /** Mientras nadie configure otra cosa, ninguna instalacion queda bloqueada. */
  MIN_SUPPORTED_VERSION: '0.0.0',
  /** '0.0.0' significa "no hay novedad publicada": la app no propone actualizar. */
  LATEST_VERSION: '0.0.0',
  /** Identificador de la app en ambas tiendas (mobile/app.json). */
  BUNDLE_ID: 'com.verdebowl.app',
  MAINTENANCE_MESSAGE: 'Estamos haciendo mejoras en el servicio. Vuelve a intentarlo en unos minutos.',
} as const;

/** Version de la app movil: MAYOR.MENOR.PARCHE. Lo que no encaje aqui se ignora. */
export const MOBILE_VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/**
 * Canales de aviso del telefono. Android los lista por separado en los ajustes del
 * sistema: asi el cliente puede silenciar los avisos de disponibilidad sin perder
 * el estado de su pedido. Los mismos identificadores deben existir en la app; si
 * falta uno, Android muestra el aviso en su canal de respaldo (no se pierde).
 */
export const PUSH_CHANNEL = {
  ORDER_UPDATES: 'order-updates',
  KITCHEN_OPERATIONS: 'kitchen-operations',
  PLAN_UPDATES: 'plan-updates',
  AVAILABILITY: 'availability-alerts',
  SUPPORT: 'support-updates',
} as const;
export type PushChannelId = (typeof PUSH_CHANNEL)[keyof typeof PUSH_CHANNEL];

/** Plantilla con la que se registra cada aviso push en `notifications`. */
export const PUSH_TEMPLATE = {
  ORDER_STATUS: 'ORDER_STATUS_PUSH',
  KITCHEN_OPERATION: 'KITCHEN_OPERATION_PUSH',
  PLAN_ACTIVATED: 'PLAN_ACTIVATED_PUSH',
  PRODUCT_AVAILABLE: 'PRODUCT_AVAILABLE_PUSH',
  COMPLAINT_RESPONDED: 'COMPLAINT_RESPONDED_PUSH',
} as const;
export type PushTemplate = (typeof PUSH_TEMPLATE)[keyof typeof PUSH_TEMPLATE];

export const CURRENCY = 'PEN';
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
