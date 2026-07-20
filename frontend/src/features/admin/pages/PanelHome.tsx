import { Navigate } from 'react-router-dom';
import { ROUTES } from '@constants/routes';
import { PERM } from '@constants/permissions';
import { usePermissions } from '@hooks/usePermissions';

/**
 * RECIBIDOR DEL PANEL
 * ---------------------------------------------------------------------------
 * El panel es UNO SOLO, pero cada rol debe aterrizar donde SI puede trabajar.
 *
 * Sin esto, un cocinero entra a /admin, el sistema intenta mostrarle el Resumen
 * (que exige permiso de reportes), no puede, y lo rebota a la tienda. Aqui lo
 * mandamos directo a Cocina; al nutricionista a Catalogo; al admin al Resumen.
 *
 * Es lo que hace que el mismo panel se SIENTA propio de cada rol.
 */

/**
 * Orden de preferencia: la primera pantalla cuyo permiso tenga el usuario.
 *
 * Los que pueden ver reportes (admin, admin de sucursal) van primero al Resumen.
 * Luego los roles operativos caen en SU estacion: reparto antes que cocina, para
 * que el despachador (que ve ambas) aterrice en reparto y el cocinero en cocina.
 */
const LANDINGS: Array<{ to: string; anyOf: string[] }> = [
  { to: ROUTES.adminDashboard, anyOf: [PERM.REPORT_SALES_READ, PERM.REPORT_OPERATIONS_READ] },
  { to: ROUTES.adminDelivery, anyOf: [PERM.DELIVERY_READ] },
  { to: ROUTES.adminKitchen, anyOf: [PERM.KITCHEN_READ] },
  { to: ROUTES.adminOrders, anyOf: [PERM.ORDER_READ] },
  { to: ROUTES.adminInventory, anyOf: [PERM.INVENTORY_READ] },
  { to: ROUTES.adminCatalog, anyOf: [PERM.CATALOG_PRODUCT_READ, PERM.NUTRITION_READ] },
  { to: ROUTES.adminBuilder, anyOf: [PERM.CATALOG_CUSTOMIZATION_WRITE] },
  { to: ROUTES.adminCoupons, anyOf: [PERM.PROMOTION_MANAGE] },
  { to: ROUTES.adminPlans, anyOf: [PERM.PLAN_MANAGE] },
  { to: ROUTES.adminCoverage, anyOf: [PERM.GEO_READ, PERM.GEO_WRITE] },
  { to: ROUTES.adminUsers, anyOf: [PERM.USER_READ] },
  { to: ROUTES.adminRoles, anyOf: [PERM.ROLE_READ] },
  { to: ROUTES.adminDesign, anyOf: [PERM.SETTINGS_MANAGE] },
];

const PanelHome = () => {
  const { canAny } = usePermissions();

  const landing = LANDINGS.find((entry) => canAny(...entry.anyOf));

  // Si no puede ver ninguna seccion, no es personal: de vuelta a la tienda.
  return <Navigate to={landing?.to ?? ROUTES.home} replace />;
};

export default PanelHome;
