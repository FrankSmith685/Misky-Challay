import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { AlertCircle, Compass, RefreshCw, ShoppingBag } from 'lucide-react';
import { AppLogo } from '@components/common/AppLogo';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';

/** Texto tecnico solo para desarrollo: al cliente no le sirve y en produccion asusta. */
const describe = (error: unknown): string | null => {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return null;
};

/**
 * Ultima red del router: se monta como `errorElement` de los nodos raiz.
 *
 * Sin el, cualquier excepcion de render (un campo nulo inesperado del API, un
 * `crypto.randomUUID` no disponible) dejaba al cliente en la pantalla cruda de
 * react-router, sin marca y sin salida. Distingue las dos causas porque la
 * respuesta util es distinta: una ruta que no existe se resuelve navegando; un
 * fallo de render, recargando.
 */
export const RouteErrorBoundary = () => {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const detail = describe(error);

  return (
    <section className="grid min-h-screen place-items-center bg-surface-muted px-4 py-12">
      <div className="grid w-full max-w-xl justify-items-center gap-4 rounded-card border border-line bg-white p-8 text-center shadow-e2 sm:p-10">
        <AppLogo />

        <span
          className={
            notFound
              ? 'mt-2 grid size-14 place-items-center rounded-card bg-brand-50 text-brand-700'
              : 'mt-2 grid size-14 place-items-center rounded-card bg-red-50 text-red-600'
          }
        >
          {notFound ? <Compass className="size-7" /> : <AlertCircle className="size-7" />}
        </span>

        <h1 className="text-2xl font-black text-ink">
          {notFound ? 'No encontramos esta página' : 'Algo se rompió de nuestro lado'}
        </h1>
        <p className="max-w-lg leading-7 text-ink-muted">
          {notFound
            ? 'Puede que el enlace haya cambiado o que el producto ya no esté en el catálogo.'
            : 'No es culpa tuya y no perdiste nada: tu carrito sigue guardado. Si estabas pagando, revisa Mis pedidos antes de repetir la compra, porque puede que ya esté registrada.'}
        </p>

        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          {notFound ? (
            <>
              <Button component={Link} to={ROUTES.menu} leftIcon={<Compass className="size-4" />}>
                Ver el menú
              </Button>
              <Button component={Link} to={ROUTES.home} variant="outline">
                Volver al inicio
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={() => window.location.reload()}
                leftIcon={<RefreshCw className="size-4" />}
              >
                Recargar la página
              </Button>
              <Button component={Link} to={ROUTES.menu} variant="outline">
                Ir al menú
              </Button>
              <Button
                component={Link}
                to={ROUTES.cart}
                variant="outline"
                leftIcon={<ShoppingBag className="size-4" />}
              >
                Ver mi carrito
              </Button>
            </>
          )}
        </div>

        {import.meta.env.DEV && detail && (
          <p className="mt-2 w-full break-words rounded-card bg-surface-muted p-3 text-left text-xs text-ink-muted">
            {detail}
          </p>
        )}
      </div>
    </section>
  );
};
