/**
 * Espejo de los permisos del backend (config/constants.ts).
 * Se usan para armar el menu y decidir que pantallas mostrar.
 * La validacion REAL la hace el backend en cada endpoint.
 *
 * PARIDAD OBLIGATORIA: `npm run check:permissions` compara clave por clave este
 * objeto contra PERMISSIONS del backend y falla si divergen. Se anadio porque el
 * espejo se quedo en 33 de 36 permisos y las tres ausencias (delivery.operate,
 * payment.read, plan.read) dejaron sin interfaz al Repartidor, a los pagos y a
 * los planes de Soporte: el panel no podia ni nombrar lo que el backend ya
 * exigia.
 */
export const PERM = {
  CATALOG_PRODUCT_READ: 'catalog.product.read',
  CATALOG_PRODUCT_WRITE: 'catalog.product.write',
  CATALOG_PRODUCT_PUBLISH: 'catalog.product.publish',
  CATALOG_CATEGORY_WRITE: 'catalog.category.write',
  CATALOG_AVAILABILITY_WRITE: 'catalog.availability.write',
  CATALOG_CUSTOMIZATION_WRITE: 'catalog.customization.write',

  NUTRITION_READ: 'nutrition.read',
  NUTRITION_WRITE: 'nutrition.write',
  ALLERGEN_WRITE: 'allergen.write',
  DIETARY_TAG_WRITE: 'dietary_tag.write',

  GEO_READ: 'geo.read',
  GEO_WRITE: 'geo.write',

  ORDER_READ: 'order.read',
  ORDER_UPDATE_STATUS: 'order.update_status',
  ORDER_CANCEL: 'order.cancel',

  KITCHEN_READ: 'kitchen.read',
  KITCHEN_OPERATE: 'kitchen.operate',

  DINING_READ: 'dining.read',
  DINING_OPERATE: 'dining.operate',

  INVENTORY_READ: 'inventory.read',
  INVENTORY_MANAGE: 'inventory.manage',

  DELIVERY_READ: 'delivery.read',
  DELIVERY_ASSIGN: 'delivery.assign',
  /** Avanzar el reparto. Es lo unico que distingue al Repartidor del Despachador. */
  DELIVERY_OPERATE: 'delivery.operate',

  PAYMENT_READ: 'payment.read',
  PAYMENT_VERIFY: 'payment.verify',
  INVOICE_MANAGE: 'invoice.manage',
  PAYMENT_REFUND: 'payment.refund',

  PLAN_READ: 'plan.read',
  PLAN_MANAGE: 'plan.manage',
  PROMOTION_MANAGE: 'promotion.manage',

  REPORT_SALES_READ: 'report.sales.read',
  REPORT_OPERATIONS_READ: 'report.operations.read',

  USER_READ: 'user.read',
  USER_MANAGE: 'user.manage',
  ROLE_READ: 'role.read',
  ROLE_MANAGE: 'role.manage',
  AUDIT_READ: 'audit.read',
  SETTINGS_MANAGE: 'settings.manage',
  COMPLAINT_MANAGE: 'complaint.manage',
} as const;
