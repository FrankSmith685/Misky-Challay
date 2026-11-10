import { ROLES } from './constants';

/** Catálogo inicial de estaciones. Se copia a `teams` al ejecutar los seeders. */
export const TEAM_DEFINITIONS = [
  { key: 'direccion', name: 'Dirección', description: 'Supervisa ventas, costos, rentabilidad y decisiones operativas de sus sucursales.', route: '/admin/resumen', icon: 'shield-check', roleCodes: [ROLES.ADMIN, ROLES.BRANCH_ADMIN], branchRequired: true, minimumPerBranch: 1, sortOrder: 10 },
  { key: 'ventas', name: 'Ventas y caja', description: 'Atiende el punto de venta, pedidos, pagos y cierre de caja.', route: '/admin/punto-venta', icon: 'shopping-cart', roleCodes: [ROLES.CASHIER, ROLES.BRANCH_ADMIN], branchRequired: true, minimumPerBranch: 1, sortOrder: 20 },
  { key: 'produccion', name: 'Producción y cocina', description: 'Prepara tortas, administra comandas y confirma consumos.', route: '/admin/cocina', icon: 'chef-hat', roleCodes: [ROLES.KITCHEN, ROLES.BRANCH_ADMIN], branchRequired: true, minimumPerBranch: 1, sortOrder: 30 },
  { key: 'abastecimiento', name: 'Compras y almacén', description: 'Compra insumos, recibe lotes, controla vencimientos y costos.', route: '/admin/compras', icon: 'truck', roleCodes: [ROLES.PURCHASING, ROLES.BRANCH_ADMIN], branchRequired: true, minimumPerBranch: 1, sortOrder: 40 },
  { key: 'diseno', name: 'Diseño y catálogo', description: 'Mantiene productos, opciones, fotos, recetas y personalización.', route: '/admin/constructor', icon: 'palette', roleCodes: [ROLES.CATALOG_MANAGER, ROLES.BRANCH_ADMIN], branchRequired: false, minimumPerBranch: 0, sortOrder: 50 },
  { key: 'soporte', name: 'Soporte y control', description: 'Gestiona usuarios, permisos, reclamos y trazabilidad.', route: '/admin/usuarios', icon: 'users', roleCodes: [ROLES.SUPPORT, ROLES.AUDITOR, ROLES.ADMIN], branchRequired: false, minimumPerBranch: 0, sortOrder: 60 },
] as const;

export type TeamDefinition = (typeof TEAM_DEFINITIONS)[number];
