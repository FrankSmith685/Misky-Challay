import { AlertTriangle, Store, Truck } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import type { CoverageResult } from '@features/geo/types';

interface AddressCoveragePreviewProps {
  result: CoverageResult;
  onSelectPickup: (pickup: NonNullable<CoverageResult['nearestPickup']>) => void;
}

const CoverageMetric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-card border border-brand-100 bg-white p-3">
    <dt className="text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">{label}</dt>
    <dd className="mt-1 text-sm font-black text-ink">{value}</dd>
  </div>
);

export const AddressCoveragePreview = ({
  result,
  onSelectPickup,
}: AddressCoveragePreviewProps) => {
  const delivery = result.covered && result.branch && result.zone
    ? { branch: result.branch, zone: result.zone }
    : null;
  const pickup = result.nearestPickup;

  return (
    <section
      role="status"
      aria-live="polite"
      className={cn(
        'mt-5 rounded-card border p-4 sm:p-5',
        delivery ? 'border-brand-200 bg-brand-50/70' : 'border-amber-200 bg-amber-50',
      )}
    >
      {delivery ? (
        <>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-card bg-brand-700 text-white">
              <Truck className="size-5" />
            </span>
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[.12em] text-brand-700">
                Cobertura confirmada
              </p>
              <h3 className="mt-0.5 text-base font-black text-ink">
                Te atenderá {delivery.branch.name}
              </h3>
              <p className="mt-1 text-xs text-ink-muted">
                {delivery.branch.isOpenNow ? 'Abierto ahora' : 'Cerrado ahora'} · zona{' '}
                {delivery.zone.name}
              </p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <CoverageMetric label="Tarifa" value={formatCurrency(delivery.zone.deliveryFee)} />
            <CoverageMetric
              label="Pedido mínimo"
              value={formatCurrency(delivery.zone.minimumOrder)}
            />
            <CoverageMetric
              label="Tiempo estimado"
              value={`~${result.etaMinutes ?? delivery.zone.estimatedMinutes} min`}
            />
          </dl>
        </>
      ) : (
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <div>
            <h3 className="font-black text-ink">Sin delivery para este punto</h3>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              {result.reason ?? 'Todavía no llegamos a esta dirección.'}
            </p>
            <p className="mt-2 text-xs leading-5 text-ink-muted">
              Puedes guardar la dirección de todas formas.
            </p>
            {pickup && (
              <div className="mt-3 flex items-start gap-2 rounded-card border border-amber-200 bg-white p-3">
                <Store className="mt-0.5 size-4 shrink-0 text-brand-700" />
                <div>
                  <p className="text-xs leading-5 text-ink-muted">
                    Recojo disponible en{' '}
                    <strong className="text-ink">{pickup.name}</strong> · {pickup.distanceKm} km ·{' '}
                    {pickup.isOpenNow ? 'abierto ahora' : 'cerrado ahora'}
                  </p>
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="outline"
                    onClick={() => onSelectPickup(pickup)}
                  >
                    Elegir recojo aquí
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
