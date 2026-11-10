import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Building2,
  Smartphone,
  MessageCircle,
  Bike,
  BookText,
  ChefHat,
  ClipboardList,
  Images,
  LayoutDashboard,
  MapPin,
  Package,
  Palette,
  CakeSlice,
  ScrollText,
  ShieldCheck,
  Sliders,
  Store,
  Ticket,
  Users,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import { ROUTES } from './routes';
import { PERM } from './permissions';

/**
 * NAVEGACION DEL PANEL — FUENTE UNICA
 * ---------------------------------------------------------------------------
 * Antes habia TRES tablas con las mismas pantallas y distinto contenido: el menu
 * lateral (16 entradas), el recibidor PanelHome (13) y el resumen de accesos de
 * Usuarios (13). Reclamaciones y Medios faltaban en dos de ellas, de modo que un
 * rol con solo `complaint.manage` cruzaba la lista blanca de /admin y el
 * recibidor lo devolvia a la tienda dos archivos mas alla. La lista blanca, por
 * su parte, eran 17 permisos escritos a mano que omitian ocho reales.
 *
 * Aqui vive UNA tabla. El menu, el recibidor, el resumen de accesos y la lista
 * blanca son proyecciones suyas: anadir una pantalla es anadir una fila.
 *
 * `anyOf` es la lista COMPLETA de permisos que justifican la pantalla, lectura y
 * escritura. Se usa igual para pintar la entrada del menu y para guardar la ruta:
 * si divergieran volveria el rebote (ver la entrada del menu, entrar y salir
 * expulsado). Por eso incluye tambien los permisos de escritura, que son los que
 * antes se caian de la lista blanca (`inventory.manage`, `order.cancel`,
 * `catalog.availability.write`...).
 */
export interface AdminNavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Le basta con UNO de estos permisos. Vacio + superAdminOnly = solo superadmin. */
  anyOf: string[];
  /** Bloque del menu lateral. */
  group?: string;
  /** Pantalla heredada: sigue siendo accesible por URL/rol, pero no aparece en el menu. */
  hidden?: boolean;
  /** Identidad legal y ajustes del sistema: no se delega a un rol creado desde el panel. */
  superAdminOnly?: boolean;
}

/**
 * Ruta de la Bitacora. Alias de `ROUTES.adminAudit`: se mantiene el nombre porque
 * esta tabla lo usa en dos sitios, pero el literal vive en `constants/routes.ts`
 * como el de todas las demas pantallas. Si divergieran, `navAnyOf` no encontraria
 * la fila y la ruta reventaria al montarse.
 */
export const ADMIN_AUDIT_PATH = ROUTES.adminAudit;

/** Bloques del menu, en orden. */
export const ADMIN_NAV_GROUPS = [
  { id: 'GENERAL', label: 'Vista general' },
  { id: 'VENTAS', label: 'Ventas y caja' },
  { id: 'PRODUCCION', label: 'Producción y cocina' },
  { id: 'LOGISTICA', label: 'Reparto y entrega' },
  { id: 'ABASTECIMIENTO', label: 'Compras e inventario' },
  { id: 'CATALOGO', label: 'Diseño y catálogo' },
  { id: 'GOBIERNO', label: 'Administración' },
] as const;

/**
 * Las pantallas visibles del panel, en orden de menu. Incluye la Bitacora, que da
 * destino al permiso `audit.read`: el backend ya lo exige en un endpoint completo
 * y hasta hoy no tenia ni ruta, ni menu, ni aterrizaje.
 */
export const ADMIN_NAV: AdminNavEntry[] = [
  { to: ROUTES.adminHomeContent, label: 'Contenido del inicio', icon: BookText, anyOf: [], superAdminOnly: true, group: 'CATALOGO' },
  { to: '/admin/experiencias-qr', label: 'Experiencias QR', icon: Images, anyOf: [PERM.EXPERIENCE_READ, PERM.EXPERIENCE_WRITE, PERM.EXPERIENCE_PUBLISH], group: 'CATALOGO' },
  { to: ROUTES.adminDirectPayments, label: 'Yape y Plin', icon: Smartphone, anyOf: [PERM.PAYMENT_READ, PERM.PAYMENT_VERIFY, PERM.PAYMENT_REFUND], group: 'VENTAS' },
  { to: ROUTES.adminCommunications, label: 'Comunicaciones', icon: MessageCircle, anyOf: [PERM.COMMUNICATION_READ, PERM.COMMUNICATION_REPLY], group: 'VENTAS' },
  {
    to: ROUTES.adminDashboard,
    label: 'Resumen',
    icon: LayoutDashboard,
    anyOf: [PERM.REPORT_SALES_READ, PERM.REPORT_OPERATIONS_READ],
    group: 'GENERAL',
  },
  {
    // Los pagos y devoluciones viven en la ficha del pedido: por eso payment.* entra aqui.
    to: ROUTES.adminOrders,
    label: 'Pedidos',
    icon: ClipboardList,
    anyOf: [
      PERM.ORDER_READ,
      PERM.ORDER_UPDATE_STATUS,
      PERM.ORDER_CANCEL,
      PERM.PAYMENT_READ,
      PERM.PAYMENT_REFUND,
      PERM.INVOICE_MANAGE,
    ],
    group: 'VENTAS',
  },
  {
    to: ROUTES.adminCash,
    label: 'Caja y rendimiento',
    icon: Banknote,
    anyOf: [PERM.REPORT_SALES_READ],
    group: 'VENTAS',
  },
  {
    to: ROUTES.adminPos,
    label: 'Punto de venta',
    icon: ShoppingCart,
    anyOf: [PERM.POS_SELL],
    group: 'VENTAS',
  },
  {
    // Compatibilidad con el modulo anterior: se conserva para roles de salon,
    // pero no se ofrece en el menu de Misky Challay.
    to: ROUTES.adminDining,
    label: 'Salón y comandas',
    icon: Store,
    anyOf: [PERM.DINING_READ, PERM.DINING_OPERATE],
    group: 'VENTAS',
    hidden: true,
  },
  {
    to: ROUTES.adminKitchen,
    label: 'Cocina',
    icon: ChefHat,
    anyOf: [PERM.KITCHEN_READ, PERM.KITCHEN_OPERATE],
    group: 'PRODUCCION',
  },
  {
    to: ROUTES.adminCakes,
    label: 'Producción de pastelería',
    icon: ChefHat,
    anyOf: [PERM.KITCHEN_READ, PERM.KITCHEN_OPERATE, PERM.CATALOG_CUSTOMIZATION_WRITE, PERM.GEO_READ, PERM.GEO_WRITE, PERM.CAKE_FINANCE_READ, PERM.CAKE_FINANCE_MANAGE],
    group: 'PRODUCCION',
  },
  {
    to: ROUTES.adminDelivery,
    label: 'Reparto',
    icon: Bike,
    anyOf: [PERM.DELIVERY_READ, PERM.DELIVERY_ASSIGN, PERM.DELIVERY_OPERATE],
    group: 'LOGISTICA',
  },
  {
    to: ROUTES.adminInventory,
    label: 'Inventario',
    icon: Package,
    anyOf: [PERM.INVENTORY_READ, PERM.INVENTORY_MANAGE],
    group: 'ABASTECIMIENTO',
  },
  {
    to: ROUTES.adminProcurement,
    label: 'Compras y proveedores',
    icon: Truck,
    anyOf: [PERM.PROCUREMENT_READ, PERM.PROCUREMENT_MANAGE],
    group: 'ABASTECIMIENTO',
  },
  {
    to: ROUTES.adminCatalog,
    label: 'Catálogo',
    icon: CakeSlice,
    anyOf: [
      PERM.CATALOG_PRODUCT_READ,
      PERM.CATALOG_PRODUCT_WRITE,
      PERM.CATALOG_PRODUCT_PUBLISH,
      PERM.CATALOG_CATEGORY_WRITE,
      PERM.CATALOG_AVAILABILITY_WRITE,
      PERM.ALLERGEN_WRITE,
      PERM.DIETARY_TAG_WRITE,
    ],
    group: 'CATALOGO',
  },
  {
    to: ROUTES.adminCakeThemes,
    label: 'Para empresas',
    icon: Building2,
    anyOf: [PERM.CATALOG_PRODUCT_READ],
    group: 'CATALOGO',
  },
  {
    to: ROUTES.adminBuilder,
    label: 'Personalización',
    icon: Sliders,
    anyOf: [PERM.CATALOG_CUSTOMIZATION_WRITE, PERM.ALLERGEN_WRITE, PERM.DIETARY_TAG_WRITE],
    group: 'CATALOGO',
  },
  {
    to: ROUTES.adminMedia,
    label: 'Biblioteca multimedia',
    icon: Images,
    anyOf: [PERM.CATALOG_PRODUCT_WRITE, PERM.CATALOG_CUSTOMIZATION_WRITE],
    group: 'CATALOGO',
  },
  {
    to: ROUTES.adminCoupons,
    label: 'Cupones',
    icon: Ticket,
    anyOf: [PERM.PROMOTION_MANAGE],
    group: 'CATALOGO',
  },
  {
    to: ROUTES.adminPlans,
    label: 'Suscripciones',
    icon: Package,
    anyOf: [PERM.PLAN_READ, PERM.PLAN_MANAGE],
    group: 'CATALOGO',
  },
  {
    to: ROUTES.adminLegacyPlans,
    // Historial y configuración de recargas antiguas; no se muestran en el menú.
    label: 'Recargas anteriores',
    icon: Package,
    anyOf: [PERM.PLAN_READ, PERM.PLAN_MANAGE],
    group: 'CATALOGO',
    hidden: true,
  },
  {
    to: ROUTES.adminCoverage,
    label: 'Zonas y sucursales',
    icon: MapPin,
    anyOf: [PERM.GEO_READ, PERM.GEO_WRITE],
    group: 'GOBIERNO',
  },
  {
    to: ROUTES.adminUsers,
    label: 'Personal interno',
    icon: Users,
    anyOf: [PERM.CUSTOMER_READ, PERM.CUSTOMER_MANAGE],
    group: 'GOBIERNO',
  },
  {
    to: ROUTES.adminCustomers,
    label: 'Clientes',
    icon: Users,
    anyOf: [PERM.USER_READ, PERM.USER_MANAGE],
    group: 'GOBIERNO',
  },
  {
    to: ROUTES.adminTeams,
    label: 'Equipos y accesos',
    icon: Users,
    anyOf: [PERM.USER_READ, PERM.USER_MANAGE, PERM.ROLE_READ, PERM.ROLE_MANAGE],
    superAdminOnly: true,
    group: 'GOBIERNO',
  },
  {
    to: ROUTES.adminRoles,
    label: 'Roles y permisos',
    icon: ShieldCheck,
    anyOf: [PERM.ROLE_READ, PERM.ROLE_MANAGE],
    superAdminOnly: true,
    group: 'GOBIERNO',
  },
  {
    to: ROUTES.adminComplaints,
    label: 'Libro de reclamaciones',
    icon: BookText,
    anyOf: [PERM.COMPLAINT_READ, PERM.COMPLAINT_MANAGE, PERM.COMPLAINT_RESPOND, PERM.COMPLAINT_EXPORT, PERM.COMPLAINT_REOPEN],
    group: 'GOBIERNO',
  },
  {
    to: ADMIN_AUDIT_PATH,
    label: 'Bitácora',
    icon: ScrollText,
    anyOf: [PERM.AUDIT_READ, PERM.AUDIT_EXPORT, PERM.AUDIT_VERIFY, PERM.AUDIT_RETENTION],
    group: 'GOBIERNO',
  },
  {
    to: ROUTES.adminBusiness,
    label: 'Datos del negocio',
    icon: Store,
    anyOf: [],
    superAdminOnly: true,
    group: 'GOBIERNO',
  },
  {
    to: ROUTES.adminDesign,
    label: 'Sistema de diseño',
    icon: Palette,
    anyOf: [PERM.SETTINGS_MANAGE, PERM.SETTINGS_DESIGN_READ, PERM.SETTINGS_DESIGN_MANAGE, PERM.SETTINGS_DESIGN_PUBLISH],
    group: 'GOBIERNO',
  },
];

/**
 * Orden de aterrizaje del recibidor: la primera pantalla cuyo permiso tenga el
 * usuario. Los que ven reportes van al Resumen; los operativos, a SU estacion
 * (reparto antes que cocina, para que el despachador —que ve ambas— caiga en
 * reparto y el cocinero en cocina).
 *
 * Se deriva de ADMIN_NAV reordenando por ruta: cualquier pantalla nueva sigue
 * siendo un aterrizaje valido aunque nadie la anada aqui (cae al final, en orden
 * de menu). Las de superadmin se excluyen: el superadmin ya aterriza en Resumen.
 */
const LANDING_PRIORITY: string[] = [
  ROUTES.adminDashboard,
  ROUTES.adminDirectPayments,
  ROUTES.adminCash,
  ROUTES.adminPos,
  ROUTES.adminDelivery,
  ROUTES.adminKitchen,
  ROUTES.adminOrders,
  ROUTES.adminInventory,
  ROUTES.adminCatalog,
  ROUTES.adminBuilder,
  ROUTES.adminMedia,
  ROUTES.adminCoupons,
  ROUTES.adminCoverage,
  ROUTES.adminComplaints,
  ADMIN_AUDIT_PATH,
  ROUTES.adminUsers,
  ROUTES.adminRoles,
];

const landingRank = (entry: AdminNavEntry): number => {
  const index = LANDING_PRIORITY.indexOf(entry.to);
  return index === -1 ? LANDING_PRIORITY.length : index;
};

export const ADMIN_LANDING_ORDER: AdminNavEntry[] = ADMIN_NAV.filter(
  (entry) => !entry.superAdminOnly,
).sort((a, b) => landingRank(a) - landingRank(b));

/**
 * Lista blanca de la raiz /admin: DERIVADA, nunca escrita a mano.
 *
 * La version manual omitia ocho permisos reales (audit.read,
 * catalog.product.write, catalog.availability.write, inventory.manage,
 * order.update_status, order.cancel, user.manage y role.manage) ademas de los
 * tres que ni siquiera existian en el espejo. Con roles que se crean desde el
 * propio panel, cualquier omision es un usuario que no puede entrar a trabajar.
 */
export const ADMIN_ROOT_PERMISSIONS: string[] = [
  ...new Set(ADMIN_NAV.flatMap((entry) => entry.anyOf)),
];
