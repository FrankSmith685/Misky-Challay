import { lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { PageLoader } from '@components/common/PageLoader';
import { useAppState } from '@context/AppStateContext';
import { useAppSelector } from '@app/hooks';
import { ROUTES } from '@constants/routes';
import { LockKeyhole, LogIn, MapPin, MapPinned, Store, UserPlus } from 'lucide-react';

const CoverageChecker = lazy(() => import('./CoverageChecker').then((module) => ({ default: module.CoverageChecker })));

/**
 * Modal global de direccion. Se abre desde el header (useAppState.openLocationModal)
 * y al confirmar deja guardados ciudad, direccion y sucursal en el contexto de compra.
 */
export const LocationModal = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const {
    deliveryType,
    pickupBranch,
    isLocationModalOpen,
    closeLocationModal,
    setDeliveryType,
  } = useAppState();
  const hasPickup = isAuthenticated && deliveryType === 'PICKUP' && pickupBranch !== null;
  const requiresAuth = !isAuthenticated;

  const goToAuth = (route: string) => {
    const from = `${location.pathname}${location.search}`;
    closeLocationModal();
    navigate(route, { state: { from } });
  };

  return (
    <Modal
      isOpen={isLocationModalOpen}
      onClose={closeLocationModal}
      title={requiresAuth ? 'Ingresa para elegir cómo recibirás tu pedido' : hasPickup ? 'Tu local de recojo' : '¿Dónde entregamos tu pedido?'}
      description={
        requiresAuth
          ? 'Las direcciones y locales elegidos pertenecen a una cuenta y no se guardan para visitantes.'
          : hasPickup
          ? 'Tu pedido se preparará en este local. Para recojo no necesitas ingresar una dirección de entrega.'
          : 'Busca la dirección, confirma la entrada en el mapa y comprobaremos si llegamos hasta allí.'
      }
      eyebrow={requiresAuth ? 'Acceso necesario' : hasPickup ? 'Recojo seleccionado' : 'Zona de entrega'}
      icon={requiresAuth ? LockKeyhole : hasPickup ? Store : MapPinned}
      maxWidth="xl"
    >
      {requiresAuth ? (
        <section className="grid gap-5 rounded-card border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 text-center shadow-e2 sm:p-7">
          <span className="mx-auto grid size-14 place-items-center rounded-card bg-brand-700 text-white shadow-e2">
            <LockKeyhole className="size-6" />
          </span>
          <div>
            <h3 className="text-lg font-black text-ink">Protegemos tus datos de entrega</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-ink-muted">
              Inicia sesión para guardar una dirección, elegir un local de recojo y asociarlos únicamente a tus pedidos.
            </p>
          </div>
          <div className="mx-auto grid w-full max-w-md gap-2.5 sm:grid-cols-2">
            <Button leftIcon={<LogIn className="size-4" />} onClick={() => goToAuth(ROUTES.login)}>
              Ingresar
            </Button>
            <Button variant="outline" leftIcon={<UserPlus className="size-4" />} onClick={() => goToAuth(ROUTES.register)}>
              Crear cuenta
            </Button>
          </div>
        </section>
      ) : hasPickup ? (
        <section role="status" className="rounded-card border border-brand-200 bg-brand-50/60 p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-700 text-white">
              <Store className="size-5" />
            </span>
            <div>
              <p className="font-black text-ink">{pickupBranch.name}</p>
              <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-muted">
                <MapPin className="mt-0.5 size-4 shrink-0" />
                {pickupBranch.addressLine}
              </p>
              {pickupBranch.distanceKm != null && (
                <p className="mt-1 text-xs font-semibold text-brand-800">
                  A {pickupBranch.distanceKm} km del punto consultado
                </p>
              )}
            </div>
          </div>
          <p className="mt-4 rounded-card bg-white px-3 py-2.5 text-sm font-semibold text-brand-900 ring-1 ring-brand-100">
            Recojo confirmado. No necesitas completar una dirección de entrega.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={closeLocationModal}>Mantener este local</Button>
            <Button variant="outline" onClick={() => setDeliveryType('DELIVERY')}>
              Cambiar a delivery
            </Button>
          </div>
        </section>
      ) : (
        <Suspense fallback={<div className="min-h-[360px] place-content-center"><PageLoader /></div>}>
          <CoverageChecker onConfirmed={closeLocationModal} />
        </Suspense>
      )}
    </Modal>
  );
};
