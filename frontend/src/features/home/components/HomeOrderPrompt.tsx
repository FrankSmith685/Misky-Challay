import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, MapPin } from 'lucide-react';
import { MarketingSection } from '@components/marketing';
import { Button } from '@components/ui/Button';
import { useAppState } from '@context/AppStateContext';
import { ROUTES } from '@constants/routes';

export const HomeOrderPrompt = () => {
  const { address, deliveryType, pickupBranch, openLocationModal } = useAppState();
  const selectedPlace = deliveryType === 'PICKUP'
    ? pickupBranch?.name
    : address?.label;
  const hasPlace = Boolean(selectedPlace);

  return (
    <MarketingSection tone="brand" contentClassName="py-7 sm:py-9">
      <div className="grid gap-5 rounded-card border border-brand-200 bg-white p-5 shadow-e2 sm:grid-cols-[1fr_auto] sm:items-center sm:p-7">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
            <MapPin className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[.16em] text-brand-700">Comienza tu pedido</p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-ink sm:text-2xl">
              {hasPlace ? 'Tu pedido está listo para esa zona' : 'Elige dónde recibirlo'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              {hasPlace
                ? `${deliveryType === 'PICKUP' ? 'Recojo en' : 'Entrega en'} ${selectedPlace}. Puedes cambiarlo cuando quieras.`
                : 'Confirma tu dirección o elige un local de recojo para mostrarte disponibilidad real.'}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="lg"
          variant={hasPlace ? 'outline' : 'primary'}
          onClick={openLocationModal}
          leftIcon={hasPlace ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <MapPin className="size-4" aria-hidden="true" />}
          className="w-full sm:w-auto"
        >
          {hasPlace ? 'Cambiar ubicación' : 'Elegir mi ubicación'}
          <ArrowRight className="ml-2 size-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-ink-muted">
        <span>Entrega programada</span>
        <span>Recojo en taller</span>
        <Link to={ROUTES.coverage} className="text-brand-700 hover:text-brand-600">Consulta las zonas de entrega</Link>
      </div>
    </MarketingSection>
  );
};
