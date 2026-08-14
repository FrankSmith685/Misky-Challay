import { AlertTriangle } from 'lucide-react';
import { Badge } from '@components/ui/Badge';
import { StatusBadge, type StatusMap } from '@components/ui/StatusBadge';

/** Un color por estado del reclamo (Libro de Reclamaciones). */
export const COMPLAINT_STATUS: StatusMap = {
  RECEIVED: { label: 'Recibido', variant: 'neutral' },
  IN_PROGRESS: { label: 'En proceso', variant: 'warning' },
  RESOLVED: { label: 'Atendido', variant: 'solid' },
};

export const ComplaintStatusBadge = ({ status }: { status: string }) => (
  <StatusBadge status={status} map={COMPLAINT_STATUS} />
);

/**
 * Un reclamo esta vencido si paso su plazo legal y aun no se responde.
 *
 * Vive aqui, junto a la insignia, porque la misma condicion la evalua el servidor
 * para el contador global y para el filtro "Vencidos": si la tabla, las tarjetas
 * de movil y el banner la reimplementaran cada una por su cuenta, el numero del
 * banner y las filas en rojo acabarian discrepando.
 */
export const isComplaintOverdue = (row: { status: string; dueAt: string }): boolean =>
  row.status !== 'RESOLVED' && new Date(row.dueAt).getTime() < Date.now();

/** Marca de plazo vencido. Lleva icono: el rojo solo no basta para quien no lo distingue. */
export const ComplaintOverdueBadge = ({ className }: { className?: string }) => (
  <Badge variant="danger" className={className}>
    <AlertTriangle className="size-3" /> Vencido
  </Badge>
);
