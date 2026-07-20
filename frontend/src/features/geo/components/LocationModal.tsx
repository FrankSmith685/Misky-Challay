import { lazy, Suspense } from 'react';
import { Modal } from '@components/ui/Modal';
import { PageLoader } from '@components/common/PageLoader';
import { useAppState } from '@context/AppStateContext';
import { MapPinned } from 'lucide-react';

const CoverageChecker = lazy(() => import('./CoverageChecker').then((module) => ({ default: module.CoverageChecker })));

/**
 * Modal global de direccion. Se abre desde el header (useAppState.openLocationModal)
 * y al confirmar deja guardados ciudad, direccion y sucursal en el contexto de compra.
 */
export const LocationModal = () => {
  const { isLocationModalOpen, closeLocationModal } = useAppState();

  return (
    <Modal
      isOpen={isLocationModalOpen}
      onClose={closeLocationModal}
      title="Donde entregamos tu pedido?"
      description="Necesitamos tu zona para mostrarte solo lo que podemos prepararte."
      eyebrow="Cobertura de delivery"
      icon={MapPinned}
      maxWidth="lg"
    >
      <Suspense fallback={<div className="min-h-[360px] place-content-center"><PageLoader /></div>}>
        <CoverageChecker onConfirmed={closeLocationModal} />
      </Suspense>
    </Modal>
  );
};
