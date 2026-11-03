import { ROUTES } from '@constants/routes';

/** Pantallas que solo existen para quien NO tiene sesion. */
export const GUEST_ROUTES: string[] = [
  ROUTES.login,
  ROUTES.register,
  ROUTES.forgotPassword,
];

/** Lo minimo que necesitamos de un `Location` de react-router. */
interface RouteLocation {
  state: unknown;
  search: string;
}

/**
 * Solo rutas internas. Un "//evil.com" o un "https://..." sacarian al usuario del
 * sitio despues de identificarse, y un destino que sea a su vez pantalla de acceso
 * dejaria al guard rebotando contra si mismo.
 */
const sanitize = (value?: string | null): string | undefined => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return undefined;
  const path = value.split('?')[0].split('#')[0];
  return GUEST_ROUTES.includes(path) ? undefined : value;
};

/**
 * De donde venia el usuario antes de que le pidieramos identificarse.
 *
 * Viaja de dos maneras y hay que aceptar las dos: por `state` (lo que pone
 * ProtectedRoute y los enlaces internos) y por `?returnTo=` (sobrevive a recargar
 * la pagina o a abrir el enlace en otra pestana, donde el state se pierde).
 */
export const readReturnTo = (location: RouteLocation): string | undefined => {
  const fromState = (location.state as { from?: string } | null)?.from;
  const fromQuery = new URLSearchParams(location.search).get('returnTo');
  return sanitize(fromState) ?? sanitize(fromQuery);
};

/**
 * Donde aterriza alguien con sesion abierta.
 *
 * Vive aqui, y no dentro de cada pagina, porque lo usan tres sitios (acceso,
 * registro y GuestRoute): si divergen, el usuario acaba en un destino distinto
 * segun quien de los tres gane la carrera del render.
 */
export const resolveAfterAuthPath = (
  returnTo: string | undefined,
  isStaff: boolean,
  staffPath: string = ROUTES.admin,
  hasCartItems = false,
): string => {
  const path = returnTo?.split(/[?#]/)[0].replace(/\/+$/, '');
  // Un retorno guardado al checkout solo tiene sentido si queda una compra.
  // La confirmación y los enlaces de un pago creado conservan su propio destino.
  const validReturn = path === ROUTES.checkout && !hasCartItems ? undefined : returnTo;
  return validReturn ?? (isStaff ? staffPath : ROUTES.home);
};
