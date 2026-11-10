import { useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bike, CircleCheckBig, Clock3, Download, PackageCheck, Phone, RefreshCw, UserRoundCheck, WifiOff } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card } from '@components/ui/Card';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import { Select, SelectOption } from '@components/ui/Select';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { LoadError } from '@components/common/LoadError';
import { api, getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { formatCurrency, formatRelative } from '@lib/format';
import { cn } from '@lib/cn';
import { OrderStatusBadge } from '@features/orders/components/OrderStatusBadge';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import { DeliveryStatusBadge } from '../components/StatusBadges';
import { DeliveryDestination } from '../components/DeliveryDestination';
import { OperationFlowGuide } from '../components/OperationFlowGuide';
import { OperationsMetricStrip } from '../components/OperationsMetricStrip';
import type { DeliveryRow, DeliveryStatus, Driver } from '../types';
import { CarTransportSettings } from '../components/CarTransportSettings';
import { DeliveryEvidence } from '../components/DeliveryEvidence';

const NEXT_STEP: Partial<Record<DeliveryStatus, { status: DeliveryStatus; label: string }>> = {
  ASSIGNED: { status: 'PICKED_UP', label: 'Recogí el pedido' },
  PICKED_UP: { status: 'ON_ROUTE', label: 'Voy en camino' },
  ON_ROUTE: { status: 'DELIVERED', label: 'Entregado' },
};

/** Tablero y flota viajan juntos: los dos tienen que refrescarse al mismo ritmo. */
interface DeliveryBoard {
  deliveries: DeliveryRow[];
  drivers: Driver[];
}

/**
 * Asignacion CON MOTIVO.
 *
 * `adminApi.assignDriver` todavia no acepta el motivo del cambio, y sin el una
 * reasignacion a mitad de ruta queda en la bitacora del reparto como un cambio de
 * nombre sin explicacion. Se llama al endpoint desde aqui hasta que la firma
 * compartida lo incluya; el contrato del servidor ya lo acepta.
 */
const assignDriverWithReason = async (
  deliveryId: number,
  driverId: number,
  reason?: string,
): Promise<void> => {
  await api.post(`/delivery/${deliveryId}/assign`, { driverId, reason: reason || undefined });
};

/** Etiqueta del repartidor en el desplegable: el estado no bloquea, informa. */
const driverLabel = (driver: Driver): string => {
  if (driver.status === 'BUSY') return `${driver.fullName} · con otra entrega`;
  if (driver.status === 'OFFLINE') return `${driver.fullName} · fuera de turno`;
  return driver.fullName;
};

/**
 * Vista del despachador Y del repartidor (M11).
 *
 * Para el repartidor esta es la UNICA pantalla de todo el producto: aqui ve la
 * direccion, la referencia y el telefono del cliente, y desde aqui cierra la
 * entrega. Se usa de pie, en la calle y con una sola mano, asi que las areas de
 * toque de esta pantalla son parte de que funcione, no un detalle visual.
 */
const DeliveryPage = () => {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [recipients, setRecipients] = useState<Record<number, string>>({});
  /** Asignacion en vuelo, para que el desplegable no muestre a quien NO se asigno. */
  const [pendingDriver, setPendingDriver] = useState<Record<number, number>>({});
  const [now, setNow] = useState(() => Date.now());
  const { can, isSuperAdmin } = usePermissions();
  const {
    branchId, branches, setBranchId, setGlobalScope, isLoadingBranches, branchesError, reloadBranches,
  } = useActiveBranch({ allowAll: isSuperAdmin });
  const [params] = useSearchParams();
  const linkedDelivery = Number(params.get('reparto'));
  const appliedDelivery = useRef<number>();
  const confirm = useConfirm();

  const canAssign = can(PERM.DELIVERY_ASSIGN);
  const canOperate = can(PERM.DELIVERY_OPERATE);

  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<DeliveryBoard> => {
      if (!branchId && !isSuperAdmin) return { deliveries: [], drivers: [] };

      // La flota entra en el ciclo de sondeo: se cargaba UNA vez y quien estaba
      // ocupado a las 9 seguia marcado como ocupado el resto de la jornada.
      const [deliveries, drivers] = await Promise.all([
        adminApi.deliveryBoard(branchId ?? undefined, signal, true),
        canAssign ? adminApi.drivers(branchId ?? undefined, signal) : Promise.resolve<Driver[]>([]),
      ]);

      return { deliveries, drivers };
    },
    [branchId, canAssign, isSuperAdmin],
  );
  const { data, error, isLoading, lastSuccessAt, isStale, refresh } =
    usePolling<DeliveryBoard>(fetcher, 6000);

  useEffect(() => {
    if (!linkedDelivery || appliedDelivery.current === linkedDelivery || !data?.deliveries.some((row) => row.id === linkedDelivery)) return;
    appliedDelivery.current = linkedDelivery; document.getElementById(`delivery-${linkedDelivery}`)?.scrollIntoView({ block: 'center' });
  }, [linkedDelivery, data]);

  // Con el sondeo caido nadie provoca renders: sin este reloj la banda diria
  // "hace 3 s" indefinidamente, que es peor que no decir nada.
  useEffect(() => {
    if (!error) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [error]);

  // La seleccion optimista se suelta en cuanto el servidor confirma quien lleva el
  // reparto (o el reparto desaparece del tablero). Asi el desplegable adelanta la
  // respuesta sin llegar a mentir: si la asignacion falla, se revierte en el catch.
  useEffect(() => {
    if (!data) return;
    setPendingDriver((current) => {
      const entries = Object.entries(current);
      if (entries.length === 0) return current;

      const next: Record<number, number> = {};
      for (const [id, driverId] of entries) {
        const row = data.deliveries.find((delivery) => delivery.id === Number(id));
        if (row && row.driver?.id !== driverId) next[Number(id)] = driverId;
      }

      return Object.keys(next).length === entries.length ? current : next;
    });
  }, [data]);

  const forgetPending = (deliveryId: number) =>
    setPendingDriver((current) => {
      if (current[deliveryId] === undefined) return current;
      const next = { ...current };
      delete next[deliveryId];
      return next;
    });

  const run = async (deliveryId: number, action: () => Promise<void>, onFailure?: () => void) => {
    setBusyId(deliveryId);
    try {
      await action();
      refresh();
    } catch (actionError) {
      onFailure?.();
      toast.error(getApiErrorMessage(actionError));
    } finally {
      setBusyId(null);
    }
  };

  const handleAssign = async (delivery: DeliveryRow, driverId: number, fleet: Driver[]) => {
    const driver = fleet.find((row) => row.id === driverId);
    const previous = delivery.driver;
    let reason = '';

    // Reasignar tiene consecuencias en la calle: alguien deja de ir y otro sale.
    if (previous) {
      const result = await confirm({
        title: 'Cambiar de repartidor',
        message: `${delivery.order?.orderNumber ?? 'Este reparto'} pasa de ${previous.fullName} a ${driver?.fullName ?? 'otro repartidor'}. ${previous.fullName} queda libre para otra entrega.`,
        confirmLabel: 'Reasignar',
        reasonLabel: 'Motivo del cambio',
        reasonRequired: true,
      });
      if (!result.confirmed) return;
      reason = result.reason;
    }

    setPendingDriver((current) => ({ ...current, [delivery.id]: driverId }));

    await run(
      delivery.id,
      async () => {
        await assignDriverWithReason(delivery.id, driverId, reason);
        toast.success(
          previous
            ? `${delivery.order?.orderNumber ?? 'El reparto'} ahora lo lleva ${driver?.fullName ?? 'otro repartidor'}`
            : `${driver?.fullName ?? 'Repartidor'} asignado a ${delivery.order?.orderNumber ?? 'el reparto'}`,
        );
      },
      () => forgetPending(delivery.id),
    );
  };

  const handleAdvance = (delivery: DeliveryRow, next: { status: DeliveryStatus; label: string }) =>
    run(delivery.id, async () => {
      await api.post(`/delivery/${delivery.id}/advance`, { status: next.status, recipientName: next.status === 'DELIVERED' ? recipients[delivery.id]?.trim() || undefined : undefined });
      if (next.status === 'DELIVERED') toast.success('Entrega registrada. Buen trabajo.');
    });

  /**
   * Entrega fallida. Sin esto, una moto pinchada o un cliente ausente dejaban el
   * pedido en ruta para siempre y al repartidor ocupado el resto del turno.
   */
  const handleFailure = async (delivery: DeliveryRow) => {
    const { confirmed, reason } = await confirm({
      title: 'No se pudo entregar',
      message: `El reparto de ${delivery.order?.orderNumber ?? 'este pedido'} se cierra como fallido y ${delivery.driver?.fullName ?? 'el repartidor'} queda libre. El pedido no se cancela solo: queda para que Pedidos lo resuelva con el cliente.`,
      confirmLabel: 'Marcar como fallida',
      tone: 'danger',
      reasonLabel: '¿Qué pasó?',
      reasonRequired: true,
    });
    if (!confirmed) return;

    await run(delivery.id, async () => {
      await adminApi.advanceDelivery(delivery.id, 'FAILED', reason);
      toast.success('Entrega marcada como fallida');
    });
  };

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;

  const deliveries = data?.deliveries ?? [];
  const activeDeliveries = deliveries.filter((delivery) => delivery.status !== 'FAILED');
  const failedDeliveries = deliveries.filter((delivery) => delivery.status === 'FAILED');
  const drivers = data?.drivers ?? [];
  const activeBranchName = branchId === null && isSuperAdmin ? 'Todas las sucursales' : branches.find((branch) => branch.id === branchId)?.name ?? null;
  const waitingAssignment = activeDeliveries.filter((delivery) => delivery.status === 'PENDING').length;
  const assigned = activeDeliveries.filter((delivery) => delivery.status === 'ASSIGNED').length;
  const readyForPickup = activeDeliveries.filter(
    (delivery) => delivery.status === 'ASSIGNED' && delivery.order?.status === 'READY',
  ).length;
  const onTheRoad = activeDeliveries.filter(
    (delivery) => delivery.status === 'PICKED_UP' || delivery.status === 'ON_ROUTE',
  ).length;
  const overdue = activeDeliveries.filter((delivery) => delivery.order?.scheduledAt && new Date(delivery.order.scheduledAt).getTime() < now && delivery.status !== 'DELIVERED').length;

  const freshnessLabel = (() => {
    if (lastSuccessAt === null) return 'todavía sin datos de esta cocina';
    const seconds = Math.max(0, Math.round((now - lastSuccessAt) / 1000));
    return seconds < 90
      ? `datos de hace ${seconds} s`
      : `datos de ${formatRelative(new Date(lastSuccessAt))}`;
  })();
  const exportDeliveries = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const lines = [['Pedido', 'Sucursal', 'Estado', 'Cliente', 'Fecha programada', 'Repartidor', 'Motivo de fallo', 'Cobro pendiente'], ...deliveries.map((delivery) => [delivery.order?.orderNumber ?? delivery.id, branches.find((branch) => branch.id === delivery.branchId)?.name ?? delivery.branchId, delivery.status, delivery.order?.contactName, delivery.order?.scheduledAt, delivery.driver?.fullName, delivery.failureReason, delivery.cashDue ?? ''])];
    const blob = new Blob([`\uFEFF${lines.map((line) => line.map(escape).join(',')).join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `reparto-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Última milla"
        title="Reparto"
        description={
          canAssign
            ? 'Asigna repartidores y sigue cada entrega desde que el pedido se confirma.'
            : 'Tus entregas de esta cocina, con la dirección y el teléfono de cada cliente.'
        }
        icon={Bike}
        action={
          <div className="flex flex-wrap items-center gap-2"><BranchSelector value={branchId} branches={branches} onChange={setBranchId} allowAll={isSuperAdmin} onSelectAll={setGlobalScope} hasError={Boolean(branchesError)} /><Button size="sm" variant="outline" leftIcon={<Download className="size-4" />} disabled={!deliveries.length} onClick={exportDeliveries}>Exportar</Button></div>
        }
      />

      <OperationFlowGuide stage="delivery" branchName={activeBranchName} />
      {data && canAssign && branchId && <CarTransportSettings key={branchId} branchId={branchId} drivers={data.drivers} onFleetSaved={() => void refresh()} />}

      {data && (
        <OperationsMetricStrip
          className="mb-5"
          metrics={[
            { label: 'Sin asignar', value: waitingAssignment, icon: Clock3, tone: waitingAssignment > 0 ? 'accent' : 'neutral' },
            { label: 'Asignados', value: assigned, icon: UserRoundCheck, tone: 'brand' },
            { label: 'Listos para recoger', value: readyForPickup, icon: PackageCheck },
            { label: 'En traslado', value: onTheRoad, icon: CircleCheckBig },
            { label: 'Atrasadas', value: overdue, icon: Clock3, tone: overdue > 0 ? 'danger' : 'neutral' },
          ]}
          ariaLabel="Carga actual de reparto"
        />
      )}

      {branchesError && (
        <LoadError
          title="No pudimos cargar las cocinas"
          message={branchesError}
          onRetry={() => void reloadBranches()}
          className="mb-5"
        />
      )}

      {/* Banda persistente: en la calle el fallo de red no se ve, y un tablero
          congelado se lee exactamente igual que uno al dia. */}
      {error && data && (
        <div
          role="status"
          className={cn(
            'mb-5 flex flex-col gap-3 rounded-card border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between',
            isStale
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-accent-200 bg-accent-50 text-accent-700',
          )}
        >
          <p className="flex items-start gap-2 font-medium">
            <WifiOff className="mt-0.5 size-4 shrink-0" />
            {isStale ? 'Sin conexión' : 'No pudimos actualizar'} · {freshnessLabel}. Lo que ves aquí
            puede haber cambiado.
          </p>
          <Button
            variant="outline"
            className="shrink-0"
            leftIcon={<RefreshCw className="size-4" />}
            onClick={refresh}
          >
            Reintentar
          </Button>
        </div>
      )}

      {!canAssign && !canOperate && (
        <p className="mb-5 rounded-card border border-line bg-surface-muted px-4 py-3 text-sm text-ink-muted">
          Estás viendo el reparto en modo consulta: asignar repartidores y registrar entregas
          necesita permisos de operación.
        </p>
      )}

      {error && !data ? (
        <LoadError message={error} onRetry={refresh} />
      ) : deliveries.length === 0 ? (
        <EmptyState
          icon={Bike}
          title={canAssign ? 'No hay repartos activos' : 'No tienes repartos asignados'}
          description={
            canAssign
              ? 'Cuando se confirme un pedido para esta cocina, aparecerá aquí para asignar repartidor.'
              : 'Cuando el despachador te asigne una entrega, aparecerá aquí con la dirección y el teléfono del cliente.'
          }
        />
      ) : (
        <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeDeliveries.map((delivery) => {
            const next = NEXT_STEP[delivery.status];
            const order = delivery.order;
            const address = order?.addressSnapshotJson ?? null;
            const isBusy = busyId === delivery.id;
            const isWaitingForKitchen = next?.status === 'PICKED_UP' && order?.status !== 'READY';
            // La seleccion en vuelo manda sobre lo que dice el servidor: es lo que
            // el usuario acaba de elegir y todavia esta viajando.
            const selectedDriverId = pendingDriver[delivery.id] ?? delivery.driver?.id ?? '';
            const isDriverListed =
              !delivery.driver || drivers.some((driver) => driver.id === delivery.driver?.id);
            const compatibleDrivers = drivers.filter((driver) => driver.branchId === delivery.branchId && (order?.deliveryVehicleType !== 'CAR' || driver.vehicleType === 'CAR'));
            const hasAvailableDriver = compatibleDrivers.some((driver) => driver.status !== 'OFFLINE');
            const assignmentHint = drivers.length === 0
              ? 'Primero registra un repartidor para esta sucursal desde el aviso superior.'
              : compatibleDrivers.length === 0
                ? 'Este pedido requiere auto. Configura el vehículo de un repartidor en Entrega en auto.'
                : !hasAvailableDriver
                  ? 'Los repartidores compatibles están fuera de turno.'
                  : undefined;

            return (
              <Card id={`delivery-${delivery.id}`} key={delivery.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{order?.orderNumber ?? `Reparto #${delivery.id}`}</p>
                    {order?.status && (
                      <div className="mt-1">
                        <OrderStatusBadge status={order.status} />
                      </div>
                    )}
                  </div>
                  <DeliveryStatusBadge status={delivery.status} />
                </div>

                <DeliveryDestination address={address} notes={order?.notes} />
                {order?.deliveryVehicleType === 'CAR' && <div className="rounded-field border border-brand-100 bg-brand-50 p-3 text-sm"><strong className="text-brand-800">Entrega en auto obligatoria</strong><p className="mt-1 text-xs leading-5 text-ink-muted">{order.deliveryHandlingInstructions}</p></div>}

                <p className="text-sm text-ink-muted">
                  {order?.contactName ?? 'Sin contacto'} · {formatCurrency(order?.grandTotal ?? 0)}
                </p>

                {delivery.cashDue !== null && delivery.cashDue !== undefined && <p className="rounded-field border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900">Cobrar contra entrega: {formatCurrency(delivery.cashDue)}</p>}
                <div className="flex flex-wrap gap-2">
                  {order?.contactPhone ? (
                    <Button
                      component="a"
                      href={`tel:${order.contactPhone}`}
                      variant="outline"
                      leftIcon={<Phone className="size-4" />}
                    >
                      {order.contactPhone}
                    </Button>
                  ) : (
                    <span className="self-center text-sm text-ink-muted">Sin teléfono</span>
                  )}
                </div>

                {isWaitingForKitchen && (
                  <p className="rounded-field border border-accent-200 bg-accent-50 px-3 py-2 text-xs font-medium text-accent-800">
                    Esperando a Cocina. Puedes dejar el repartidor asignado, pero el retiro se habilita cuando el pedido este listo.
                  </p>
                )}

                {canAssign ? (
                  <Select
                    id={`driver-${delivery.id}`}
                    label={delivery.driver ? 'Repartidor (cambiar)' : 'Asignar repartidor'}
                    value={selectedDriverId}
                    disabled={isBusy || !hasAvailableDriver}
                    hint={assignmentHint}
                    slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                    onChange={(event) => {
                      const driverId = Number(event.target.value);
                      if (!driverId || driverId === delivery.driver?.id) return;
                      void handleAssign(delivery, driverId, drivers);
                    }}
                  >
                    <SelectOption value="" disabled>{hasAvailableDriver ? 'Elige un repartidor' : 'Sin repartidores disponibles'}</SelectOption>
                    {/* El asignado puede no estar en la flota activa (se dio de baja
                        a mitad de ruta): sin esta opcion el desplegable saldria vacio. */}
                    {!isDriverListed && delivery.driver && (
                      <SelectOption value={delivery.driver.id}>
                        {delivery.driver.fullName} · fuera de la flota
                      </SelectOption>
                    )}
                    {drivers.map((driver) => (
                      // OFFLINE es lo unico que el servidor rechaza. Deshabilitar
                      // tambien a los ocupados era mas restrictivo que el backend y
                      // dejaba repartos sin asignar en plena hora punta.
                      <SelectOption
                        key={driver.id}
                        value={driver.id}
                        disabled={driver.status === 'OFFLINE' || (order?.deliveryVehicleType === 'CAR' && driver.vehicleType !== 'CAR')}
                      >
                        {driverLabel(driver)}{driver.vehicleType === 'CAR' ? ' · Auto' : order?.deliveryVehicleType === 'CAR' ? ' · No compatible' : ''}
                      </SelectOption>
                    ))}
                  </Select>
                ) : (
                  <p className="text-sm text-ink">
                    {delivery.driver ? (
                      <>Repartidor: <strong>{delivery.driver.fullName}</strong></>
                    ) : (
                      <span className="text-ink-muted">Sin repartidor asignado</span>
                    )}
                  </p>
                )}

                {canOperate && delivery.status === 'ON_ROUTE' && <Input required label="Nombre de quien recibe (o adjunta foto de entrega)" value={recipients[delivery.id] ?? ''} maxLength={120} onChange={(event) => setRecipients((current) => ({ ...current, [delivery.id]: event.target.value }))} />}
                {canOperate && (next || delivery.status !== 'PENDING') && (
                  <div className="mt-auto grid gap-2 pt-1">
                    {next && (
                      // Se pulsa en la calle, con el móvil en una mano: 48 px.
                      <Button
                        size="lg"
                        className="w-full"
                        isLoading={isBusy}
                        disabled={isBusy || isWaitingForKitchen}
                        onClick={() => void handleAdvance(delivery, next)}
                      >
                        {isWaitingForKitchen ? 'Esperando a cocina' : next.label}
                      </Button>
                    )}
                    {delivery.status !== 'PENDING' && (
                      <Button
                        variant="outline"
                        className="w-full"
                        disabled={isBusy}
                        onClick={() => void handleFailure(delivery)}
                      >
                        No se pudo entregar
                      </Button>
                    )}
                  </div>
                )}
                {delivery.status !== 'PENDING' && <DeliveryEvidence deliveryId={delivery.id} status={delivery.status} evidence={delivery.evidence} canUpload={canOperate} onSaved={() => void refresh()} />}
              </Card>
            );
          })}
        </div>
        {failedDeliveries.length > 0 && <section className="mt-6 space-y-3" aria-labelledby="failed-deliveries-title"><div><h2 id="failed-deliveries-title" className="text-lg font-black text-ink">Entregas fallidas</h2><p className="mt-1 text-sm text-ink-muted">Revisa el motivo y reprograma la entrega después de contactar al cliente.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{failedDeliveries.map((delivery) => <Card key={delivery.id} className="border-red-200 bg-red-50/40"><div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-ink">{delivery.order?.orderNumber ?? `Reparto #${delivery.id}`}</p><p className="mt-1 text-xs text-ink-muted">{delivery.order?.contactName ?? ''} · {delivery.order?.scheduledAt ? new Date(delivery.order.scheduledAt).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha'}</p></div><DeliveryStatusBadge status={delivery.status} /></div><p className="mt-3 rounded-field border border-red-200 bg-white p-3 text-sm text-red-800"><strong>Motivo:</strong> {delivery.failureReason ?? 'Sin motivo registrado'}</p>{canAssign && <Button className="mt-3 w-full" disabled={busyId === delivery.id} isLoading={busyId === delivery.id} onClick={() => void run(delivery.id, async () => { await adminApi.retryDelivery(delivery.id, 'Reprogramada desde Reparto'); toast.success('Entrega reprogramada'); })}>Reprogramar entrega</Button>}</Card>)}</div></section>}
        </>
      )}
    </div>
  );
};

export default DeliveryPage;
