import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type StaffModuleKey =
  | 'dashboard' | 'orders' | 'cash' | 'dining' | 'kitchen' | 'delivery' | 'inventory'
  | 'catalog' | 'builder' | 'media' | 'coupons' | 'plans' | 'coverage'
  | 'users' | 'roles' | 'complaints' | 'audit' | 'business' | 'design';

export interface StaffModule {
  key: StaffModuleKey;
  title: string;
  description: string;
  group: 'GENERAL' | 'OPERACION' | 'NEGOCIO' | 'ADMINISTRACION';
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  permissions: string[];
  superAdminOnly?: boolean;
  branchScoped?: boolean;
  live?: boolean;
}

export const STAFF_GROUP_LABELS: Record<StaffModule['group'], string> = {
  GENERAL: 'Vista general',
  OPERACION: 'Operación diaria',
  NEGOCIO: 'Negocio',
  ADMINISTRACION: 'Administración',
};

export const STAFF_MODULES: StaffModule[] = [
  { key: 'dashboard', title: 'Resumen', description: 'Ventas, pedidos, ticket promedio y ranking.', group: 'GENERAL', icon: 'view-dashboard-outline', permissions: ['report.sales.read', 'report.operations.read'], branchScoped: true },
  { key: 'orders', title: 'Pedidos', description: 'Todos los canales, estados, cliente y comprobante.', group: 'OPERACION', icon: 'clipboard-text-outline', permissions: ['order.read', 'order.update_status', 'order.cancel', 'payment.read', 'payment.refund'], branchScoped: true, live: true },
  { key: 'cash', title: 'Caja', description: 'Cobros por validar y control de rendimiento.', group: 'OPERACION', icon: 'cash-register', permissions: ['report.sales.read', 'payment.verify'], branchScoped: true, live: true },
  { key: 'dining', title: 'Salón y comandas', description: 'Mesas, QR, cuentas abiertas y atención en local.', group: 'OPERACION', icon: 'table-chair', permissions: ['dining.read', 'dining.operate'], branchScoped: true, live: true },
  { key: 'kitchen', title: 'Cocina', description: 'Comandas grandes, tiempos y avance de preparación.', group: 'OPERACION', icon: 'chef-hat', permissions: ['kitchen.read', 'kitchen.operate'], branchScoped: true, live: true },
  { key: 'delivery', title: 'Reparto', description: 'Destinos, asignación y trazabilidad de entregas.', group: 'OPERACION', icon: 'bike-fast', permissions: ['delivery.read', 'delivery.assign', 'delivery.operate'], branchScoped: true, live: true },
  { key: 'inventory', title: 'Inventario', description: 'Stock crítico, consumo y compra sugerida.', group: 'OPERACION', icon: 'package-variant-closed', permissions: ['inventory.read', 'inventory.manage'], branchScoped: true, live: true },
  { key: 'catalog', title: 'Catálogo', description: 'Productos, precios, nutrición y publicación.', group: 'NEGOCIO', icon: 'food-apple-outline', permissions: ['catalog.product.read', 'catalog.product.write', 'catalog.product.publish', 'catalog.category.write', 'catalog.availability.write', 'nutrition.read', 'nutrition.write', 'allergen.write', 'dietary_tag.write'] },
  { key: 'builder', title: 'Constructor', description: 'Pasos, ingredientes, macros e incompatibilidades.', group: 'NEGOCIO', icon: 'bowl-mix-outline', permissions: ['catalog.customization.write', 'nutrition.write', 'allergen.write'] },
  { key: 'media', title: 'Multimedia', description: 'Imágenes reutilizables de platos e ingredientes.', group: 'NEGOCIO', icon: 'image-multiple-outline', permissions: ['catalog.product.write', 'catalog.customization.write'] },
  { key: 'coupons', title: 'Cupones', description: 'Promociones, límites y vigencias.', group: 'NEGOCIO', icon: 'ticket-percent-outline', permissions: ['promotion.manage'] },
  { key: 'plans', title: 'Planes', description: 'Saldo, bonos y beneficios comerciales.', group: 'NEGOCIO', icon: 'wallet-giftcard', permissions: ['plan.read', 'plan.manage'] },
  { key: 'coverage', title: 'Cobertura y locales', description: 'Sedes, horarios y zonas de reparto.', group: 'ADMINISTRACION', icon: 'map-marker-radius-outline', permissions: ['geo.read', 'geo.write'] },
  { key: 'users', title: 'Usuarios', description: 'Personal, estado, roles y locales asignados.', group: 'ADMINISTRACION', icon: 'account-group-outline', permissions: ['user.read', 'user.manage'] },
  { key: 'roles', title: 'Roles y permisos', description: 'Qué puede hacer cada perfil operativo.', group: 'ADMINISTRACION', icon: 'shield-account-outline', permissions: ['role.read', 'role.manage'] },
  { key: 'complaints', title: 'Reclamaciones', description: 'Seguimiento y plazo de respuesta legal.', group: 'ADMINISTRACION', icon: 'book-open-page-variant-outline', permissions: ['complaint.manage'] },
  { key: 'audit', title: 'Bitácora', description: 'Cambios sensibles y responsables.', group: 'ADMINISTRACION', icon: 'history', permissions: ['audit.read'] },
  { key: 'business', title: 'Datos del negocio', description: 'Identidad legal, pagos y comunicaciones.', group: 'ADMINISTRACION', icon: 'store-cog-outline', permissions: [], superAdminOnly: true },
  { key: 'design', title: 'Sistema de diseño', description: 'Guía visual, componentes y tokens de referencia.', group: 'ADMINISTRACION', icon: 'palette-outline', permissions: ['settings.manage'] },
];

export const canAccessStaffModule = (
  module: StaffModule,
  user: { permissions: string[]; isSuperAdmin: boolean },
): boolean => {
  if (user.isSuperAdmin) return true;
  if (module.superAdminOnly) return false;
  return module.permissions.some((permission) => user.permissions.includes(permission));
};

export const isStaffUser = (user: { permissions: string[]; isSuperAdmin: boolean } | null): boolean =>
  Boolean(user && (user.isSuperAdmin || user.permissions.length > 0));
