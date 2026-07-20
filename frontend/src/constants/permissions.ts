/**
 * Espejo de los permisos del backend (config/constants.ts).
 * Se usan para armar el menu y decidir que pantallas mostrar.
 * La validacion REAL la hace el backend en cada endpoint.
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

  INVENTORY_READ: 'inventory.read',
  INVENTORY_MANAGE: 'inventory.manage',

  DELIVERY_READ: 'delivery.read',
  DELIVERY_ASSIGN: 'delivery.assign',

  PAYMENT_REFUND: 'payment.refund',

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
} as const;
