import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CalendarClock,
  CircleDollarSign,
  Download,
  History,
  MapPin,
  Moon,
  Navigation,
  Pencil,
  Plus,
  Save,
  Search,
  Store,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card, CardDescription } from '@components/ui/Card';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { FormActions, FormSection } from '@components/ui/FormSection';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { LoadError } from '@components/common/LoadError';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { StatusBadge } from '@components/ui/StatusBadge';
import { AddressAutocomplete } from '@features/geo/components/AddressAutocomplete';
import { AddressMapPicker } from '@features/geo/components/AddressMapPicker';
import {
  PeruLocationSelector,
  type PeruLocationSelection,
  type PeruLocationValue,
} from '@features/geo/components/PeruLocationSelector';
import {
  CoveragePolygonPicker,
  type PolygonPoint,
} from '@features/geo/components/CoveragePolygonPicker';
import { CoverageOverviewMap } from '@features/geo/components/CoverageOverviewMap';
import type { AddressSuggestion } from '@features/geo/types';
import {
  commercialApi,
  type AdminBranch,
  type AdminSchedule,
  type AdminZone,
  type Coverage,
} from '../services/commercialAdmin.service';
import { adminApi } from '../services/admin.service';
import type { AuditLogRow } from '../types';
import {
  crossesMidnight,
  isEmptySchedule,
  mergeCoverage,
  pointInPolygon,
  polygonsOverlap,
  sameEdits,
  scheduleEdits,
  zoneEdits,
} from '../utils/coveragePage';

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const EMPTY_ZONE: {
  name: string;
  deliveryFee: string;
  cakeDeliveryFee: string;
  extraCoverageKm: string;
  extraFeePerKm: string;
  minimumOrder: string;
  estimatedMinutes: string;
  polygon: PolygonPoint[];
} = { name: '', deliveryFee: '6.90', cakeDeliveryFee: '0', extraCoverageKm: '0', extraFeePerKm: '0', minimumOrder: '0', estimatedMinutes: '35', polygon: [] };
const EMPTY_BRANCH: {
  name: string;
  addressLine: string;
  phone: string;
  prepMinutes: string;
  districtId: number | '';
  zoneId: number | '';
  zonePriority: string;
  latitude: number | null;
  longitude: number | null;
} = {
  name: '',
  addressLine: '',
  phone: '',
  prepMinutes: '20',
  districtId: '',
  zoneId: '',
  zonePriority: '1',
  latitude: null,
  longitude: null,
};
const LIMA_DEFAULT_LOCATION: PeruLocationValue = {
  departmentCode: '15',
  provinceCode: '1501',
  districtCode: '150101',
};
const EMPTY_GEOGRAPHY: PeruLocationSelection = { department: null, province: null, district: null };
const ZONE_DRAFT_KEY = 'verde-bowl:admin:coverage-zone-draft:v1';
const SERVER_ZONE_DRAFT_KEY = 'coverage-zone-new';
const NO_ZONE = 'none';

/**
 * Cobertura: sucursales, horarios, zonas y distritos.
 *
 * Lo que se toca aqui cambia lo que el cliente ve al validar su direccion:
 * el costo del delivery, el pedido minimo y si su distrito tiene cobertura.
 */
const AdminCoveragePage = () => {
  const confirm = useConfirm();
  const { can } = usePermissions();
  const canWrite = can(PERM.GEO_WRITE);

  const [data, setData] = useState<Coverage | null>(null);
  const serverData = useRef<Coverage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [setup, setSetup] = useState<'zone' | 'branch' | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<number | null>(null);
  const [zoneForm, setZoneForm] = useState(EMPTY_ZONE);
  const [branchForm, setBranchForm] = useState(EMPTY_BRANCH);
  const [branchLocation, setBranchLocation] = useState<PeruLocationValue>(LIMA_DEFAULT_LOCATION);
  const [branchGeography, setBranchGeography] = useState<PeruLocationSelection>(EMPTY_GEOGRAPHY);
  const [resolvedBranchAddress, setResolvedBranchAddress] = useState<AddressSuggestion | null>(
    null,
  );
  const [isResolvingBranchPin, setIsResolvingBranchPin] = useState(false);
  const [history, setHistory] = useState<AuditLogRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishAt, setPublishAt] = useState('');
  const [districtQuery, setDistrictQuery] = useState('');
  const [quoteForm, setQuoteForm] = useState({ zoneId: '', subtotal: '50', containsCake: false, extraDeliveryFee: '0', deliveryType: 'DELIVERY' as 'DELIVERY' | 'PICKUP' | 'DINE_IN' });
  const [quotePreview, setQuotePreview] = useState<Awaited<ReturnType<typeof commercialApi.previewCoverageQuote>> | null>(null);
  const [exceptionForms, setExceptionForms] = useState<Record<number, { date: string; opensAt: string; closesAt: string; isClosed: boolean }>>({});

  const branchOperationalDistrict = data?.districts.find(
    (district) => district.ubigeoCode === branchLocation.districtCode,
  );
  const branchCity = data?.cities.find((city) => city.id === branchOperationalDistrict?.cityId);
  const branchZones =
    data?.zones.filter(
      (zone) => branchOperationalDistrict && zone.cityId === branchOperationalDistrict.cityId,
    ) ?? [];
  const selectedBranchDepartment =
    branchGeography.department?.code === branchLocation.departmentCode
      ? branchGeography.department.name
      : undefined;
  const selectedBranchProvince =
    branchGeography.province?.code === branchLocation.provinceCode
      ? branchGeography.province.name
      : undefined;
  const selectedBranchDistrict =
    branchGeography.district?.code === branchLocation.districtCode
      ? branchGeography.district.name
      : undefined;
  const isBranchAddressSynchronized = Boolean(
    resolvedBranchAddress?.ubigeoCode &&
    resolvedBranchAddress.ubigeoCode === branchLocation.districtCode &&
    resolvedBranchAddress.latitude != null &&
    resolvedBranchAddress.longitude != null &&
    branchForm.latitude != null &&
    branchForm.longitude != null &&
    Math.abs(resolvedBranchAddress.latitude - branchForm.latitude) < 0.000001 &&
    Math.abs(resolvedBranchAddress.longitude - branchForm.longitude) < 0.000001,
  );
  const activeBranchDepartment = isBranchAddressSynchronized
    ? (resolvedBranchAddress?.region ?? selectedBranchDepartment)
    : selectedBranchDepartment;
  const activeBranchProvince = isBranchAddressSynchronized
    ? (resolvedBranchAddress?.province ?? selectedBranchProvince)
    : selectedBranchProvince;
  const activeBranchDistrict = isBranchAddressSynchronized
    ? (resolvedBranchAddress?.district ?? selectedBranchDistrict)
    : selectedBranchDistrict;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const fresh = await commercialApi.coverage();
      const previous = serverData.current;
      setData((current) => mergeCoverage(fresh, current, previous));
      serverData.current = fresh;
      adminApi
        .auditLogs('coverage_zones')
        .then(setHistory)
        .catch(() => setHistory([]));
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (setup !== 'zone' || editingZoneId !== null) return;
    const timer = window.setTimeout(
      () => localStorage.setItem(ZONE_DRAFT_KEY, JSON.stringify(zoneForm)),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [zoneForm, setup, editingZoneId]);

  const openZoneCreate = async () => {
    try {
      const serverDraft = await commercialApi.getDraft<typeof EMPTY_ZONE>(SERVER_ZONE_DRAFT_KEY);
      if (serverDraft) {
        setZoneForm({ ...EMPTY_ZONE, ...serverDraft.payload });
        setPublishAt(
          serverDraft.publishAt ? new Date(serverDraft.publishAt).toISOString().slice(0, 16) : '',
        );
        toast.success('Recuperamos el borrador compartido');
      } else {
        const draft = JSON.parse(localStorage.getItem(ZONE_DRAFT_KEY) ?? 'null') as
          typeof EMPTY_ZONE | null;
        setZoneForm({ ...EMPTY_ZONE, ...draft });
      }
    } catch {
      try {
        setZoneForm({ ...EMPTY_ZONE, ...JSON.parse(localStorage.getItem(ZONE_DRAFT_KEY) ?? 'null') });
      } catch {
        setZoneForm(EMPTY_ZONE);
      }
    }
    setEditingZoneId(null);
    setSetup('zone');
  };

  const openBranchCreate = () => {
    setBranchForm(EMPTY_BRANCH);
    setBranchLocation(LIMA_DEFAULT_LOCATION);
    setBranchGeography(EMPTY_GEOGRAPHY);
    setResolvedBranchAddress(null);
    setIsResolvingBranchPin(false);
    setSetup('branch');
  };

  /**
   * La zona elegida solo vale si es de la MISMA ciudad que el distrito operativo:
   * al mover el pin a otra ciudad hay que soltarla, porque de ella salen el costo
   * de delivery y el pedido minimo que vera el cliente.
   */
  const zoneForDistrict = (zoneId: number | '', districtId: number | ''): number | '' => {
    if (zoneId === '' || districtId === '') return '';
    const district = data?.districts.find((entry) => entry.id === districtId);
    const zone = data?.zones.find((entry) => entry.id === zoneId);
    return district && zone && zone.cityId === district.cityId ? zoneId : '';
  };

  const selectBranchLocation = (next: PeruLocationValue) => {
    setBranchLocation(next);
    setResolvedBranchAddress(null);
    setBranchForm((form) => {
      const districtId =
        data?.districts.find((district) => district.ubigeoCode === next.districtCode)?.id ?? '';
      return {
        ...form,
        addressLine: '',
        districtId,
        zoneId: zoneForDistrict(form.zoneId, districtId),
        latitude: null,
        longitude: null,
      };
    });
  };

  const applyResolvedBranchAddress = (address: AddressSuggestion) => {
    const resolvedUbigeo =
      address.ubigeoCode ??
      data?.districts.find((district) => district.id === address.districtId)?.ubigeoCode ??
      null;
    const district = resolvedUbigeo
      ? data?.districts.find((entry) => entry.ubigeoCode === resolvedUbigeo)
      : undefined;
    const synchronizedAddress =
      resolvedUbigeo === address.ubigeoCode ? address : { ...address, ubigeoCode: resolvedUbigeo };

    if (resolvedUbigeo) {
      setBranchLocation({
        departmentCode: resolvedUbigeo.slice(0, 2),
        provinceCode: resolvedUbigeo.slice(0, 4),
        districtCode: resolvedUbigeo,
      });
    } else {
      setBranchLocation((current) => ({ ...current, districtCode: '' }));
    }
    setResolvedBranchAddress(synchronizedAddress);
    setBranchForm((form) => ({
      ...form,
      addressLine: address.line1,
      districtId: district?.id ?? '',
      zoneId: zoneForDistrict(form.zoneId, district?.id ?? ''),
      latitude: address.latitude,
      longitude: address.longitude,
    }));
  };

  const saveZoneDraft = async () => {
    setBusy('draft');
    try {
      const cityId = data?.cities[0]?.id;
      if (!cityId) throw new Error('Primero debe existir una ciudad');
      const draftKey = editingZoneId === null ? SERVER_ZONE_DRAFT_KEY : `coverage-zone-${editingZoneId}`;
      const editingZone = editingZoneId === null ? null : data?.zones.find((zone) => zone.id === editingZoneId);
      await commercialApi.saveDraft(
        draftKey,
        'coverage-zone',
        {
          operation: editingZoneId === null ? 'CREATE' : 'UPDATE',
          zoneId: editingZoneId,
          expectedVersion: editingZone?.version,
          ...zoneForm,
          cityId,
          deliveryFee: Number(zoneForm.deliveryFee),
          cakeDeliveryFee: Number(zoneForm.cakeDeliveryFee),
          extraCoverageKm: Number(zoneForm.extraCoverageKm),
          extraFeePerKm: Number(zoneForm.extraFeePerKm),
          minimumOrder: Number(zoneForm.minimumOrder),
          estimatedMinutes: Number(zoneForm.estimatedMinutes),
          priority: (data?.zones.length ?? 0) + 1,
          effectiveFrom: publishAt ? new Date(publishAt).toISOString() : null,
        },
        publishAt ? new Date(publishAt).toISOString() : null,
      );
      toast.success(publishAt ? 'Publicación programada' : 'Borrador guardado en el servidor');
      if (publishAt) {
        setSetup(null);
        setEditingZoneId(null);
        setPublishAt('');
      }
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
      cakeDeliveryFee: String(zone.cakeDeliveryFee),
      extraCoverageKm: String(zone.extraCoverageKm),
      extraFeePerKm: String(zone.extraFeePerKm),
      minimumOrder: String(zone.minimumOrder),
      estimatedMinutes: String(zone.estimatedMinutes),
      polygon: zone.polygon ?? [],
    });
    setPublishAt('');
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
        if (publishAt) {
          const editingZone = editingZoneId === null ? null : data?.zones.find((zone) => zone.id === editingZoneId);
          await commercialApi.saveDraft(
            editingZoneId === null ? SERVER_ZONE_DRAFT_KEY : `coverage-zone-${editingZoneId}`,
            'coverage-zone',
            {
              operation: editingZoneId === null ? 'CREATE' : 'UPDATE',
              zoneId: editingZoneId,
              expectedVersion: editingZone?.version,
              cityId,
              name: zoneForm.name.trim(),
              deliveryFee: Number(zoneForm.deliveryFee),
              cakeDeliveryFee: Number(zoneForm.cakeDeliveryFee),
              extraCoverageKm: Number(zoneForm.extraCoverageKm),
              extraFeePerKm: Number(zoneForm.extraFeePerKm),
              minimumOrder: Number(zoneForm.minimumOrder),
              estimatedMinutes: Number(zoneForm.estimatedMinutes),
              priority: editingZone?.priority ?? (data?.zones.length ?? 0) + 1,
              polygon: zoneForm.polygon.length >= 3 ? zoneForm.polygon : undefined,
              effectiveFrom: new Date(publishAt).toISOString(),
            },
            new Date(publishAt).toISOString(),
          );
          setSetup(null);
          setEditingZoneId(null);
          setPublishAt('');
          toast.success('Publicacion programada');
          return;
        }
        if (editingZoneId !== null) {
          await commercialApi.updateZone(editingZoneId, {
            name: zoneForm.name.trim(),
            deliveryFee: Number(zoneForm.deliveryFee),
            cakeDeliveryFee: Number(zoneForm.cakeDeliveryFee),
            extraCoverageKm: Number(zoneForm.extraCoverageKm),
            extraFeePerKm: Number(zoneForm.extraFeePerKm),
            minimumOrder: Number(zoneForm.minimumOrder),
            estimatedMinutes: Number(zoneForm.estimatedMinutes),
            polygon: zoneForm.polygon.length >= 3 ? zoneForm.polygon : null,
            expectedVersion: data?.zones.find((zone) => zone.id === editingZoneId)?.version,
          });
        } else {
          await commercialApi.createZone({
            cityId,
            name: zoneForm.name.trim(),
            deliveryFee: Number(zoneForm.deliveryFee),
            cakeDeliveryFee: Number(zoneForm.cakeDeliveryFee),
            extraCoverageKm: Number(zoneForm.extraCoverageKm),
            extraFeePerKm: Number(zoneForm.extraFeePerKm),
            minimumOrder: Number(zoneForm.minimumOrder),
            estimatedMinutes: Number(zoneForm.estimatedMinutes),
            priority: (data?.zones.length ?? 0) + 1,
            polygon: zoneForm.polygon.length >= 3 ? zoneForm.polygon : undefined,
          });
        }
        setZoneForm(EMPTY_ZONE);
        localStorage.removeItem(ZONE_DRAFT_KEY);
        if (editingZoneId === null)
          await commercialApi.deleteDraft(SERVER_ZONE_DRAFT_KEY).catch(() => undefined);
        setPublishAt('');
        toast.success(
          editingZoneId !== null
            ? 'Zona actualizada y publicada'
            : 'Zona creada. Ahora abre los distritos que atenderá.',
        );
      }

      if (setup === 'branch') {
        if (branchForm.name.trim().length < 3 || branchForm.addressLine.trim().length < 5) {
          throw new Error('Completa el nombre y direccion de la cocina');
        }
        if (!branchOperationalDistrict) {
          throw new Error('El punto detectado no corresponde a un distrito operativo configurado.');
        }
        if (!isBranchAddressSynchronized || isResolvingBranchPin) {
          throw new Error('Confirma la dirección y su UBIGEO moviendo el pin en el mapa.');
        }
        /* Antes esto era `data.zones[0]`: la cocina se pegaba a la primera zona de
         * la lista, que podia ser de otra ciudad. De ella salen la tarifa y el
         * pedido minimo, asi que se elige a mano o no se crea. */
        if (branchForm.zoneId === '') {
          throw new Error('Elige la zona de entrega que atenderá esta cocina');
        }
        const branch = await commercialApi.createBranch({
          cityId: branchOperationalDistrict.cityId,
          name: branchForm.name.trim(),
          addressLine: branchForm.addressLine.trim(),
          districtId: branchOperationalDistrict.id,
          latitude: branchForm.latitude,
          longitude: branchForm.longitude,
          phone: branchForm.phone.trim() || undefined,
          prepMinutes: Number(branchForm.prepMinutes),
          acceptsPickup: true,
          acceptsDelivery: true,
        });
        await commercialApi.assignZoneToBranch(
          branchForm.zoneId,
          branch.id,
          Math.max(1, Number(branchForm.zonePriority) || 1),
        );
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

  if (isLoading) return <PageLoader />;

  if (!data) {
    return (
      <div>
        <PageHeader
          eyebrow="Operación territorial"
          title="Zonas y sucursales"
          description="Configura dónde operas, cuánto cobras y qué horarios acepta cada cocina."
          icon={MapPin}
        />
        <LoadError
          title="No pudimos cargar la cobertura"
          message={loadError ?? 'No recibimos la configuración territorial.'}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const overlapWarnings = data.zones.flatMap((zone, index) =>
    data.zones
      .slice(index + 1)
      .flatMap((other) =>
        zone.isActive &&
        other.isActive &&
        zone.polygon &&
        other.polygon &&
        polygonsOverlap(zone.polygon, other.polygon)
          ? [`${zone.name} se superpone con ${other.name}`]
          : [],
      ),
  );
  const branchWarnings = data.zones.flatMap((zone) =>
    zone.branchIds.flatMap((branchId) => {
      const branch = data.branches.find((entry) => entry.id === branchId);
      if (!zone.polygon || !branch || branch.latitude == null || branch.longitude == null)
        return [];
      return pointInPolygon({ lat: branch.latitude, lng: branch.longitude }, zone.polygon)
        ? []
        : [`${branch.name} está fuera del polígono de ${zone.name}`];
    }),
  );

  const patchZone = (zoneId: number, patch: Partial<Coverage['zones'][number]>) => {
    setData((current) =>
      current
        ? {
            ...current,
            zones: current.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)),
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

  const zoneIsDirty = (zone: AdminZone): boolean => {
    const server = serverData.current?.zones.find((entry) => entry.id === zone.id);
    return server ? !sameEdits(zoneEdits(zone), zoneEdits(server)) : false;
  };

  const scheduleIsDirty = (branchId: number, schedule: AdminSchedule): boolean => {
    const server = serverData.current?.branches
      .find((entry) => entry.id === branchId)
      ?.schedules.find((entry) => entry.id === schedule.id);
    return server ? !sameEdits(scheduleEdits(schedule), scheduleEdits(server)) : false;
  };

  const branchIsDirty = (branch: AdminBranch): boolean => {
    const server = serverData.current?.branches.find((entry) => entry.id === branch.id);
    return server ? server.prepMinutes !== branch.prepMinutes : false;
  };

  /**
   * Apagar una zona no es un interruptor cualquiera: se lleva por delante la
   * cobertura de todos los distritos colgados de ella, que es exactamente lo que
   * el cliente ve al validar su direccion.
   */
  const toggleZone = async (zone: AdminZone) => {
    if (zone.isActive) {
      const districts = data.districts.filter((entry) => entry.coverageZoneId === zone.id).length;
      const { confirmed } = await confirm({
        title: `Apagar ${zone.name}`,
        message:
          districts > 0
            ? `${districts} distrito${districts === 1 ? '' : 's'} dejará${districts === 1 ? '' : 'n'} de tener cobertura: a esos clientes les diremos que todavía no llegamos. Los pedidos ya hechos conservan lo que se les cobró.`
            : 'La zona dejará de usarse para calcular cobertura. Los pedidos ya hechos conservan lo que se les cobró.',
        confirmLabel: 'Apagar zona',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    await run(
      `zone-toggle-${zone.id}`,
      () => commercialApi.updateZone(zone.id, { isActive: !zone.isActive, expectedVersion: zone.version }),
      zone.isActive ? 'Zona apagada' : 'Zona activada',
    );
  };

  const archiveZone = async (zone: AdminZone) => {
    const { confirmed } = await confirm({
      title: `Archivar ${zone.name}`,
      message: 'La zona dejará de aparecer como operativa, conservará su historial y no podrá volver a activarse.',
      confirmLabel: 'Archivar zona',
      tone: 'danger',
    });
    if (!confirmed) return;
    await run(
      `zone-archive-${zone.id}`,
      () => commercialApi.archiveZone(zone.id, zone.version),
      'Zona archivada',
    );
  };

  /** Abrir o cerrar un distrito decide si el cliente tiene cobertura y a que precio. */
  const changeDistrictZone = async (
    district: Coverage['districts'][number],
    nextZoneId: string,
  ) => {
    const zoneId = nextZoneId === NO_ZONE ? null : Number(nextZoneId);
    if (zoneId === district.coverageZoneId) return;

    if (zoneId === null) {
      const { confirmed } = await confirm({
        title: `Cerrar ${district.name}`,
        message:
          'Los clientes de ese distrito dejarán de poder pedir: al validar su dirección les diremos que todavía no llegamos. Los pedidos ya hechos no se tocan.',
        confirmLabel: 'Cerrar distrito',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    await run(
      `district-${district.id}`,
      () => commercialApi.setDistrictZone(district.id, zoneId),
      zoneId === null ? 'Distrito cerrado' : 'Distrito actualizado',
    );
  };

  /**
   * Un horario con apertura y cierre iguales deja la cocina cerrada 24 h y el
   * servidor respondia 200 con "Horario guardado". El cruce de medianoche SI es
   * valido y el evaluador lo entiende, pero hay que decirlo antes de publicar.
   */
  const saveSchedule = (branchId: number, schedule: AdminSchedule) => {
    if (isEmptySchedule(schedule)) {
      toast.error('La apertura y el cierre no pueden ser la misma hora: la cocina quedaría cerrada todo el día');
      return;
    }

    void run(
      `sch-${schedule.id}`,
      () =>
        commercialApi.setSchedule(branchId, {
          weekday: schedule.weekday ?? 0,
          opensAt: schedule.opensAt,
          closesAt: schedule.closesAt,
          isClosed: schedule.isClosed,
        }),
      'Horario guardado',
    );
  };

  const runCoverageQuote = () => {
    if (!quoteForm.zoneId) {
      toast.error('Elige una zona para simular');
      return;
    }
    void run(
      'coverage-quote',
      async () => {
        const result = await commercialApi.previewCoverageQuote({
          zoneId: Number(quoteForm.zoneId),
          subtotal: Number(quoteForm.subtotal),
          containsCake: quoteForm.containsCake,
          extraDeliveryFee: Number(quoteForm.extraDeliveryFee),
          deliveryType: quoteForm.deliveryType,
        });
        setQuotePreview(result);
      },
      'Simulacion calculada',
    );
  };

  const saveException = (branchId: number) => {
    const form = exceptionForms[branchId] ?? { date: '', opensAt: '10:00', closesAt: '22:00', isClosed: false };
    if (!form.date) {
      toast.error('Elige la fecha de la excepcion');
      return;
    }
    void run(
      `exception-${branchId}`,
      () => commercialApi.setScheduleException(branchId, { exceptionDate: form.date, opensAt: form.opensAt, closesAt: form.closesAt, isClosed: form.isClosed }),
      'Excepcion guardada',
    );
  };

  const exportCoverage = () => {
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const districtRows = data.districts.map((district) => {
      const city = data.cities.find((entry) => entry.id === district.cityId);
      const zone = data.zones.find((entry) => entry.id === district.coverageZoneId);
      const branches = zone?.branchIds.map((id) => data.branches.find((branch) => branch.id === id)?.name).filter(Boolean).join(' | ') ?? '';
      return [city?.name, district.name, district.ubigeoCode, zone?.name ?? 'Sin cobertura', zone?.deliveryFee ?? '', zone?.minimumOrder ?? '', zone?.estimatedMinutes ?? '', branches];
    });
    const csv = [['Ciudad', 'Distrito', 'UBIGEO', 'Zona', 'Delivery', 'Mínimo', 'ETA (min)', 'Sucursales'], ...districtRows]
      .map((row) => row.map(quote).join(','))
      .join('\n');
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    anchor.download = `cobertura-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  return (
    <div className="grid gap-8">
      <PageHeader
        eyebrow="Operación territorial"
        title="Zonas y sucursales"
        description={
          canWrite
            ? 'Configura dónde operas, cuánto cobras y qué horarios acepta cada cocina.'
            : 'Consulta dónde operas, cuánto cobras y qué horarios acepta cada cocina.'
        }
        icon={MapPin}
        action={
          <>
            <Button
              variant="ghost"
              leftIcon={<History className="size-4" />}
              onClick={() => setHistoryOpen(true)}
            >
              Historial
            </Button>
            <Button variant="ghost" leftIcon={<Download className="size-4" />} onClick={exportCoverage}>
              Exportar matriz
            </Button>
            {canWrite && (
              <>
                <Button
                  variant="outline"
                  leftIcon={<Plus className="size-4" />}
                  onClick={() => void openZoneCreate()}
                >
                  Nueva zona
                </Button>
                <Button leftIcon={<Plus className="size-4" />} onClick={openBranchCreate}>
                  Nueva cocina
                </Button>
              </>
            )}
          </>
        }
      />

      {loadError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-800"
        >
          <span>No pudimos actualizar la cobertura: {loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ['Zonas activas', data.stats.activeZones],
          ['Sucursales activas', data.stats.activeBranches],
          ['Distritos cubiertos', data.stats.coveredDistricts],
          ['Distritos sin cobertura', data.stats.uncoveredDistricts],
          ['Conflictos de mapa', data.stats.overlappingZones],
          ['Sucursales con alertas', data.stats.branchesWithAttention],
        ].map(([label, value]) => (
          <Card key={String(label)} className="p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{label}</p>
            <p className="mt-1 text-2xl font-black text-ink">{value}</p>
          </Card>
        ))}
      </div>

      {data.drafts.length > 0 && (
        <Card className="border-accent-200 bg-accent-50/30">
          <p className="font-black text-ink">Cambios de cobertura pendientes</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {data.drafts.map((draft) => (
              <div key={draft.id} className="rounded-xl border border-line bg-white p-3 text-sm">
                <p className="font-semibold text-ink">{String(draft.payload.name ?? 'Zona sin nombre')}</p>
                <p className="mt-1 text-xs text-ink-muted">{draft.status === 'SCHEDULED' && draft.publishAt ? `Programado para ${formatDate(draft.publishAt)}` : 'Borrador pendiente de publicación'} · Actualizado {formatDate(draft.updatedAt)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="border-brand-200 bg-brand-50/40">
        <div className="flex items-start gap-3">
          <Calculator className="mt-1 size-5 shrink-0 text-brand-700" />
          <div className="min-w-0 flex-1">
            <p className="font-black text-ink">Simulador de tarifa</p>
            <p className="text-sm text-ink-muted">Valida el importe que verá el cliente antes de publicar cambios de cobertura.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-5">
              <Select
                id="coverage-quote-zone"
                label="Zona"
                size="small"
                value={quoteForm.zoneId}
                onChange={(event) => { setQuoteForm((current) => ({ ...current, zoneId: event.target.value })); setQuotePreview(null); }}
              >
                <SelectOption value="">Elige una zona</SelectOption>
                {data.zones.filter((zone) => zone.isActive && zone.status !== 'ARCHIVED').map((zone) => <SelectOption key={zone.id} value={String(zone.id)}>{zone.name}</SelectOption>)}
              </Select>
              <Input label="Subtotal (S/)" type="number" min="0" step="0.01" value={quoteForm.subtotal} onChange={(event) => setQuoteForm((current) => ({ ...current, subtotal: event.target.value }))} />
              <Input label="Recargo adicional (S/)" type="number" min="0" step="0.01" value={quoteForm.extraDeliveryFee} onChange={(event) => setQuoteForm((current) => ({ ...current, extraDeliveryFee: event.target.value }))} />
              <Select id="coverage-quote-type" label="Servicio" size="small" value={quoteForm.deliveryType} onChange={(event) => setQuoteForm((current) => ({ ...current, deliveryType: event.target.value as typeof current.deliveryType }))}>
                <SelectOption value="DELIVERY">Delivery</SelectOption><SelectOption value="PICKUP">Recojo</SelectOption><SelectOption value="DINE_IN">Consumo local</SelectOption>
              </Select>
              <div className="flex items-end gap-3">
                <label className="flex h-11 items-center gap-2 text-xs font-semibold text-ink-muted"><input type="checkbox" checked={quoteForm.containsCake} onChange={(event) => setQuoteForm((current) => ({ ...current, containsCake: event.target.checked }))} className="size-4 accent-brand-600" />Contiene torta</label>
                <Button size="sm" onClick={runCoverageQuote} isLoading={busy === 'coverage-quote'} disabled={busy !== null}>Calcular</Button>
              </div>
            </div>
            {quotePreview && (
              <div className="mt-4 grid gap-2 rounded-xl border border-brand-200 bg-white p-4 text-sm sm:grid-cols-3">
                <p>Delivery: <strong>{formatCurrency(quotePreview.deliveryFee)}</strong></p>
                <p>IGV incluido: <strong>{formatCurrency(quotePreview.taxTotal)}</strong></p>
                <p>ETA: <strong>{quotePreview.estimatedMinutes} min</strong></p>
                <p>Mínimo: <strong>{quotePreview.minimumOrder > 0 ? formatCurrency(quotePreview.minimumOrder) : 'Sin mínimo'}</strong></p>
                <p className={quotePreview.meetsMinimum ? 'text-brand-700' : 'text-red-700'}>{quotePreview.meetsMinimum ? 'Cumple el mínimo' : 'No cumple el mínimo'}</p>
                <p className="font-black text-brand-800">Total: {formatCurrency(quotePreview.total)}</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <CoverageOverviewMap zones={data.zones} branches={data.branches} />

      {(overlapWarnings.length > 0 || branchWarnings.length > 0) && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="flex items-center gap-2 font-black">
            <AlertTriangle className="size-5" /> Revisa la configuración territorial
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-xs">
            {[...overlapWarnings, ...branchWarnings].map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-ink">Zonas de entrega</h2>

        <div className="grid gap-4 md:grid-cols-2">
          {data.zones.map((zone) => {
            const dirty = zoneIsDirty(zone);

            return (
            <Card key={zone.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{zone.name}</p>
                  <p className="text-xs text-ink-muted">
                    {zone.hasPolygon ? 'Con poligono' : 'Sin poligono (solo por distrito)'} ·
                    prioridad {zone.priority} · {zone.districtCount} distrito(s)
                  </p>
                  <p className="mt-1 text-[11px] text-ink-muted">Últimos 30 días: {zone.last30DaysOrders} pedidos · {formatCurrency(zone.last30DaysDeliveryRevenue)} en delivery</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {dirty && <Badge variant="warning">Sin publicar</Badge>}
                  {zone.hasOverlap && <Badge variant="danger">Mapa en conflicto</Badge>}
                  <StatusBadge
                    status={zone.status}
                    map={{ ACTIVE: { label: 'Activa', variant: 'success' }, PAUSED: { label: 'Pausada', variant: 'warning' }, SCHEDULED: { label: 'Programada', variant: 'brand' }, ARCHIVED: { label: 'Archivada', variant: 'neutral' } }}
                  />
                </div>
              </div>

              {canWrite ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <Input
                    label="Delivery"
                    type="number"
                    step="0.10"
                    value={zone.deliveryFee}
                    onChange={(e) => patchZone(zone.id, { deliveryFee: Number(e.target.value) })}
                  />
                  <Input
                    label="Recargo por torta"
                    type="number"
                    min="0"
                    step="0.10"
                    hint="Se cobra una sola vez por pedido con tortas."
                    value={zone.cakeDeliveryFee}
                    onChange={(e) => patchZone(zone.id, { cakeDeliveryFee: Number(e.target.value) })}
                  />
                  <Input
                    label="Mínimo opcional (S/)"
                    type="number"
                    min="0"
                    step="0.01"
                    hint="0 = sin mínimo. Solo aplica a productos en delivery."
                    value={zone.minimumOrder}
                    onChange={(e) => patchZone(zone.id, { minimumOrder: Number(e.target.value) })}
                  />
                  <Input
                    label="Minutos"
                    type="number"
                    value={zone.estimatedMinutes}
                    onChange={(e) => patchZone(zone.id, { estimatedMinutes: Number(e.target.value) })}
                  />
                  <Input label="Límite adicional (km, 0 sin límite)" type="number" min="0" max="50" step="0.1" value={zone.extraCoverageKm} onChange={(e) => patchZone(zone.id, { extraCoverageKm: Number(e.target.value) })} />
                  <Input label="Recargo por km extra" type="number" min="0" step="0.1" value={zone.extraFeePerKm} onChange={(e) => patchZone(zone.id, { extraFeePerKm: Number(e.target.value) })} />
                </div>
              ) : (
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  {[
                    { label: 'Delivery', value: formatCurrency(zone.deliveryFee) },
                    { label: 'Recargo por torta', value: zone.cakeDeliveryFee > 0 ? formatCurrency(zone.cakeDeliveryFee) : 'Sin recargo' },
                    { label: 'Pedido mínimo', value: zone.minimumOrder > 0 ? formatCurrency(zone.minimumOrder) : 'Sin mínimo' },
                    { label: 'Reparto', value: `${zone.estimatedMinutes} min` },
                    { label: 'Fuera de zona', value: zone.extraFeePerKm > 0 ? `${zone.extraCoverageKm > 0 ? `${zone.extraCoverageKm} km` : 'Sin límite'} · ${formatCurrency(zone.extraFeePerKm)}/km` : 'Desactivada' },
                  ].map((item) => (
                    <div key={item.label}>
                      <dt className="text-xs text-ink-muted">{item.label}</dt>
                      <dd className="font-semibold text-ink">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {canWrite && (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Pencil className="size-3.5" />}
                  onClick={() => openZoneEdit(zone)}
                >
                  Editar mapa
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  disabled={!dirty || busy !== null}
                  isLoading={busy === `zone-${zone.id}`}
                  onClick={() =>
                    void run(
                      `zone-${zone.id}`,
                      () =>
                        commercialApi.updateZone(zone.id, {
                          deliveryFee: zone.deliveryFee,
                          cakeDeliveryFee: zone.cakeDeliveryFee,
                          extraCoverageKm: zone.extraCoverageKm,
                          extraFeePerKm: zone.extraFeePerKm,
                          minimumOrder: zone.minimumOrder,
                          estimatedMinutes: zone.estimatedMinutes,
                          expectedVersion: zone.version,
                        }),
                      'Zona actualizada',
                    )
                  }
                >
                  {dirty ? 'Guardar' : 'Guardado'}
                </Button>

                <Button
                  size="sm"
                  variant="ghost"
                  isLoading={busy === `zone-toggle-${zone.id}`}
                  disabled={busy !== null}
                  onClick={() => void toggleZone(zone)}
                >
                  {zone.isActive ? 'Apagar' : 'Activar'}
                </Button>
                {!zone.archivedAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-700"
                    isLoading={busy === `zone-archive-${zone.id}`}
                    disabled={busy !== null}
                    onClick={() => void archiveZone(zone)}
                  >
                    Archivar
                  </Button>
                )}
              </div>
              )}
            </Card>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="mb-1 text-lg font-semibold text-ink">Distritos</h2>
            <CardDescription>
          De la zona que elijas aquí salen el costo de delivery y el pedido mínimo del distrito. Sin
          zona no hay cobertura: al cliente le decimos que todavía no llegamos.
            </CardDescription>
          </div>
          <label className="flex min-h-11 w-full items-center gap-2 rounded-field border border-line bg-white px-3 shadow-e1 sm:w-72">
            <Search className="size-4 shrink-0 text-ink-muted" />
            <span className="sr-only">Buscar distrito</span>
            <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={districtQuery} onChange={(event) => setDistrictQuery(event.target.value)} placeholder="Buscar distrito o ubigeo" />
          </label>
        </div>

        {/* Agrupados por ciudad y con las zonas filtradas por `cityId`: el chip
            anterior pegaba el distrito a `zones[0]` sin preguntar, que podia ser
            una zona de OTRA ciudad con otra tarifa. */}
        <div className="mt-3 grid gap-3">
          {data.cities.map((city) => {
            const normalizedQuery = districtQuery.trim().toLocaleLowerCase('es');
            const allCityDistricts = data.districts.filter((entry) => entry.cityId === city.id);
            const cityDistricts = allCityDistricts.filter((entry) => !normalizedQuery || entry.name.toLocaleLowerCase('es').includes(normalizedQuery) || entry.ubigeoCode?.includes(normalizedQuery));
            if (cityDistricts.length === 0) return null;
            const cityZones = data.zones.filter((entry) => entry.cityId === city.id);
            const covered = allCityDistricts.filter((entry) => entry.coverageZoneId !== null).length;

            return (
              <Card key={city.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{city.name}</p>
                  <p className="text-xs text-ink-muted">
                    {covered} de {allCityDistricts.length} distritos con cobertura
                  </p>
                </div>

                {cityZones.length === 0 ? (
                  <p className="mt-3 rounded-card border border-dashed border-line p-4 text-sm text-ink-muted">
                    {city.name} todavía no tiene zonas de entrega. Crea una antes de abrir sus
                    distritos.
                  </p>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {cityDistricts.map((district) => {
                      const zone = data.zones.find((entry) => entry.id === district.coverageZoneId);

                      return (
                        <div key={district.id} className="rounded-card border border-line p-3">
                          <p className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium text-ink">{district.name}</span>
                            {district.ubigeoCode && (
                              <span className="text-xs text-ink-muted">{district.ubigeoCode}</span>
                            )}
                          </p>

                          {canWrite ? (
                            <Select
                              id={`district-zone-${district.id}`}
                              label="Zona de entrega"
                              size="small"
                              className="mt-2"
                              value={
                                district.coverageZoneId === null
                                  ? NO_ZONE
                                  : String(district.coverageZoneId)
                              }
                              disabled={busy !== null}
                              onChange={(event) =>
                                void changeDistrictZone(district, event.target.value)
                              }
                            >
                              <SelectOption value={NO_ZONE}>Sin cobertura</SelectOption>
                              {cityZones.map((entry) => (
                                <SelectOption key={entry.id} value={String(entry.id)}>
                                  {entry.name} · {formatCurrency(entry.deliveryFee)} ·{' '}
                                  {entry.minimumOrder > 0 ? `mín. ${formatCurrency(entry.minimumOrder)}` : 'Sin mínimo'}
                                </SelectOption>
                              ))}
                              {/* La zona asignada puede estar apagada o ser de otra
                                  ciudad por datos antiguos: sin esta opcion el
                                  desplegable se quedaria en blanco. */}
                              {zone && zone.cityId !== city.id && (
                                <SelectOption value={String(zone.id)}>
                                  {zone.name} (otra ciudad)
                                </SelectOption>
                              )}
                            </Select>
                          ) : (
                            <p className="mt-1 text-xs text-ink-muted">
                              {zone
                                ? `${zone.name} · ${formatCurrency(zone.deliveryFee)} · ${zone.minimumOrder > 0 ? `mín. ${formatCurrency(zone.minimumOrder)}` : 'Sin mínimo'}`
                                : 'Sin cobertura'}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
          {districtQuery.trim() && !data.districts.some((district) => district.name.toLocaleLowerCase('es').includes(districtQuery.trim().toLocaleLowerCase('es')) || district.ubigeoCode?.includes(districtQuery.trim())) && (
            <Card className="border-dashed py-8 text-center"><p className="text-sm font-semibold text-ink">No encontramos ese distrito</p><p className="mt-1 text-xs text-ink-muted">Prueba con otro nombre o código de ubigeo.</p></Card>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-ink">
          <Store className="size-5 text-brand-600" /> Cocinas, sucursales y horarios
        </h2>

        <div className="grid gap-4">
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
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={branch.health.status === 'READY' ? 'success' : 'warning'}>
                      {branch.health.status === 'READY' ? 'Operativa' : 'Revisar configuración'}
                    </Badge>
                    <span className="text-ink-muted">Franjas próximas: {branch.slotSummary.upcoming} · Disponibles: {branch.slotSummary.available}</span>
                  </div>
                  {branch.health.issues.length > 0 && <p className="mt-1 text-xs font-semibold text-amber-700">{branch.health.issues.join(' · ')}</p>}
                </div>

                {canWrite && (
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<CalendarClock className="size-4" />}
                  isLoading={busy === `slots-${branch.id}`}
                  disabled={busy !== null}
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
                )}
              </div>

              <div className="mt-4 grid gap-1.5">
                {branch.schedules.map((schedule) => {
                  const overnight = crossesMidnight(schedule);
                  const empty = isEmptySchedule(schedule);
                  const dirty = scheduleIsDirty(branch.id, schedule);
                  const isException = Boolean(schedule.exceptionDate);

                  return (
                  <div
                    key={schedule.id}
                    className="flex flex-wrap items-center gap-2 rounded-card border border-line px-3 py-2 text-sm"
                  >
                    <span className="w-24 shrink-0 text-ink-muted">
                      {schedule.exceptionDate ? `Excepción ${schedule.exceptionDate}` : WEEKDAYS[schedule.weekday ?? 0]}
                    </span>

                    <input
                      type="time"
                      aria-label={`Apertura del ${WEEKDAYS[schedule.weekday ?? 0]}`}
                      value={schedule.opensAt}
                      disabled={!canWrite || schedule.isClosed || isException}
                      onChange={(e) =>
                        patchSchedule(branch.id, schedule.id, { opensAt: e.target.value })
                      }
                      className="h-11 rounded-field border border-line px-2 text-sm outline-none focus:border-brand-500 disabled:bg-surface-muted disabled:text-ink-muted"
                    />
                    <span className="text-ink-muted">a</span>
                    <input
                      type="time"
                      aria-label={`Cierre del ${WEEKDAYS[schedule.weekday ?? 0]}`}
                      value={schedule.closesAt}
                      disabled={!canWrite || schedule.isClosed || isException}
                      onChange={(e) =>
                        patchSchedule(branch.id, schedule.id, { closesAt: e.target.value })
                      }
                      className={cn(
                        'h-11 rounded-field border px-2 text-sm outline-none focus:border-brand-500 disabled:bg-surface-muted disabled:text-ink-muted',
                        empty ? 'border-red-400' : 'border-line',
                      )}
                    />

                    <label className={cn('ml-2 flex items-center gap-1.5 text-xs text-ink-muted', canWrite && 'cursor-pointer')}>
                      <input
                        type="checkbox"
                        checked={schedule.isClosed}
                        disabled={!canWrite || isException}
                        onChange={(e) =>
                          patchSchedule(branch.id, schedule.id, { isClosed: e.target.checked })
                        }
                        className="size-4 accent-brand-600"
                      />
                      Cerrado
                    </label>

                    {/* Un cierre menor que la apertura NO es un error: el evaluador
                        lo entiende como cruce de medianoche. Pero hay que decirlo,
                        porque "10:00 a 02:00" tecleado por error deja abierta la
                        cocina 16 horas de mas. Iguales, en cambio, es franja vacia. */}
                    {overnight && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-brand-700">
                        <Moon className="size-3.5" /> cierra a las {schedule.closesAt} del día siguiente
                      </span>
                    )}
                    {empty && (
                      <span className="text-xs font-semibold text-red-700">
                        apertura y cierre iguales: quedaría cerrada las 24 h
                      </span>
                    )}

                    {canWrite && (
                      <span className="ml-auto flex items-center gap-2">
                        {dirty && <Badge variant="warning">Sin guardar</Badge>}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!dirty || empty || isException || busy !== null}
                          isLoading={busy === `sch-${schedule.id}`}
                          onClick={() => saveSchedule(branch.id, schedule)}
                        >
                          Guardar
                        </Button>
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>

              {canWrite && (() => {
                const exception = exceptionForms[branch.id] ?? { date: '', opensAt: '10:00', closesAt: '22:00', isClosed: false };
                const patchException = (patch: Partial<typeof exception>) => setExceptionForms((current) => ({ ...current, [branch.id]: { ...exception, ...patch } }));
                return (
                  <div className="mt-4 rounded-xl border border-dashed border-line bg-surface-muted/40 p-3">
                    <p className="text-xs font-black uppercase tracking-wide text-ink-muted">Feriado o cierre especial</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      <Input label="Fecha" type="date" value={exception.date} onChange={(event) => patchException({ date: event.target.value })} />
                      <Input label="Apertura" type="time" value={exception.opensAt} disabled={exception.isClosed} onChange={(event) => patchException({ opensAt: event.target.value })} />
                      <Input label="Cierre" type="time" value={exception.closesAt} disabled={exception.isClosed} onChange={(event) => patchException({ closesAt: event.target.value })} />
                      <div className="flex items-end gap-3">
                        <label className="flex h-11 items-center gap-2 text-xs font-semibold text-ink-muted"><input type="checkbox" checked={exception.isClosed} onChange={(event) => patchException({ isClosed: event.target.checked })} className="size-4 accent-brand-600" />Cerrado</label>
                        <Button size="sm" variant="outline" isLoading={busy === `exception-${branch.id}`} disabled={busy !== null} onClick={() => saveException(branch.id)}>Guardar</Button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {canWrite && (
              <div className="mt-3 flex items-end gap-2">
                <Input
                  label="Minutos de preparacion"
                  type="number"
                  min="1"
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
                  disabled={!branchIsDirty(branch) || busy !== null}
                  isLoading={busy === `branch-${branch.id}`}
                  onClick={() =>
                    void run(
                      `branch-${branch.id}`,
                      () =>
                        commercialApi.updateBranch(branch.id, { prepMinutes: branch.prepMinutes, expectedVersion: branch.version }),
                      'Sucursal actualizada',
                    )
                  }
                >
                  {branchIsDirty(branch) ? 'Guardar' : 'Guardado'}
                </Button>
              </div>
              )}
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

      <Modal
        isOpen={setup === 'zone' || editingZoneId !== null}
        onClose={() => {
          setSetup(null);
          setEditingZoneId(null);
        }}
        title={editingZoneId !== null ? 'Editar zona de entrega' : 'Nueva zona de entrega'}
        description="Define sus reglas comerciales y dibuja el límite exacto antes de publicarlo."
        eyebrow="Configuración territorial"
        icon={MapPin}
        maxWidth="xl"
        disableBackdropClose
      >
        <div>
          <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
            <div className="grid gap-4">
              <FormSection
                title="Identidad de la zona"
                description="Usa un nombre reconocible para operaciones y soporte."
                icon={Navigation}
              >
                <Input
                  label="Nombre"
                  placeholder="Lima Norte"
                  value={zoneForm.name}
                  onChange={(event) =>
                    setZoneForm((form) => ({ ...form, name: event.target.value }))
                  }
                />
                {setup === 'zone' && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-muted">
                    <Save className="size-3.5" /> El borrador se guarda automáticamente en este
                    dispositivo.
                  </p>
                )}
              </FormSection>
              <FormSection
                title="Tarifa y promesa"
                description="Estos valores se mostrarán al cliente antes de pagar."
                icon={CircleDollarSign}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <Input
                    label="Costo de delivery"
                    type="number"
                    min="0"
                    step="0.10"
                    value={zoneForm.deliveryFee}
                    onChange={(event) =>
                      setZoneForm((form) => ({ ...form, deliveryFee: event.target.value }))
                    }
                  />
                  <Input
                    label="Recargo por torta"
                    type="number"
                    min="0"
                    step="0.10"
                    value={zoneForm.cakeDeliveryFee}
                    onChange={(event) =>
                      setZoneForm((form) => ({ ...form, cakeDeliveryFee: event.target.value }))
                    }
                    hint="Se suma una sola vez cuando el pedido contiene tortas."
                  />
                  <Input label="Límite fuera del mapa (km)" type="number" min="0" max="50" step="0.1" value={zoneForm.extraCoverageKm} onChange={(event) => setZoneForm((form) => ({ ...form, extraCoverageKm: event.target.value }))} hint="Distancia en línea recta desde el borde. 0 permite cotizar sin límite si hay tarifa." />
                  <Input label="Recargo por km fuera del mapa" type="number" min="0" step="0.10" value={zoneForm.extraFeePerKm} onChange={(event) => setZoneForm((form) => ({ ...form, extraFeePerKm: event.target.value }))} hint="Se suma al costo base de delivery." />
                  <Input
                    label="Mínimo opcional (S/)"
                    type="number"
                    min="0"
                    step="0.01"
                    hint="0 = sin mínimo. Un monto mayor exige ese subtotal de productos solo en delivery."
                    value={zoneForm.minimumOrder}
                    onChange={(event) =>
                      setZoneForm((form) => ({ ...form, minimumOrder: event.target.value }))
                    }
                  />
                  <Input
                    className="sm:col-span-2 lg:col-span-1 xl:col-span-2"
                    label="Tiempo estimado de reparto (min)"
                    type="number"
                    min="5"
                    value={zoneForm.estimatedMinutes}
                    onChange={(event) =>
                      setZoneForm((form) => ({ ...form, estimatedMinutes: event.target.value }))
                    }
                  />
                </div>
                {(
                  <div className="mt-4 rounded-2xl border border-brand-100 bg-brand-50/60 p-3">
                    <Input
                      label="Publicar automáticamente (opcional)"
                      type="datetime-local"
                      value={publishAt}
                      min={new Date().toISOString().slice(0, 16)}
                      onChange={(event) => setPublishAt(event.target.value)}
                      hint="Si eliges una fecha, guarda el borrador y el sistema lo publicará automáticamente."
                    />
                  </div>
                )}
              </FormSection>
            </div>
            <FormSection
              title="Dibuja la cobertura"
              description="El polígono permite validar la ubicación exacta, además del distrito."
              icon={MapPin}
              tone="brand"
            >
              <CoveragePolygonPicker
                value={zoneForm.polygon}
                onChange={(polygon) => setZoneForm((form) => ({ ...form, polygon }))}
              />
            </FormSection>
          </div>
          <FormActions>
            <Button
              variant="outline"
              disabled={busy === 'setup'}
              onClick={() => {
                setSetup(null);
                setEditingZoneId(null);
              }}
            >
              Cancelar
            </Button>
            {editingZoneId === null && (
              <Button
                variant="outline"
                leftIcon={<Save className="size-4" />}
                isLoading={busy === 'draft'}
                onClick={() => void saveZoneDraft()}
              >
                {publishAt ? 'Programar publicación' : 'Guardar borrador'}
              </Button>
            )}
            <Button isLoading={busy === 'setup'} onClick={createSetup}>
              {editingZoneId !== null ? 'Publicar cambios' : 'Publicar zona de entrega'}
            </Button>
          </FormActions>
        </div>
      </Modal>

      <Modal
        isOpen={setup === 'branch'}
        onClose={() => setSetup(null)}
        title="Nueva cocina o sucursal"
        description="Registra la dirección operativa, confirma el punto y configura sus datos básicos."
        eyebrow="Punto de operación"
        icon={Store}
        maxWidth="lg"
        disableBackdropClose
      >
        <div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.9fr)]">
            <div className="grid gap-4">
              <FormSection
                title="Datos de la cocina"
                description="Información visible para clientes, personal y repartidores."
                icon={Store}
              >
                <div className="grid gap-4">
                  <Input
                    label="Nombre comercial"
                    placeholder="Misky Challay San Isidro"
                    value={branchForm.name}
                    onChange={(event) =>
                      setBranchForm((form) => ({ ...form, name: event.target.value }))
                    }
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Teléfono (opcional)"
                      value={branchForm.phone}
                      onChange={(event) =>
                        setBranchForm((form) => ({ ...form, phone: event.target.value }))
                      }
                    />
                    <Input
                      label="Preparación promedio"
                      type="number"
                      min="1"
                      value={branchForm.prepMinutes}
                      onChange={(event) =>
                        setBranchForm((form) => ({ ...form, prepMinutes: event.target.value }))
                      }
                    />
                  </div>
                </div>
              </FormSection>
              <FormSection
                title="Dirección operativa"
                description="Elige una zona para buscar; el pin confirmará el UBIGEO definitivo de la cocina."
                icon={Navigation}
              >
                <div className="grid gap-4">
                  <PeruLocationSelector
                    value={branchLocation}
                    onChange={selectBranchLocation}
                    onSelectionChange={setBranchGeography}
                    disabled={isResolvingBranchPin}
                  />
                  <p className="flex items-start gap-2 rounded-card bg-surface-muted px-3 py-2.5 text-xs leading-5 text-ink-muted">
                    <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-700" />
                    La selección administrativa es el contexto de búsqueda. Si mueves el pin, el
                    departamento, provincia y distrito se actualizarán con la ubicación detectada.
                  </p>
                  <AddressAutocomplete
                    value={branchForm.addressLine}
                    onChange={(addressLine) => {
                      setResolvedBranchAddress(null);
                      setBranchForm((form) => ({
                        ...form,
                        addressLine,
                        latitude: null,
                        longitude: null,
                      }));
                    }}
                    onSelect={applyResolvedBranchAddress}
                    cityId={branchOperationalDistrict?.cityId ?? null}
                    cityName={branchCity?.name ?? activeBranchProvince}
                    districtId={branchOperationalDistrict?.id}
                    districtName={activeBranchDistrict}
                    departmentName={activeBranchDepartment}
                    provinceName={activeBranchProvince}
                    ubigeoCode={branchLocation.districtCode}
                    disabled={isResolvingBranchPin}
                  />

                  {/* Zona OBLIGATORIA y filtrada por la ciudad del distrito operativo:
                      de ella salen el costo de delivery y el pedido minimo de esta
                      cocina. Antes se asignaba `zones[0]` en silencio. */}
                  <Select
                    id="branch-zone"
                    label="Zona de entrega que atenderá"
                    value={branchForm.zoneId === '' ? '' : String(branchForm.zoneId)}
                    disabled={!branchOperationalDistrict || isResolvingBranchPin}
                    onChange={(event) =>
                      setBranchForm((form) => ({
                        ...form,
                        zoneId: event.target.value ? Number(event.target.value) : '',
                      }))
                    }
                    hint={
                      !branchOperationalDistrict
                        ? 'Confirma primero el distrito operativo en el mapa.'
                        : branchZones.length === 0
                          ? `No hay zonas de entrega en ${branchCity?.name ?? 'esta ciudad'}: crea una antes de la cocina.`
                          : 'Define el costo de delivery y el pedido mínimo de esta cocina.'
                    }
                  >
                    <SelectOption value="" disabled>
                      Elige la zona
                    </SelectOption>
                    {branchZones.map((zone) => (
                      <SelectOption key={zone.id} value={String(zone.id)}>
                        {zone.name} · {formatCurrency(zone.deliveryFee)} ·{' '}
                        {zone.minimumOrder > 0 ? `mín. ${formatCurrency(zone.minimumOrder)}` : 'Sin mínimo'}
                      </SelectOption>
                    ))}
                  </Select>
                  <Input
                    label="Prioridad de esta cocina en la zona"
                    type="number"
                    min="1"
                    step="1"
                    value={branchForm.zonePriority}
                    onChange={(event) =>
                      setBranchForm((form) => ({ ...form, zonePriority: event.target.value }))
                    }
                    hint="1 es la preferida; la ruta, el horario y la saturación también influyen."
                  />
                </div>
              </FormSection>
            </div>
            <FormSection
              title="Ubicación exacta"
              description="Confirma la entrada principal de la cocina."
              icon={MapPin}
              tone="brand"
              className="h-fit"
            >
              <AddressMapPicker
                value={
                  branchForm.latitude != null && branchForm.longitude != null
                    ? { latitude: branchForm.latitude, longitude: branchForm.longitude }
                    : null
                }
                cityId={branchOperationalDistrict?.cityId ?? null}
                cityName={branchCity?.name ?? activeBranchProvince}
                departmentName={activeBranchDepartment}
                provinceName={activeBranchProvince}
                districtId={branchOperationalDistrict?.id}
                districtName={activeBranchDistrict}
                districtCenter={
                  !isBranchAddressSynchronized &&
                  branchGeography.district?.code === branchLocation.districtCode
                    ? {
                        latitude: branchGeography.district.latitude,
                        longitude: branchGeography.district.longitude,
                      }
                    : null
                }
                address={resolvedBranchAddress}
                onChange={({ latitude, longitude }) => {
                  setResolvedBranchAddress(null);
                  setBranchForm((form) => ({ ...form, latitude, longitude }));
                }}
                onAddressResolved={applyResolvedBranchAddress}
                onAddressResolutionFailed={() => {
                  setBranchForm((form) => ({
                    ...form,
                    latitude: resolvedBranchAddress?.latitude ?? null,
                    longitude: resolvedBranchAddress?.longitude ?? null,
                  }));
                }}
                onResolvingChange={setIsResolvingBranchPin}
              />
              {isBranchAddressSynchronized && branchOperationalDistrict && (
                <p
                  role="status"
                  className="mt-3 flex items-center gap-2 rounded-card border border-brand-200 bg-white px-3 py-2.5 text-xs font-bold text-brand-800"
                >
                  <MapPin className="size-4" /> UBIGEO {branchLocation.districtCode} confirmado
                </p>
              )}
              {isBranchAddressSynchronized && !branchOperationalDistrict && (
                <p
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800"
                >
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> UBIGEO{' '}
                  {branchLocation.districtCode} detectado: el punto está fuera de los distritos
                  operativos configurados.
                </p>
              )}
            </FormSection>
          </div>
          <FormActions>
            <Button variant="outline" disabled={busy === 'setup'} onClick={() => setSetup(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !isBranchAddressSynchronized
                || !branchOperationalDistrict
                || isResolvingBranchPin
                || branchForm.zoneId === ''
              }
              isLoading={busy === 'setup'}
              onClick={createSetup}
            >
              Crear cocina
            </Button>
          </FormActions>
        </div>
      </Modal>

      <Modal
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Historial de cobertura"
        description="Cada publicación conserva los valores anteriores y permite restaurarlos."
        eyebrow="Versiones y auditoría"
        icon={History}
        maxWidth="lg"
      >
        <div className="grid gap-3">
          {history.length ? (
            history.map((entry) => {
              const before = entry.beforeJson ?? {};
              const zoneId = Number(entry.entityId);
              const canRestore =
                canWrite && Number.isFinite(zoneId) && Object.keys(before).length > 0;
              return (
                <article key={entry.id} className="rounded-2xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-ink">{entry.action.replaceAll('.', ' ')}</p>
                      <p className="text-xs text-ink-muted">{formatDate(entry.createdAt)}</p>
                    </div>
                    {canRestore && (
                      <Button
                        size="sm"
                        variant="outline"
                        isLoading={busy === `restore-${entry.id}`}
                        disabled={busy !== null}
                        onClick={() =>
                          void run(
                            `restore-${entry.id}`,
                            async () => {
                              await commercialApi.updateZone(zoneId, {
                                ...(typeof before.name === 'string' ? { name: before.name } : {}),
                                ...(typeof before.deliveryFee === 'number'
                                  ? { deliveryFee: before.deliveryFee }
                                  : {}),
                                ...(typeof before.cakeDeliveryFee === 'number'
                                  ? { cakeDeliveryFee: before.cakeDeliveryFee }
                                  : {}),
                                ...(typeof before.extraCoverageKm === 'number' ? { extraCoverageKm: before.extraCoverageKm } : {}),
                                ...(typeof before.extraFeePerKm === 'number' ? { extraFeePerKm: before.extraFeePerKm } : {}),
                                ...(typeof before.minimumOrder === 'number'
                                  ? { minimumOrder: before.minimumOrder }
                                  : {}),
                                ...(typeof before.estimatedMinutes === 'number'
                                  ? { estimatedMinutes: before.estimatedMinutes }
                                  : {}),
                                ...(typeof before.priority === 'number'
                                  ? { priority: before.priority }
                                  : {}),
                                ...(typeof before.isActive === 'boolean'
                                  ? { isActive: before.isActive }
                                  : {}),
                                ...(Array.isArray(before.polygon)
                                  ? { polygon: before.polygon as PolygonPoint[] }
                                  : {}),
                              });
                            },
                            'Versión anterior restaurada',
                          )
                        }
                      >
                        Restaurar versión
                      </Button>
                    )}
                  </div>
                  <pre className="mt-3 max-h-40 overflow-auto rounded-xl bg-surface-muted p-3 text-[11px] text-ink-muted">
                    {JSON.stringify({ antes: entry.beforeJson, después: entry.afterJson }, null, 2)}
                  </pre>
                </article>
              );
            })
          ) : (
            <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-muted">
              Aún no hay publicaciones registradas.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default AdminCoveragePage;
