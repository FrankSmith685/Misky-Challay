import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Car, CalendarClock } from 'lucide-react';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Select, SelectOption } from '@components/ui/Select';
import { api, getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { ROUTES } from '@constants/routes';
import toast from '@components/mui/MuiToast';
import type { Driver } from '../types';

interface TransportSettings {
  defaultCarCapacity: number;
  instructions: string;
  hasCars: boolean;
  slots: Array<{ id: number; startsAt: string; endsAt: string; capacity: number; carCapacity: number; booked: number }>;
}
const day = (date: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
const time = (date: string) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' }).format(new Date(date));

function DriverVehicle({ driver, branchId, onSaved }: { driver: Driver; branchId: number; onSaved: () => void }) {
  const [vehicleType, setType] = useState(driver.vehicleType ?? 'UNSPECIFIED');
  const [vehicle, setVehicle] = useState(driver.vehicle ?? '');
  const [maxActiveDeliveries, setMaxActiveDeliveries] = useState(driver.maxActiveDeliveries ?? 3);
  const [busy, setBusy] = useState(false);
  return <div className="grid gap-3 rounded-field border border-line p-4 sm:grid-cols-[1fr_1fr_150px_auto] sm:items-end">
    <div className="sm:col-span-4"><p className="text-sm font-semibold">{driver.fullName}</p><p className="mt-1 text-xs text-ink-muted">{driver.status === 'OFFLINE' ? 'Fuera de turno' : driver.status === 'BUSY' ? `${driver.activeDeliveries ?? 1} entrega${(driver.activeDeliveries ?? 1) === 1 ? '' : 's'} activa${(driver.activeDeliveries ?? 1) === 1 ? '' : 's'}` : 'Disponible'} · carga máxima: {driver.maxActiveDeliveries ?? 3}</p></div>
    <Select label={`Vehículo de ${driver.fullName}`} value={vehicleType} onChange={(event) => setType(event.target.value as NonNullable<Driver['vehicleType']>)}>
      <SelectOption value="UNSPECIFIED">Sin clasificar</SelectOption><SelectOption value="CAR">Auto</SelectOption><SelectOption value="MOTORCYCLE">Moto</SelectOption><SelectOption value="OTHER">Otro</SelectOption>
    </Select>
    <Input label={`Placa o descripción de ${driver.fullName}`} value={vehicle} maxLength={50} onChange={(event) => setVehicle(event.target.value)} />
    <Input label="Límite de entregas activas" type="number" min={1} max={20} value={maxActiveDeliveries} onChange={(event) => setMaxActiveDeliveries(Number(event.target.value))} />
    <Button variant="outline" isLoading={busy} disabled={busy || (vehicleType === (driver.vehicleType ?? 'UNSPECIFIED') && vehicle === (driver.vehicle ?? '') && maxActiveDeliveries === (driver.maxActiveDeliveries ?? 3))} onClick={async () => {
      setBusy(true);
      try { await api.patch(`/delivery/drivers/${driver.id}`, { branchId, vehicleType, vehicle: vehicle || null, maxActiveDeliveries }); toast.success('Vehículo actualizado'); onSaved(); }
      catch (error) { toast.error(getApiErrorMessage(error)); } finally { setBusy(false); }
    }}>Guardar vehículo</Button>
  </div>;
}

export function CarTransportSettings({ branchId, drivers, onFleetSaved }: { branchId: number; drivers: Driver[]; onFleetSaved: () => void }) {
  const { can } = usePermissions();
  const canManageUsers = can(PERM.USER_MANAGE);
  const [settings, setSettings] = useState<TransportSettings | null>(null);
  const [error, setError] = useState('');
  const [selectedDay, setDay] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setSettings(null); setError(''); setDirty(false);
    api.get<{ data: TransportSettings }>('/delivery/transport', { params: { branchId }, signal: controller.signal }).then(({ data }) => {
      setSettings(data.data); setDay(data.data.slots[0] ? day(data.data.slots[0].startsAt) : '');
    }).catch((cause) => { if (!controller.signal.aborted) setError(getApiErrorMessage(cause)); });
    return () => controller.abort();
  }, [branchId, revision]);
  const cars = drivers.filter((driver) => driver.vehicleType === 'CAR').length;
  return <Card className="mb-6">
    {drivers.length === 0 && (
      <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-field border border-accent-200 bg-accent-50 p-4">
        <div className="min-w-0 flex-1 basis-64">
          <p className="font-semibold text-accent-800">No hay repartidores registrados en esta sucursal</p>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            {canManageUsers
              ? 'En Usuarios, crea una cuenta o asigna el rol Repartidor a una existente y elige esta sucursal. Después configura su vehículo aquí.'
              : 'Pide a un administrador que asigne una cuenta con el rol Repartidor a esta sucursal. Después podrás configurar su vehículo aquí.'}
          </p>
        </div>
        {canManageUsers && <Button component={Link} to={ROUTES.adminUsers} variant="outline">Registrar repartidor</Button>}
      </div>
    )}
    <details>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3"><span className="rounded-field bg-brand-50 p-3 text-brand-700"><Car className="size-5" /></span><span><span className="block font-semibold text-ink">Entrega en auto para todas las tortas</span><span className="mt-1 block text-sm text-ink-muted">Flota, cupos por horario e indicaciones de traslado.</span></span></span>
        <span className="text-sm font-medium text-brand-700">{cars} {cars === 1 ? 'auto registrado' : 'autos registrados'} · Configurar</span>
      </summary>
      <div className="mt-6 space-y-6 border-t border-line pt-6">
        <p className="text-sm leading-6 text-ink-muted">El checkout utiliza la tarifa vigente por zona y distancia. <Link className="font-medium text-brand-700 underline" to="/admin/cobertura">Administrar tarifas y cobertura</Link>. Los cupos en cero mantienen disponible el recojo en taller.</p>
        {cars === 0 && <p role="status" className="rounded-field border border-accent-200 bg-accent-50 p-4 text-sm text-accent-800">Registra un conductor con auto y configura sus cupos para habilitar esta modalidad en el checkout.</p>}
        <section className="space-y-3"><h3 className="font-semibold">Conductores y vehículos</h3>
          {drivers.length === 0 && <p className="text-sm text-ink-muted">Los repartidores aparecerán aquí cuando tengan esta sucursal asignada en Usuarios.</p>}
          {drivers.map((driver) => <DriverVehicle key={`${driver.id}:${driver.vehicleType}:${driver.vehicle}`} driver={driver} branchId={branchId} onSaved={() => { onFleetSaved(); }} />)}
        </section>
        {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">{error}<Button variant="outline" onClick={() => setRevision((value) => value + 1)}>Reintentar</Button></div>}
        {!settings && !error && <p className="text-sm text-ink-muted">Cargando horarios…</p>}
        {settings && <section className="space-y-4">
          <div className="grid gap-4 rounded-field border border-line p-4 sm:grid-cols-[1fr_200px] sm:items-center">
            <div><h3 className="text-sm font-semibold">Cupo predeterminado por franja</h3><p className="mt-1 text-sm leading-6 text-ink-muted">Se aplica a los nuevos horarios, incluidos los generados automáticamente. Puedes ajustar cada franja por separado.</p></div>
            <Input label="Cupos de auto predeterminados" type="number" min={0} max={500} value={settings.defaultCarCapacity} onChange={(event) => { setDirty(true); setSettings({ ...settings, defaultCarCapacity: Number(event.target.value) }); }} />
            <div className="sm:col-span-2"><Button variant="outline" disabled={!Number.isInteger(settings.defaultCarCapacity) || settings.defaultCarCapacity < 0 || settings.defaultCarCapacity > 500 || settings.slots.length === 0} onClick={() => {
              if (settings.slots.some((slot) => slot.booked > Math.min(slot.capacity, settings.defaultCarCapacity))) { toast.error('Hay franjas con más reservas que el nuevo cupo. Ajusta esas franjas por separado.'); return; }
              setDirty(true); setSettings({ ...settings, slots: settings.slots.map((slot) => ({ ...slot, carCapacity: Math.min(slot.capacity, settings.defaultCarCapacity) })) });
            }}>Aplicar a franjas abiertas</Button><p className="mt-2 text-xs leading-5 text-ink-muted">Actualiza los horarios cargados de este taller al guardar, respetando su capacidad total y los pedidos reservados.</p></div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4"><h3 className="flex items-center gap-2 font-semibold"><CalendarClock className="size-4" /> Cupos de entrega en auto</h3><Input label="Fecha de los cupos" type="date" value={selectedDay} onChange={(event) => setDay(event.target.value)} /></div>
          <p className="text-sm text-ink-muted">Cada pedido con torta ocupa un cupo. El cupo se reserva al abrir el pago y se libera si el pedido se cancela o vence. Los horarios se generan desde Cobertura.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {settings.slots.filter((slot) => day(slot.startsAt) === selectedDay).map((slot) => <div key={slot.id} className="space-y-3 rounded-field border border-line p-4">
              <p className="text-sm font-semibold">{time(slot.startsAt)} – {time(slot.endsAt)}</p>
              <p className="text-xs text-ink-muted">{slot.booked} reservados · Capacidad total: {slot.capacity}</p>
              <Input label={`Cupos de auto ${time(slot.startsAt)}`} type="number" min={slot.booked} max={slot.capacity} value={slot.carCapacity} onChange={(event) => {
                const value = Number(event.target.value); setDirty(true); setSettings({ ...settings, slots: settings.slots.map((entry) => entry.id === slot.id ? { ...entry, carCapacity: value } : entry) });
              }} />
            </div>)}
          </div>
          {!settings.slots.some((slot) => day(slot.startsAt) === selectedDay) && <p className="rounded-field bg-surface-muted p-4 text-sm text-ink-muted">No hay horarios de venta abiertos para esta fecha. Genera o revisa las franjas en Cobertura.</p>}
          <Textarea label="Indicaciones de manipulación y traslado" rows={3} maxLength={1000} value={settings.instructions} onChange={(event) => { setDirty(true); setSettings({ ...settings, instructions: event.target.value }); }} />
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-ink-muted">{dirty ? 'Tienes cambios por guardar.' : 'Los pedidos conservan las indicaciones vigentes al confirmar su compra.'}</span>
            <Button isLoading={busy} disabled={busy || !dirty || settings.instructions.trim().length < 10 || !Number.isInteger(settings.defaultCarCapacity) || settings.defaultCarCapacity < 0 || settings.defaultCarCapacity > 500 || settings.slots.some((slot) => !Number.isInteger(slot.carCapacity) || slot.carCapacity < slot.booked || slot.carCapacity > slot.capacity)} onClick={async () => {
              setBusy(true); try {
                const { data } = await api.put<{ data: TransportSettings }>('/delivery/transport', { branchId, instructions: settings.instructions, defaultCarCapacity: settings.defaultCarCapacity, slots: settings.slots.map(({ id, carCapacity }) => ({ id, carCapacity })) });
                setSettings(data.data); setDirty(false); toast.success('Cupos e indicaciones guardados'); onFleetSaved();
              } catch (cause) { toast.error(getApiErrorMessage(cause)); } finally { setBusy(false); }
            }}>Guardar cupos e indicaciones</Button>
          </div>
        </section>}
      </div>
    </details>
  </Card>;
}
