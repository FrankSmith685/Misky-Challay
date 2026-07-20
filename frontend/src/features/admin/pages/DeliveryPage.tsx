import { useCallback, useEffect, useState } from 'react';
import { Bike, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Select, SelectOption } from '@components/ui/Select';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import type { DeliveryRow, DeliveryStatus, Driver } from '../types';

const NEXT_STEP: Partial<Record<DeliveryStatus, { status: DeliveryStatus; label: string }>> = {
  ASSIGNED: { status: 'PICKED_UP', label: 'Recogio el pedido' },
  PICKED_UP: { status: 'ON_ROUTE', label: 'En ruta' },
  ON_ROUTE: { status: 'DELIVERED', label: 'Entregado' },
};

/** Vista del despachador: asignar repartidor y seguir el reparto (M11). */
const DeliveryPage = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const { branchId, branches, setBranchId, isLoadingBranches } = useActiveBranch();

  const fetcher = useCallback(
    () => (branchId ? adminApi.deliveryBoard(branchId) : Promise.resolve([])),
    [branchId],
  );
  const { data, isLoading, refresh } = usePolling<DeliveryRow[]>(fetcher, 6000);

  useEffect(() => {
    if (!branchId) {
      setDrivers([]);
      return;
    }
    adminApi
      .drivers(branchId)
      .then(setDrivers)
      .catch(() => setDrivers([]));
  }, [branchId]);

  const run = async (deliveryId: number, action: () => Promise<void>) => {
    setBusyId(deliveryId);
    try {
      await action();
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;

  const deliveries = data ?? [];

  return (
    <div>
      <PageHeader
        eyebrow="Última milla"
        title="Reparto"
        description="Asigna repartidores y sigue cada entrega desde que el pedido se confirma."
        icon={Bike}
        action={<BranchSelector value={branchId} branches={branches} onChange={setBranchId} />}
      />

      {deliveries.length === 0 ? (
        <Card className="border-dashed py-12 text-center">
          <p className="text-ink-muted">No hay repartos activos.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {deliveries.map((delivery) => {
            const next = NEXT_STEP[delivery.status];

            return (
              <Card key={delivery.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-ink">{delivery.order?.orderNumber}</p>
                  <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                    {delivery.status}
                  </span>
                </div>

                <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-muted">
                  <MapPin className="mt-0.5 size-4 shrink-0" />
                  {delivery.order?.addressSnapshotJson?.line1 ?? 'Sin direccion'}
                  {delivery.order?.addressSnapshotJson?.districtName
                    ? `, ${delivery.order.addressSnapshotJson.districtName}`
                    : ''}
                </p>

                <p className="mt-1 text-xs text-ink-muted">
                  {delivery.order?.contactName} · {delivery.order?.contactPhone ?? 'sin telefono'} ·{' '}
                  {formatCurrency(delivery.order?.grandTotal ?? 0)}
                </p>

                {delivery.driver ? (
                  <p className="mt-3 text-sm">
                    Repartidor: <strong>{delivery.driver.fullName}</strong>
                  </p>
                ) : (
                  <div className="mt-3">
                    <Select
                      id={`driver-${delivery.id}`}
                      label="Asignar repartidor"
                      defaultValue=""
                      disabled={busyId === delivery.id}
                      onChange={(event) => {
                        const driverId = Number(event.target.value);
                        if (!driverId) return;
                        void run(delivery.id, () => adminApi.assignDriver(delivery.id, driverId));
                      }}
                    >
                      <SelectOption value="">Elige un repartidor</SelectOption>
                      {drivers.map((driver) => (
                        <SelectOption key={driver.id} value={driver.id} disabled={driver.status === 'BUSY'}>
                          {driver.fullName} {driver.status === 'BUSY' ? '(ocupado)' : ''}
                        </SelectOption>
                      ))}
                    </Select>
                  </div>
                )}

                {next && (
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    disabled={busyId === delivery.id}
                    onClick={() =>
                      void run(delivery.id, () => adminApi.advanceDelivery(delivery.id, next.status))
                    }
                  >
                    {next.label}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DeliveryPage;
