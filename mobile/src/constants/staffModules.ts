import type { MaterialCommunityIcons } from '@expo/vector-icons';

export type StaffModuleKey =
  | 'dashboard' | 'orders' | 'cash' | 'dining' | 'kitchen' | 'delivery' | 'inventory'
  | 'procurement' | 'catalog' | 'builder' | 'media' | 'coupons' | 'plans' | 'coverage' | 'cakes'
  | 'experiences' | 'users' | 'roles' | 'complaints' | 'audit' | 'business' | 'design';

export interface StaffModule {
  key: StaffModuleKey;
  title: string;
  description: string;
  group: 'GENERAL' | 'OPERACION' | 'ABASTECIMIENTO' | 'NEGOCIO' | 'ADMINISTRACION';
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  permissions: string[];
  superAdminOnly?: boolean;
  branchScoped?: boolean;
  live?: boolean;
}

export const STAFF_GROUP_LABELS: Record<StaffModule['group'], string> = {
  GENERAL: 'Vista general',
  OPERACION: 'OperaciÃ³n diaria',
  ABASTECIMIENTO: 'Compras e inventario',
  NEGOCIO: 'Negocio',
  ADMINISTRACION: 'AdministraciÃ³n',
};

export const STAFF_MODULES: StaffModule[] = [
  { key: 'dashboard', title: 'Resumen', description: 'Ventas, pedidos, ticket promedio y ranking.', group: 'GENERAL', icon: 'view-dashboard-outline', permissions: ['report.sales.read', 'report.operations.read'], branchScoped: true },
  { key: 'orders', title: 'Pedidos', description: 'Todos los canales, estados, cliente y comprobante.', group: 'OPERACION', icon: 'clipboard-text-outline', permissions: ['order.read', 'order.update_status', 'order.cancel', 'payment.read', 'payment.refund'], branchScoped: true, live: true },
  { key: 'cash', title: 'Caja', description: 'Cobros por validar y control de rendimiento.', group: 'OPERACION', icon: 'cash-register', permissions: ['report.sales.read', 'payment.verify'], branchScoped: true, live: true },
  { key: 'kitchen', title: 'Cocina', description: 'Comandas grandes, tiempos y avance de preparaciÃ³n.', group: 'OPERACION', icon: 'chef-hat', permissions: ['kitchen.read', 'kitchen.operate'], branchScoped: true, live: true },

  { key: 'cakes', title: 'Mis tareas de tortas', description: 'Agenda, estaciones y tareas asignadas de Misky Challay.', group: 'OPERACION', icon: 'cake-variant-outline', permissions: ['kitchen.read'], branchScoped: true, live: true },
  { key: 'delivery', title: 'Reparto', description: 'Destinos, asignaciÃ³n y trazabilidad de entregas.', group: 'OPERACION', icon: 'bike-fast', permissions: ['delivery.read', 'delivery.assign', 'delivery.operate'], branchScoped: true, live: true },
  { key: 'inventory', title: 'Inventario', description: 'Stock crÃ­tico, consumo y compra sugerida.', group: 'OPERACION', icon: 'package-variant-closed', permissions: ['inventory.read', 'inventory.manage'], branchScoped: true, live: true },
  { key: 'procurement', title: 'Compras y lotes', description: 'Proveedores, Ã³rdenes recibidas, vencimientos y costos.', group: 'ABASTECIMIENTO', icon: 'truck-delivery-outline', permissions: ['procurement.read', 'procurement.manage'], branchScoped: true, live: true },
  { key: 'catalog', title: 'CatÃ¡logo', description: 'Productos, precios y publicaciÃ³n.', group: 'NEGOCIO', icon: 'food-apple-outline', permissions: ['catalog.product.read', 'catalog.product.write', 'catalog.product.publish', 'catalog.category.write', 'catalog.availability.write', 'allergen.write', 'dietary_tag.write'] },
  { key: 'builder', title: 'Constructor', description: 'Pasos, ingredientes e incompatibilidades.', group: 'NEGOCIO', icon: 'bowl-mix-outline', permissions: ['catalog.customization.write', 'allergen.write'] },
  { key: 'experiences', title: 'Experiencias QR', description: 'Revisión, publicación y pausa de experiencias vinculadas a pedidos.', group: 'NEGOCIO', icon: 'qrcode', permissions: ['experience.read', 'experience.write', 'experience.publish'], live: true },
  { key: 'media', title: 'Multimedia', description: 'ImÃ¡genes reutilizables de platos e ingredientes.', group: 'NEGOCIO', icon: 'image-multiple-outline', permissions: ['catalog.product.write', 'catalog.customization.write'] },
  { key: 'coupons', title: 'Cupones', description: 'Promociones, lÃ­mites y vigencias.', group: 'NEGOCIO', icon: 'ticket-percent-outline', permissions: ['promotion.manage'] },
  { key: 'coverage', title: 'Zonas y sucursales', description: 'Sedes, horarios y zonas de reparto.', group: 'ADMINISTRACION', icon: 'map-marker-radius-outline', permissions: ['geo.read', 'geo.write'] },
  { key: 'users', title: 'Usuarios', description: 'Personal, estado, roles y locales asignados.', group: 'ADMINISTRACION', icon: 'account-group-outline', permissions: ['user.read', 'user.manage'] },
  { key: 'roles', title: 'Roles y permisos', description: 'QuÃ© puede hacer cada perfil operativo.', group: 'ADMINISTRACION', icon: 'shield-account-outline', permissions: ['role.read', 'role.manage'] },
  { key: 'complaints', title: 'Reclamaciones', description: 'Seguimiento y plazo de respuesta legal.', group: 'ADMINISTRACION', icon: 'book-open-page-variant-outline', permissions: ['complaint.manage'] },
  { key: 'audit', title: 'BitÃ¡cora', description: 'Cambios sensibles y responsables.', group: 'ADMINISTRACION', icon: 'history', permissions: ['audit.read'] },
  { key: 'business', title: 'Datos del negocio', description: 'Identidad legal, pagos y comunicaciones.', group: 'ADMINISTRACION', icon: 'store-cog-outline', permissions: [], superAdminOnly: true },
  { key: 'design', title: 'Sistema de diseÃ±o', description: 'GuÃ­a visual, componentes y tokens de referencia.', group: 'ADMINISTRACION', icon: 'palette-outline', permissions: ['settings.manage'] },
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
