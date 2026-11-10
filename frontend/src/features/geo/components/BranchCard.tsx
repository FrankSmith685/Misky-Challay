import { Bike, Clock3, MapPin, Phone, ShoppingBag, Store } from 'lucide-react';
import { Card } from '@components/ui/Card';
import type { Branch } from '../types';

interface BranchCardProps {
  branch: Branch;
}

/** Tarjeta pública de local con servicios y tiempo de preparación. */
export const BranchCard = ({ branch }: BranchCardProps) => (
  <Card className="group h-full overflow-hidden rounded-card p-0 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-e3">
    <div className="h-1 bg-gradient-to-r from-brand-500 via-brand-300 to-accent-400" />
    <div className="p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700 ring-1 ring-brand-100 transition-colors group-hover:bg-brand-700 group-hover:text-white">
          <Store className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-black text-ink">{branch.name}</h3>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-ink-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
            {branch.addressLine}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-card bg-surface-muted p-3">
          <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
            <Clock3 className="size-3.5 text-brand-700" />
            Preparación
          </p>
          <p className="mt-1 text-sm font-black text-ink">~{branch.prepMinutes} min</p>
        </div>
        <div className="rounded-card bg-surface-muted p-3">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
            Modalidades
          </p>
          <div className="mt-1 flex items-center gap-2 text-ink">
            {branch.acceptsDelivery && <Bike className="size-4" aria-label="Delivery" />}
            {branch.acceptsPickup && <ShoppingBag className="size-4" aria-label="Recojo" />}
            <span className="text-xs font-bold">
              {branch.acceptsDelivery && branch.acceptsPickup
                ? 'Delivery y recojo'
                : branch.acceptsPickup
                  ? 'Recojo'
                  : 'Delivery'}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs">
        <span className="text-ink-muted">Horario disponible al programar tu pedido</span>
        {branch.phone && (
          <a
            href={`tel:${branch.phone.replace(/[^\d+]/g, '')}`}
            className="inline-flex items-center gap-1.5 font-bold text-brand-700 hover:text-brand-900"
          >
            <Phone className="size-3.5" aria-hidden="true" />
            Llamar al local
          </a>
        )}
      </div>
    </div>
  </Card>
);
