import { Navigate } from 'react-router-dom';
import { ROUTES } from '@constants/routes';
import { ADMIN_LANDING_ORDER } from '@constants/adminNav';
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
 *
 * El orden y los permisos salen de `constants/adminNav.ts`, la misma tabla que
 * arma el menu y guarda las rutas. Cuando esta lista se mantenia aparte se quedo
 * en 13 de 17 pantallas: un usuario cuyo unico permiso fuese `complaint.manage`
 * o `audit.read` cruzaba la lista blanca de /admin y aqui mismo lo devolviamos a
 * la tienda, sin explicacion y sin poder trabajar.
 */
const PanelHome = () => {
  const { canAny } = usePermissions();

  const landing = ADMIN_LANDING_ORDER.find((entry) => canAny(...entry.anyOf));

  // Si no puede ver ninguna seccion, no es personal: de vuelta a la tienda.
  return <Navigate to={landing?.to ?? ROUTES.home} replace />;
};

export default PanelHome;
