import {
  Bike,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MapPin,
  Navigation,
  PackageCheck,
  RotateCcw,
  Store,
  XCircle,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import { formatCurrency } from '@lib/format';
import type { CoverageResult } from '../types';

interface CoverageResultCardProps {
  result: CoverageResult | null;
  addressLabel?: string;
  /** Se esta guardando la direccion en la libreta del cliente. */
  isConfirming?: boolean;
  /** Usar/guardar una dirección requiere una cuenta identificada. */
  isAuthenticated?: boolean;
  onConfirm: () => void;
  onPickup: () => void;
  onEdit: () => void;
}

const Metric = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) => (
  <div className="rounded-card border border-brand-100 bg-white/80 p-3">
    <span className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">
      <Icon className="size-3.5 text-brand-700" />
      {label}
    </span>
    <strong className="mt-1 block text-sm text-ink">{value}</strong>
  </div>
);

/** Estado vacío, éxito o alternativa de recojo del verificador. */
export const CoverageResultCard = ({
  result,
  addressLabel,
  isConfirming = false,
  isAuthenticated = false,
  onConfirm,
  onPickup,
  onEdit,
}: CoverageResultCardProps) => {
  if (!result) {
    return (
      <div className="rounded-card border border-dashed border-line bg-white/65 p-5 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-card bg-brand-50 text-brand-700">
          <Navigation className="size-5" />
        </span>
        <p className="mt-3 text-sm font-extrabold text-ink">Tu resultado aparecerá aquí</p>
        <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-ink-muted">
          Completa la zona, dirección y punto exacto para calcular delivery y tiempo estimado.
        </p>
      </div>
    );
  }

  if (result.covered && result.branch && result.zone) {
    return (
      <section
        role="status"
        aria-live="polite"
        className="overflow-hidden rounded-card border border-brand-200 bg-gradient-to-br from-brand-50 to-white shadow-e2"
      >
        <div className="border-b border-brand-100 bg-brand-700 px-4 py-4 text-white sm:px-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-card bg-white/15">
              <CheckCircle2 className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-brand-100">
                Dirección confirmada
              </p>
              <h3 className="mt-0.5 text-lg font-black">Te atenderá {result.branch.name}</h3>
              {addressLabel && <p className="mt-1 truncate text-xs text-white/75">{addressLabel}</p>}
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-2.5">
            <Metric icon={Clock3} label="Tiempo estimado" value={`~${result.etaMinutes} min`} />
            <Metric icon={Bike} label="Delivery" value={formatCurrency(result.zone.deliveryFee)} />
            <Metric
              icon={PackageCheck}
              label="Pedido mínimo"
              value={formatCurrency(result.zone.minimumOrder)}
            />
            <Metric icon={Store} label="Local asignado" value={result.branch.name} />
          </div>

          <div className="flex items-start gap-2 rounded-card bg-white px-3 py-2.5 text-xs text-ink-muted ring-1 ring-brand-100">
            <span
              className={`mt-1 size-2 shrink-0 rounded-full ${
                result.branch.isOpenNow ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span>
              <strong className="text-ink">
                {result.branch.isOpenNow ? 'Abierto ahora' : 'Cerrado en este momento'}
              </strong>
              {' · '}
              Zona {result.zone.name}
              {result.routeDistanceKm != null ? ` · ${result.routeDistanceKm.toFixed(1)} km` : ''}
            </span>
          </div>

          {!isAuthenticated && (
            <div className="flex items-start gap-2.5 rounded-card border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
              <LockKeyhole className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="block">Tu cobertura ya está confirmada</strong>
                Inicia sesión para guardar esta dirección y asociarla a tus pedidos.
              </span>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            isLoading={isConfirming}
            leftIcon={!isAuthenticated ? <LockKeyhole className="size-4" /> : undefined}
            onClick={onConfirm}
          >
            {isAuthenticated ? 'Guardar y usar esta dirección' : 'Ingresar para usar esta dirección'}
          </Button>
          <button
            type="button"
            onClick={onEdit}
            className="mx-auto flex min-h-9 items-center gap-1.5 px-3 text-xs font-bold text-ink-muted transition-colors hover:text-brand-700"
          >
            <RotateCcw className="size-3.5" />
            Ajustar dirección
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      role="status"
      aria-live="polite"
      className="grid gap-4 rounded-card border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-card bg-amber-100 text-amber-800">
          <XCircle className="size-5" />
        </span>
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-amber-800">
            Fuera de la zona de delivery
          </p>
          <h3 className="mt-1 text-base font-black text-ink">
            {result.reason ?? 'Todavía no llegamos a esta dirección'}
          </h3>
        </div>
      </div>

      {result.nearestPickup ? (
        <div className="grid gap-2 rounded-card border border-amber-100 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
            <Store className="size-4 text-brand-700" />
            Tienes una alternativa cercana
          </p>
          <p className="text-sm font-bold text-ink">{result.nearestPickup.name}</p>
          <p className="flex items-start gap-1.5 text-xs leading-5 text-ink-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            {result.nearestPickup.addressLine}
          </p>
          <p className="text-xs text-ink-muted">
            A {result.nearestPickup.distanceKm} km ·{' '}
            {result.nearestPickup.isOpenNow ? 'abierto ahora' : 'cerrado ahora'}
          </p>
          <div className="pt-2">
            <Button
              className="w-full"
              variant="outline"
              leftIcon={!isAuthenticated ? <LockKeyhole className="size-4" /> : undefined}
              onClick={onPickup}
            >
              {isAuthenticated ? 'Elegir recojo en este local' : 'Ingresar para elegir este local'}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs leading-5 text-ink-muted">
          Prueba con otra dirección o vuelve a revisar el punto marcado en el mapa.
        </p>
      )}

      <Button className="w-full" variant="ghost" onClick={onEdit}>
        Revisar otra ubicación
      </Button>
    </section>
  );
};
