import { lazy, Suspense } from 'react';
import { Modal } from '@components/ui/Modal';
import { Button } from '@components/ui/Button';
import { PageLoader } from '@components/common/PageLoader';
import { useAppState } from '@context/AppStateContext';
import { MapPin, MapPinned, Store } from 'lucide-react';

const CoverageChecker = lazy(() => import('./CoverageChecker').then((module) => ({ default: module.CoverageChecker })));

/**
 * Modal global de dirección. Se abre desde el header (useAppState.openLocationModal)
 * y al confirmar deja guardados ciudad, dirección y sucursal en el contexto de compra.
 * El visitante puede consultar y confirmar una dirección temporal; la cuenta solo se
 * solicita al intentar pagar el pedido.
 */
export const LocationModal = () => {
  const {
    deliveryType,
    pickupBranch,
    isLocationModalOpen,
    closeLocationModal,
    setDeliveryType,
  } = useAppState();
  const hasPickup = deliveryType === 'PICKUP' && pickupBranch !== null;

  return (
    <Modal
      isOpen={isLocationModalOpen}
      onClose={closeLocationModal}
      title={hasPickup ? 'Tu local de recojo' : '¿Dónde entregamos tu pedido?'}
      description={hasPickup
        ? 'Tu pedido se preparará en este local. Para recojo no necesitas ingresar una dirección de entrega.'
        : 'Busca la dirección, confirma la entrada en el mapa y comprobaremos si llegamos hasta allí. Puedes continuar como invitado; solo pediremos iniciar sesión al pagar.'}
      eyebrow={hasPickup ? 'Recojo seleccionado' : 'Zona de entrega'}
      icon={hasPickup ? Store : MapPinned}
      maxWidth="xl"
    >
      {hasPickup ? (
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
