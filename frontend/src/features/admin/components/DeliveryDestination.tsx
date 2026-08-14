import { MapPin, Navigation } from 'lucide-react';
import { Button } from '@components/ui/Button';
import type { OrderAddressSnapshot } from '../types';

interface DeliveryDestinationProps {
  address: OrderAddressSnapshot | null;
  notes?: string | null;
  showRoute?: boolean;
  className?: string;
}

const buildMapsUrl = (address: OrderAddressSnapshot | null): string | null => {
  if (!address) return null;

  if (address.latitude != null && address.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${address.latitude},${address.longitude}`;
  }

  const query = [address.line1, address.districtName].filter(Boolean).join(', ');
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
};

/** Direccion congelada del pedido, con la referencia peruana y acceso a navegacion. */
export const DeliveryDestination = ({
  address,
  notes,
  showRoute = true,
  className,
}: DeliveryDestinationProps) => {
  const mapsUrl = buildMapsUrl(address);

  return (
    <div className={className}>
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" />
        <div className="min-w-0 text-sm">
          <p className="font-medium text-ink">
            {address?.line1 ?? 'Direccion no registrada'}
            {address?.districtName ? `, ${address.districtName}` : ''}
          </p>
          {address?.reference && (
            <p className="mt-1 rounded-field bg-accent-50 px-2 py-1 text-xs font-semibold text-accent-800">
              Referencia: {address.reference}
            </p>
          )}
          {notes && <p className="mt-1 text-xs text-ink-muted">Indicacion: {notes}</p>}
        </div>
      </div>

      {showRoute && mapsUrl && (
        <Button
          component="a"
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="outline"
          size="sm"
          className="mt-3"
          leftIcon={<Navigation className="size-4" />}
        >
          Abrir ruta
        </Button>
      )}
    </div>
  );
};
