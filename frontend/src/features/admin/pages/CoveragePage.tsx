import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CircleDollarSign, History, MapPin, Navigation, Pencil, Plus, Save, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardDescription } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { FormActions, FormSection } from '@components/ui/FormSection';
import { Select, SelectOption } from '@components/ui/Select';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import { AddressAutocomplete } from '@features/geo/components/AddressAutocomplete';
import { AddressMapPicker } from '@features/geo/components/AddressMapPicker';
import { CoveragePolygonPicker, type PolygonPoint } from '@features/geo/components/CoveragePolygonPicker';
import { CoverageOverviewMap } from '@features/geo/components/CoverageOverviewMap';
import { commercialApi, type Coverage } from '../services/commercialAdmin.service';
import { adminApi } from '../services/admin.service';
import type { AuditLogRow } from '../types';

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const EMPTY_ZONE: { name: string; deliveryFee: string; minimumOrder: string; estimatedMinutes: string; polygon: PolygonPoint[] } = { name: '', deliveryFee: '6.90', minimumOrder: '25', estimatedMinutes: '35', polygon: [] };
const EMPTY_BRANCH: { name: string; addressLine: string; phone: string; prepMinutes: string; districtId: number | ''; latitude: number | null; longitude: number | null } = { name: '', addressLine: '', phone: '', prepMinutes: '20', districtId: '', latitude: null, longitude: null };
const ZONE_DRAFT_KEY = 'verde-bowl:admin:coverage-zone-draft:v1';
const SERVER_ZONE_DRAFT_KEY = 'coverage-zone-new';

const pointInPolygon = (point: PolygonPoint, polygon: PolygonPoint[]) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if ((currentPoint.lat > point.lat) !== (previousPoint.lat > point.lat)
      && point.lng < ((previousPoint.lng - currentPoint.lng) * (point.lat - currentPoint.lat)) / (previousPoint.lat - currentPoint.lat) + currentPoint.lng) inside = !inside;
  }
  return inside;
};

const polygonsOverlap = (first: PolygonPoint[], second: PolygonPoint[]) =>
  first.some((point) => pointInPolygon(point, second)) || second.some((point) => pointInPolygon(point, first));

/**
 * Cobertura: sucursales, horarios, zonas y distritos.
 *
 * Lo que se toca aqui cambia lo que el cliente ve al validar su direccion:
 * el costo del delivery, el pedido minimo y si su distrito tiene cobertura.
 */
const AdminCoveragePage = () => {
  const [data, setData] = useState<Coverage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [setup, setSetup] = useState<'zone' | 'branch' | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [zoneForm, setZoneForm] = useState(EMPTY_ZONE);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH);
  const [history, setHistory] = useState<AuditLogRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishAt, setPublishAt] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await commercialApi.coverage());
      adminApi.auditLogs('coverage_zones').then(setHistory).catch(() => setHistory([]));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (setup !== 'zone' || editingZoneId !== null) return;
    const timer = window.setTimeout(() => localStorage.setItem(ZONE_DRAFT_KEY, JSON.stringify(zoneForm)), 300);
    return () => window.clearTimeout(timer);
  }, [zoneForm, setup, editingZoneId]);

  const openZoneCreate = async () => {
    try {
      const serverDraft = await commercialApi.getDraft<typeof EMPTY_ZONE>(SERVER_ZONE_DRAFT_KEY);
      if (serverDraft) {
        setZoneForm(serverDraft.payload);
        setPublishAt(serverDraft.publishAt ? new Date(serverDraft.publishAt).toISOString().slice(0, 16) : '');
        toast.success('Recuperamos el borrador compartido');
      } else {
        const draft = JSON.parse(localStorage.getItem(ZONE_DRAFT_KEY) ?? 'null') as typeof EMPTY_ZONE | null;
        setZoneForm(draft ?? EMPTY_ZONE);
      }
    } catch {
      try { setZoneForm(JSON.parse(localStorage.getItem(ZONE_DRAFT_KEY) ?? 'null') ?? EMPTY_ZONE); } catch { setZoneForm(EMPTY_ZONE); }
    }
    setEditingZoneId(null);
    setSetup('zone');
  };

  const saveZoneDraft = async () => {
    setBusy('draft');
    try {
      const cityId = data?.cities[0]?.id;
      if (!cityId) throw new Error('Primero debe existir una ciudad');
      await commercialApi.saveDraft(SERVER_ZONE_DRAFT_KEY, 'coverage-zone', {
        ...zoneForm,
        cityId,
        deliveryFee: Number(zoneForm.deliveryFee),
        minimumOrder: Number(zoneForm.minimumOrder),
        estimatedMinutes: Number(zoneForm.estimatedMinutes),
        priority: (data?.zones.length ?? 0) + 1,
      }, publishAt ? new Date(publishAt).toISOString() : null);
      toast.success(publishAt ? 'Publicación programada' : 'Borrador guardado en el servidor');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const openZoneEdit = (zone: Coverage['zones'][number]) => {
    setZoneForm({
      name: zone.name,
      deliveryFee: String(zone.deliveryFee),
      minimumOrder: String(zone.minimumOrder),
      estimatedMinutes: String(zone.estimatedMinutes),
      polygon: zone.polygon ?? [],
    });
    setSetup(null);
    setEditingZoneId(zone.id);
  };

  const run = async (key: string, action: () => Promise<void>, message: string) => {
    setBusy(key);
    try {
      await action();
      toast.success(message);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const createSetup = async () => {
    const cityId = data?.cities[0]?.id;
    if (!cityId) return toast.error('Primero debe existir una ciudad');

    setBusy('setup');
    try {
      if (setup === 'zone' || editingZoneId !== null) {
        if (zoneForm.name.trim().length < 3) throw new Error('Escribe el nombre de la zona');
        if (editingZoneId !== null) {
          await commercialApi.updateZone(editingZoneId, {
            name: zoneForm.name.trim(),
            deliveryFee: Number(zoneForm.deliveryFee),
            minimumOrder: Number(zoneForm.minimumOrder),
            estimatedMinutes: Number(zoneForm.estimatedMinutes),
            polygon: zoneForm.polygon.length >= 3 ? zoneForm.polygon : null,
          });
        } else {
          await commercialApi.createZone({
            cityId,
            name: zoneForm.name.trim(),
            deliveryFee: Number(zoneForm.deliveryFee),
            minimumOrder: Number(zoneForm.minimumOrder),
            estimatedMinutes: Number(zoneForm.estimatedMinutes),
            priority: (data?.zones.length ?? 0) + 1,
            polygon: zoneForm.polygon.length >= 3 ? zoneForm.polygon : undefined,
          });
        }
        setZoneForm(EMPTY_ZONE);
        localStorage.removeItem(ZONE_DRAFT_KEY);
        if (editingZoneId === null) await commercialApi.deleteDraft(SERVER_ZONE_DRAFT_KEY).catch(() => undefined);
        setPublishAt('');
        toast.success(editingZoneId !== null ? 'Zona actualizada y publicada' : 'Zona creada. Ahora abre los distritos que atenderá.');
      }

      if (setup === 'branch') {
        if (branchForm.name.trim().length < 3 || branchForm.addressLine.trim().length < 5) {
          throw new Error('Completa el nombre y direccion de la cocina');
        }
        const branch = await commercialApi.createBranch({
          cityId,
          name: branchForm.name.trim(),
          addressLine: branchForm.addressLine.trim(),
          districtId: branchForm.districtId === '' ? undefined : Number(branchForm.districtId),
          latitude: branchForm.latitude,
          longitude: branchForm.longitude,
          phone: branchForm.phone.trim() || undefined,
          prepMinutes: Number(branchForm.prepMinutes),
          acceptsPickup: true,
          acceptsDelivery: true,
        });
        if (data?.zones[0]) await commercialApi.assignZoneToBranch(data.zones[0].id, branch.id);
        setBranchForm(EMPTY_BRANCH);
        toast.success('Cocina creada con horario inicial de 10:00 a 22:00');
      }

      setSetup(null);
      setEditingZoneId(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !data) return <PageLoader />;

  const overlapWarnings = data.zones.flatMap((zone, index) => data.zones.slice(index + 1).flatMap((other) =>
    zone.isActive && other.isActive && zone.polygon && other.polygon && polygonsOverlap(zone.polygon, other.polygon)
      ? [`${zone.name} se superpone con ${other.name}`]
      : [],
  ));
  const branchWarnings = data.zones.flatMap((zone) => zone.branchIds.flatMap((branchId) => {
    const branch = data.branches.find((entry) => entry.id === branchId);
    if (!zone.polygon || !branch || branch.latitude == null || branch.longitude == null) return [];
    return pointInPolygon({ lat: branch.latitude, lng: branch.longitude }, zone.polygon)
      ? []
      : [`${branch.name} está fuera del polígono de ${zone.name}`];
  }));

  const patchZone = (zoneId: number, patch: Partial<Coverage['zones'][number]>) => {
    setData((current) =>
      current
        ? {
            ...current,
            zones: current.zones.map((zone) =>
              zone.id === zoneId ? { ...zone, ...patch } : zone,
            ),
          }
        : current,
    );
  };

  const patchSchedule = (
    branchId: number,
    scheduleId: number,
    patch: { opensAt?: string; closesAt?: string; isClosed?: boolean },
  ) => {
    setData((current) =>
      current
        ? {
            ...current,
            branches: current.branches.map((branch) =>
              branch.id === branchId
                ? {
                    ...branch,
                    schedules: branch.schedules.map((schedule) =>
                      schedule.id === scheduleId ? { ...schedule, ...patch } : schedule,
                    ),
                  }
                : branch,
            ),
          }
        : current,
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Operación territorial"
        title="Cobertura y cocinas"
        description="Configura dónde operas, cuánto cobras y qué horarios acepta cada cocina."
        icon={MapPin}
        action={<>
          <Button variant="ghost" leftIcon={<History className="size-4" />} onClick={() => setHistoryOpen(true)}>Historial</Button>
          <Button variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => void openZoneCreate()}>Nueva zona</Button>
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setSetup('branch')}>Nueva cocina</Button>
        </>}
      />

      <CoverageOverviewMap zones={data.zones} branches={data.branches} />

      {(overlapWarnings.length > 0 || branchWarnings.length > 0) && (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-black"><AlertTriangle className="size-5" /> Revisa la configuración territorial</p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-xs">
            {[...overlapWarnings, ...branchWarnings].map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      )}

      {/* ---------------- Zonas ---------------- */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Zonas de entrega</h2>

        <div className="grid gap-4 md:grid-cols-2">
          {data.zones.map((zone) => (
            <Card key={zone.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{zone.name}</p>
                  <p className="text-xs text-ink-muted">
                    {zone.hasPolygon ? 'Con poligono' : 'Sin poligono (solo por distrito)'} ·
                    prioridad {zone.priority}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    zone.isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'bg-surface-muted text-ink-muted',
                  )}
                >
                  {zone.isActive ? 'Activa' : 'Apagada'}
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Input
                  label="Delivery"
                  type="number"
                  step="0.10"
                  value={zone.deliveryFee}
                  onChange={(e) => patchZone(zone.id, { deliveryFee: Number(e.target.value) })}
                />
                <Input
                  label="Pedido minimo"
                  type="number"
                  step="1"
                  value={zone.minimumOrder}
                  onChange={(e) => patchZone(zone.id, { minimumOrder: Number(e.target.value) })}
                />
                <Input
                  label="Minutos"
                  type="number"
                  value={zone.estimatedMinutes}
                  onChange={(e) =>
                    patchZone(zone.id, { estimatedMinutes: Number(e.target.value) })
                  }
                />
              </div>

              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" leftIcon={<Pencil className="size-3.5" />} onClick={() => openZoneEdit(zone)}>Editar mapa</Button>
                <Button
                  size="sm"
                  className="flex-1"
                  isLoading={busy === `zone-${zone.id}`}
                  onClick={() =>
                    run(
                      `zone-${zone.id}`,
                      () =>
                        commercialApi.updateZone(zone.id, {
                          deliveryFee: zone.deliveryFee,
                          minimumOrder: zone.minimumOrder,
                          estimatedMinutes: zone.estimatedMinutes,
                        }),
                      'Zona actualizada',
                    )
                  }
                >
                  Guardar
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void run(
                      `zone-toggle-${zone.id}`,
                      () => commercialApi.updateZone(zone.id, { isActive: !zone.isActive }),
                      zone.isActive ? 'Zona apagada' : 'Zona activada',
                    )
                  }
                >
                  {zone.isActive ? 'Apagar' : 'Activar'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------- Distritos ---------------- */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-ink">Distritos</h2>
        <CardDescription className="mb-3">
          Un distrito sin zona asignada no tiene cobertura: al cliente le decimos que todavia no
          llegamos.
        </CardDescription>

        <Card>
          <div className="flex flex-wrap gap-2">
            {data.districts.map((district) => {
              const covered = district.coverageZoneId !== null;

              return (
                <button
                  key={district.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void run(
                      `district-${district.id}`,
                      () =>
                        commercialApi.setDistrictZone(
                          district.id,
                          covered ? null : (data.zones[0]?.id ?? null),
                        ),
                      covered ? 'Distrito cerrado' : 'Distrito abierto',
                    )
                  }
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm transition-colors',
                    covered
                      ? 'border-brand-600 bg-brand-50 text-brand-700'
                      : 'border-line text-ink-muted hover:border-brand-300',
                  )}
                  title={covered ? 'Con cobertura (clic para cerrar)' : 'Sin cobertura (clic para abrir)'}
                >
                  <span>{district.name}</span>
                  {district.ubigeoCode && <span className="ml-1 opacity-60">{district.ubigeoCode}</span>}
                </button>
              );
            })}
          </div>
        </Card>
      </section>

      {/* ---------------- Sucursales ---------------- */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink">
          <Store className="size-5 text-brand-600" /> Cocinas, sucursales y horarios
        </h2>

        <div className="space-y-4">
          {data.branches.map((branch) => (
            <Card key={branch.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{branch.name}</p>
                  <p className="text-xs text-ink-muted">{branch.addressLine}</p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Preparacion ~{branch.prepMinutes} min ·{' '}
                    {branch.acceptsPickup ? 'acepta recojo' : 'sin recojo'} ·{' '}
                    {branch.acceptsDelivery ? 'acepta delivery' : 'sin delivery'}
                  </p>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<CalendarClock className="size-4" />}
                  isLoading={busy === `slots-${branch.id}`}
                  onClick={() =>
                    void run(
                      `slots-${branch.id}`,
                      async () => {
                        const result = await commercialApi.generateSlots({
                          branchId: branch.id,
                          days: 7,
                          capacity: 20,
                          cutoffHours: 2,
                          windows: [
                            { startHour: 12, endHour: 14 },
                            { startHour: 19, endHour: 21 },
                          ],
                        });
                        toast.success(`${result.created} franjas nuevas`);
                      },
                      'Franjas generadas',
                    )
                  }
                >
                  Generar franjas (7 dias)
                </Button>
              </div>

              <div className="mt-4 space-y-1.5">
                {branch.schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                  >
                    <span className="w-24 shrink-0 text-ink-muted">
                      {WEEKDAYS[schedule.weekday ?? 0]}
                    </span>

                    <input
                      type="time"
                      value={schedule.opensAt}
                      onChange={(e) =>
                        patchSchedule(branch.id, schedule.id, { opensAt: e.target.value })
                      }
                      className="h-9 rounded-lg border border-line px-2 text-sm outline-none focus:border-brand-500"
                    />
                    <span className="text-ink-muted">a</span>
                    <input
                      type="time"
                      value={schedule.closesAt}
                      onChange={(e) =>
                        patchSchedule(branch.id, schedule.id, { closesAt: e.target.value })
                      }
                      className="h-9 rounded-lg border border-line px-2 text-sm outline-none focus:border-brand-500"
                    />

                    <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-xs text-ink-muted">
                      <input
                        type="checkbox"
                        checked={schedule.isClosed}
                        onChange={(e) =>
                          patchSchedule(branch.id, schedule.id, { isClosed: e.target.checked })
                        }
                        className="size-4 accent-brand-600"
                      />
                      Cerrado
                    </label>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto"
                      isLoading={busy === `sch-${schedule.id}`}
                      onClick={() =>
                        run(
                          `sch-${schedule.id}`,
                          () =>
                            commercialApi.setSchedule(branch.id, {
                              weekday: schedule.weekday ?? 0,
                              opensAt: schedule.opensAt,
                              closesAt: schedule.closesAt,
                              isClosed: schedule.isClosed,
                            }),
                          'Horario guardado',
                        )
                      }
                    >
                      Guardar
                    </Button>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-end gap-2">
                <Input
                  label="Minutos de preparacion"
                  type="number"
                  value={branch.prepMinutes}
                  onChange={(e) =>
                    setData((current) =>
                      current
                        ? {
                            ...current,
                            branches: current.branches.map((entry) =>
                              entry.id === branch.id
                                ? { ...entry, prepMinutes: Number(e.target.value) }
                                : entry,
                            ),
                          }
                        : current,
                    )
                  }
                />
                <Button
                  size="sm"
                  isLoading={busy === `branch-${branch.id}`}
                  onClick={() =>
                    run(
                      `branch-${branch.id}`,
                      () =>
                        commercialApi.updateBranch(branch.id, { prepMinutes: branch.prepMinutes }),
                      'Sucursal actualizada',
                    )
                  }
                >
                  Guardar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Card className="border-dashed">
        <CardDescription>
          Cambiar el costo de delivery o el pedido minimo afecta a todos los pedidos nuevos. Los
          pedidos ya hechos conservan lo que se les cobro (snapshot).{' '}
          {data.zones[0] && (
            <>
              Hoy el delivery de {data.zones[0].name} cuesta{' '}
              {formatCurrency(data.zones[0].deliveryFee)}.
            </>
          )}
        </CardDescription>
      </Card>

      <Modal isOpen={setup === 'zone' || editingZoneId !== null} onClose={() => { setSetup(null); setEditingZoneId(null); }} title={editingZoneId !== null ? 'Editar zona de entrega' : 'Nueva zona de entrega'} description="Define sus reglas comerciales y dibuja el límite exacto antes de publicarlo." eyebrow="Configuración territorial" icon={MapPin} maxWidth="xl">
        <div>
          <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className="space-y-4">
              <FormSection title="Identidad de la zona" description="Usa un nombre reconocible para operaciones y soporte." icon={Navigation}>
                <Input label="Nombre" placeholder="Lima Norte" value={zoneForm.name} onChange={(event) => setZoneForm((form) => ({ ...form, name: event.target.value }))} />
                {setup === 'zone' && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted"><Save className="size-3.5" /> El borrador se guarda automáticamente en este dispositivo.</p>}
              </FormSection>
              <FormSection title="Tarifa y promesa" description="Estos valores se mostrarán al cliente antes de pagar." icon={CircleDollarSign}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <Input label="Costo de delivery" type="number" min="0" step="0.10" value={zoneForm.deliveryFee} onChange={(event) => setZoneForm((form) => ({ ...form, deliveryFee: event.target.value }))} />
                  <Input label="Pedido mínimo" type="number" min="0" value={zoneForm.minimumOrder} onChange={(event) => setZoneForm((form) => ({ ...form, minimumOrder: event.target.value }))} />
                  <Input className="sm:col-span-2 lg:col-span-1 xl:col-span-2" label="Tiempo estimado de reparto (min)" type="number" min="5" value={zoneForm.estimatedMinutes} onChange={(event) => setZoneForm((form) => ({ ...form, estimatedMinutes: event.target.value }))} />
                </div>
                {editingZoneId === null && (
                  <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-3">
                    <Input label="Publicar automáticamente (opcional)" type="datetime-local" value={publishAt} min={new Date().toISOString().slice(0, 16)} onChange={(event) => setPublishAt(event.target.value)} hint="Si eliges una fecha, guarda el borrador y el sistema lo publicará automáticamente." />
                  </div>
                )}
              </FormSection>
            </div>
            <FormSection title="Dibuja la cobertura" description="El polígono permite validar la ubicación exacta, además del distrito." icon={MapPin} tone="brand">
              <CoveragePolygonPicker value={zoneForm.polygon} onChange={(polygon) => setZoneForm((form) => ({ ...form, polygon }))} />
            </FormSection>
          </div>
          <FormActions>
            <Button variant="outline" disabled={busy === 'setup'} onClick={() => { setSetup(null); setEditingZoneId(null); }}>Cancelar</Button>
            {editingZoneId === null && <Button variant="outline" leftIcon={<Save className="size-4" />} isLoading={busy === 'draft'} onClick={() => void saveZoneDraft()}>{publishAt ? 'Programar publicación' : 'Guardar borrador'}</Button>}
            <Button isLoading={busy === 'setup'} onClick={createSetup}>{editingZoneId !== null ? 'Publicar cambios' : 'Publicar zona de entrega'}</Button>
          </FormActions>
        </div>
      </Modal>

      <Modal isOpen={setup === 'branch'} onClose={() => setSetup(null)} title="Nueva cocina o sucursal" description="Registra la dirección operativa, confirma el punto y configura sus datos básicos." eyebrow="Punto de operación" icon={Store} maxWidth="lg">
        <div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.9fr)]">
            <div className="space-y-4">
              <FormSection title="Datos de la cocina" description="Información visible para clientes, personal y repartidores." icon={Store}>
                <div className="space-y-4">
                  <Input label="Nombre comercial" placeholder="Verde Bowl San Isidro" value={branchForm.name} onChange={(event) => setBranchForm((form) => ({ ...form, name: event.target.value }))} />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input label="Teléfono (opcional)" value={branchForm.phone} onChange={(event) => setBranchForm((form) => ({ ...form, phone: event.target.value }))} />
                    <Input label="Preparación promedio" type="number" min="1" value={branchForm.prepMinutes} onChange={(event) => setBranchForm((form) => ({ ...form, prepMinutes: event.target.value }))} />
                  </div>
                </div>
              </FormSection>
              <FormSection title="Dirección operativa" description="Selecciona el distrito antes de escribir para obtener coincidencias relevantes." icon={Navigation}>
                <div className="space-y-4">
                  <Select id="branch-district" label="Distrito" value={branchForm.districtId} onChange={(event) => setBranchForm((form) => ({ ...form, districtId: event.target.value === '' ? '' : Number(event.target.value), latitude: null, longitude: null }))}>
                    <SelectOption value="">Selecciona el distrito</SelectOption>
                    {data.districts.map((district) => <SelectOption key={district.id} value={district.id}>{district.name}{district.ubigeoCode ? ` · ${district.ubigeoCode}` : ''}</SelectOption>)}
                  </Select>
                  <AddressAutocomplete
                    value={branchForm.addressLine}
                    onChange={(addressLine) => setBranchForm((form) => ({ ...form, addressLine, latitude: null, longitude: null }))}
                    onSelect={(suggestion) => setBranchForm((form) => ({
                      ...form,
                      addressLine: suggestion.line1,
                      districtId: suggestion.districtId ?? form.districtId,
                      latitude: suggestion.latitude,
                      longitude: suggestion.longitude,
                    }))}
                    cityId={data.cities[0]?.id ?? null}
                    cityName={data.cities[0]?.name}
                    districtId={branchForm.districtId === '' ? null : branchForm.districtId}
                    districtName={data.districts.find((district) => district.id === Number(branchForm.districtId))?.name}
                  />
                </div>
              </FormSection>
            </div>
            <FormSection title="Ubicación exacta" description="Confirma la entrada principal de la cocina." icon={MapPin} tone="brand" className="h-fit">
              <AddressMapPicker
                value={branchForm.latitude != null && branchForm.longitude != null ? { latitude: branchForm.latitude, longitude: branchForm.longitude } : null}
                cityId={data.cities[0]?.id ?? null}
                onChange={({ latitude, longitude }) => setBranchForm((form) => ({ ...form, latitude, longitude }))}
                onAddressResolved={(address) => setBranchForm((form) => ({
                  ...form,
                  addressLine: address.line1,
                  districtId: address.districtId ?? form.districtId,
                  latitude: address.latitude,
                  longitude: address.longitude,
                }))}
              />
            </FormSection>
          </div>
          <FormActions>
            <Button variant="outline" disabled={busy === 'setup'} onClick={() => setSetup(null)}>Cancelar</Button>
            <Button isLoading={busy === 'setup'} onClick={createSetup}>Crear cocina</Button>
          </FormActions>
        </div>
      </Modal>

      <Modal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title="Historial de cobertura" description="Cada publicación conserva los valores anteriores y permite restaurarlos." eyebrow="Versiones y auditoría" icon={History} maxWidth="lg">
        <div className="space-y-3">
          {history.length ? history.map((entry) => {
            const before = entry.beforeJson ?? {};
            const zoneId = Number(entry.entityId);
            const canRestore = Number.isFinite(zoneId) && Object.keys(before).length > 0;
            return (
              <article key={entry.id} className="rounded-2xl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-bold text-ink">{entry.action.replaceAll('.', ' ')}</p><p className="text-xs text-ink-muted">{new Date(entry.createdAt).toLocaleString('es-PE')}</p></div>
                  {canRestore && <Button size="sm" variant="outline" onClick={() => void run(`restore-${entry.id}`, async () => {
                    await commercialApi.updateZone(zoneId, {
                      ...(typeof before.name === 'string' ? { name: before.name } : {}),
                      ...(typeof before.deliveryFee === 'number' ? { deliveryFee: before.deliveryFee } : {}),
                      ...(typeof before.minimumOrder === 'number' ? { minimumOrder: before.minimumOrder } : {}),
                      ...(typeof before.estimatedMinutes === 'number' ? { estimatedMinutes: before.estimatedMinutes } : {}),
                      ...(typeof before.priority === 'number' ? { priority: before.priority } : {}),
                      ...(typeof before.isActive === 'boolean' ? { isActive: before.isActive } : {}),
                      ...(Array.isArray(before.polygon) ? { polygon: before.polygon as PolygonPoint[] } : {}),
                    });
                  }, 'Versión anterior restaurada')}>Restaurar versión</Button>}
                </div>
                <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-surface-muted p-3 text-[11px] text-ink-muted">{JSON.stringify({ antes: entry.beforeJson, después: entry.afterJson }, null, 2)}</pre>
              </article>
            );
          }) : <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-muted">Aún no hay publicaciones registradas.</p>}
        </div>
      </Modal>
    </div>
  );
};

export default AdminCoveragePage;
