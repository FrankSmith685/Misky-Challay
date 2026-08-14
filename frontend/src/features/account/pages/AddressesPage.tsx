import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Home,
  Info,
  LocateFixed,
  MapPin,
  Navigation,
  PackageCheck,
  Pencil,
  Plus,
  Star,
  Trash2,
  Truck,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { Checkbox } from '@components/ui/Checkbox';
import { FormActions, FormSection, FormStack } from '@components/ui/FormSection';
import { Card } from '@components/ui/Card';
import { Skeleton } from '@components/ui/Skeleton';
import { getApiErrorMessage } from '@services/api/client';
import { useAppState } from '@context/AppStateContext';
import { cn } from '@lib/cn';
import { geoApi } from '@features/geo/services/geo.service';
import { AddressMapPicker } from '@features/geo/components/AddressMapPicker';
import { AddressAutocomplete } from '@features/geo/components/AddressAutocomplete';
import {
  PeruLocationSelector,
  type PeruLocationSelection,
  type PeruLocationValue,
} from '@features/geo/components/PeruLocationSelector';
import type { Address, AddressSuggestion, CoverageResult, District } from '@features/geo/types';
import { accountApi, type AddressInput } from '../services/account.service';
import { AccountLoadError } from '../components/AccountSectionCard';
import { AddressCoveragePreview } from '../components/AddressCoveragePreview';

const EMPTY: AddressInput = {
  label: 'Casa',
  line1: '',
  reference: '',
  districtId: null,
  latitude: null,
  longitude: null,
  isDefault: false,
};

const LIMA_DEFAULT_LOCATION: PeruLocationValue = {
  departmentCode: '15',
  provinceCode: '1501',
  districtCode: '150101',
};

const EMPTY_GEOGRAPHY: PeruLocationSelection = {
  department: null,
  province: null,
  district: null,
};

const addressZoneLabel = (address: Address) => {
  const names = [
    address.districtName ?? address.district?.name,
    address.provinceName,
    address.departmentName,
  ]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index);
  const ubigeo = address.ubigeoCode ?? address.district?.ubigeoCode;
  return [...names, ubigeo ? `UBIGEO ${ubigeo}` : ''].filter(Boolean).join(' · ');
};

const AddressesPage = () => {
  const { address: activeAddress, selectDelivery, selectPickup, setAddress, setBranch } = useAppState();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [operationalDistricts, setOperationalDistricts] = useState<District[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGeoLoading, setIsGeoLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [deliveringId, setDeliveringId] = useState<number | null>(null);
  const [coverageIssue, setCoverageIssue] = useState<{ id: number; reason: string } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AddressInput>(EMPTY);
  const [location, setLocation] = useState<PeruLocationValue>(LIMA_DEFAULT_LOCATION);
  const [geography, setGeography] = useState<PeruLocationSelection>(EMPTY_GEOGRAPHY);
  const [resolvedLocation, setResolvedLocation] = useState<AddressSuggestion | null>(null);
  const [isResolvingPin, setIsResolvingPin] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingCoverage, setIsCheckingCoverage] = useState(false);
  const [coveragePreview, setCoveragePreview] = useState<{
    signature: string;
    result: CoverageResult;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Address | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    line1?: string;
    districtId?: string;
    position?: string;
  }>({});

  const load = useCallback(async () => {
    try {
      setAddresses(await accountApi.listAddresses());
      setLoadError(null);
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    geoApi
      .getCities()
      .then(async (rows) => {
        const groups = await Promise.all(
          rows.map((city) => geoApi.getDistricts(city.id).catch(() => [])),
        );
        setOperationalDistricts(groups.flat());
      })
      .catch(() => setOperationalDistricts([]))
      .finally(() => setIsGeoLoading(false));
  }, [load, retryNonce]);

  const retryLoad = () => {
    setIsLoading(true);
    setIsGeoLoading(true);
    setRetryNonce((value) => value + 1);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY);
    setLocation(LIMA_DEFAULT_LOCATION);
    setGeography(EMPTY_GEOGRAPHY);
    setResolvedLocation(null);
    setIsResolvingPin(false);
    setCoveragePreview(null);
    setIsCheckingCoverage(false);
    setFormErrors({});
    setModalOpen(true);
  };

  const openEdit = (address: Address) => {
    setEditingId(address.id);
    setFormErrors({});
    setForm({
      label: address.label,
      line1: address.line1,
      reference: address.reference ?? '',
      districtId: address.districtId,
      latitude: address.latitude === null ? null : Number(address.latitude),
      longitude: address.longitude === null ? null : Number(address.longitude),
      isDefault: address.isDefault,
    });
    const ubigeoCode = address.ubigeoCode ?? address.district?.ubigeoCode ?? '';
    setLocation(
      ubigeoCode
        ? {
            departmentCode: ubigeoCode.slice(0, 2),
            provinceCode: ubigeoCode.slice(0, 4),
            districtCode: ubigeoCode,
          }
        : LIMA_DEFAULT_LOCATION,
    );
    setGeography(EMPTY_GEOGRAPHY);
    setResolvedLocation(
      address.latitude !== null && address.longitude !== null && ubigeoCode
        ? {
            id: `saved-${address.id}`,
            label: address.line1,
            line1: address.line1,
            district: address.districtName ?? address.district?.name ?? null,
            districtId: address.districtId,
            ubigeoCode,
            city: address.provinceName,
            province: address.provinceName,
            region: address.departmentName,
            latitude: Number(address.latitude),
            longitude: Number(address.longitude),
            source: 'context',
            precision: 'manual',
          }
        : null,
    );
    setIsResolvingPin(false);
    setCoveragePreview(null);
    setIsCheckingCoverage(false);
    setModalOpen(true);
  };

  const applyToPurchaseContext = async (saved: Address) => {
    const coverage = await geoApi.checkCoverage({
      districtId: saved.districtId ?? undefined,
      latitude: saved.latitude == null ? undefined : Number(saved.latitude),
      longitude: saved.longitude == null ? undefined : Number(saved.longitude),
    });
    if (!coverage.covered || !coverage.branch) {
      throw new Error(coverage.reason ?? 'Esta dirección está fuera de nuestras zonas de reparto.');
    }
    selectDelivery(
      {
        id: saved.id,
        label: saved.label,
        line1: saved.line1,
        reference: saved.reference ?? undefined,
        districtId: saved.districtId ?? undefined,
        latitude: saved.latitude == null ? undefined : Number(saved.latitude),
        longitude: saved.longitude == null ? undefined : Number(saved.longitude),
      },
      coverage.branch.id,
    );
  };

  const clearPurchaseContext = () => {
    setAddress(null);
    setBranch(null);
  };

  const deliverHere = async (saved: Address) => {
    setDeliveringId(saved.id);
    setCoverageIssue(null);
    try {
      await applyToPurchaseContext(saved);
      toast.success(`Entregaremos en ${saved.label}`);
    } catch (error) {
      setCoverageIssue({
        id: saved.id,
        reason: error instanceof Error ? error.message : getApiErrorMessage(error),
      });
    } finally {
      setDeliveringId(null);
    }
  };

  const refreshPurchaseContext = async (saved: Address) => {
    try {
      await applyToPurchaseContext(saved);
    } catch (error) {
      clearPurchaseContext();
      const reason = error instanceof Error ? error.message : getApiErrorMessage(error);
      toast.error(`${reason} Elige otra dirección para continuar tu compra.`);
    }
  };

  const handleSave = async () => {
    const district = operationalDistricts.find(
      (entry) => entry.ubigeoCode === location.districtCode,
    );
    const synchronized = Boolean(
      resolvedLocation?.ubigeoCode &&
      resolvedLocation.ubigeoCode === location.districtCode &&
      resolvedLocation.latitude != null &&
      resolvedLocation.longitude != null &&
      form.latitude != null &&
      form.longitude != null &&
      Math.abs(resolvedLocation.latitude - form.latitude) < 0.000001 &&
      Math.abs(resolvedLocation.longitude - form.longitude) < 0.000001,
    );
    const errors = {
      ...(form.line1.trim().length < 5
        ? { line1: 'Ingresa calle, número y selecciona una sugerencia.' }
        : {}),
      ...(!location.districtCode
        ? { districtId: 'No pudimos identificar el UBIGEO oficial.' }
        : {}),
      ...(!synchronized
        ? { position: 'Confirma el pin para sincronizar la dirección con su zona oficial.' }
        : {}),
    };
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    const signature = [
      district?.id ?? 'no-district',
      Number(form.latitude).toFixed(7),
      Number(form.longitude).toFixed(7),
    ].join(':');

    // La cobertura debe corresponder al pin que finalmente se guarda.
    if (coveragePreview?.signature !== signature) {
      setIsCheckingCoverage(true);
      try {
        const result = await geoApi.checkCoverage({
          cityId: district?.cityId,
          districtId: district?.id,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
        });
        setCoveragePreview({ signature, result });
      } catch (error) {
        toast.error(getApiErrorMessage(error));
      } finally {
        setIsCheckingCoverage(false);
      }
      return;
    }

    setIsSaving(true);
    try {
      const payload: AddressInput = {
        ...form,
        districtId: district?.id ?? null,
        ubigeoCode: location.districtCode,
        departmentName: activeDepartmentName ?? null,
        provinceName: activeProvinceName ?? null,
        districtName: activeDistrictName ?? null,
      };
      if (editingId) {
        const updated = await accountApi.updateAddress(editingId, payload);
        toast.success('Dirección actualizada');
        if (activeAddress?.id === updated.id) await refreshPurchaseContext(updated);
      } else {
        await accountApi.createAddress(payload);
        toast.success('Dirección guardada');
      }
      setModalOpen(false);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await accountApi.deleteAddress(pendingDelete.id);
      toast.success('Dirección eliminada');
      if (activeAddress?.id === pendingDelete.id) clearPurchaseContext();
      setPendingDelete(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleMakeDefault = async (address: Address) => {
    try {
      await accountApi.updateAddress(address.id, { isDefault: true });
      toast.success(`${address.label} ahora es tu dirección principal`);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const applyResolvedAddress = (address: AddressSuggestion) => {
    const resolvedUbigeo =
      address.ubigeoCode ??
      operationalDistricts.find((district) => district.id === address.districtId)?.ubigeoCode ??
      null;
    const resolvedDistrict = resolvedUbigeo
      ? (operationalDistricts.find((district) => district.ubigeoCode === resolvedUbigeo) ?? null)
      : null;
    const synchronizedAddress =
      resolvedUbigeo === address.ubigeoCode ? address : { ...address, ubigeoCode: resolvedUbigeo };

    if (resolvedUbigeo) {
      setLocation({
        departmentCode: resolvedUbigeo.slice(0, 2),
        provinceCode: resolvedUbigeo.slice(0, 4),
        districtCode: resolvedUbigeo,
      });
    } else {
      setLocation((current) => ({ ...current, districtCode: '' }));
    }
    setForm((current) => ({
      ...current,
      line1: address.line1,
      districtId: resolvedDistrict?.id ?? null,
      latitude: address.latitude,
      longitude: address.longitude,
    }));
    setResolvedLocation(synchronizedAddress);
    setFormErrors((current) => ({
      ...current,
      line1: undefined,
      districtId: resolvedUbigeo
        ? undefined
        : 'No pudimos identificar el UBIGEO oficial de este punto.',
      position:
        address.latitude !== null && address.longitude !== null
          ? undefined
          : 'No pudimos obtener un punto exacto para esta dirección.',
    }));
  };

  const selectLocation = (next: PeruLocationValue) => {
    setLocation(next);
    setResolvedLocation(null);
    setForm((current) => ({
      ...current,
      line1: '',
      districtId:
        operationalDistricts.find((district) => district.ubigeoCode === next.districtCode)?.id ??
        null,
      latitude: null,
      longitude: null,
    }));
    setFormErrors({});
  };

  const resetAddressLocation = () => {
    setResolvedLocation(null);
    setForm((current) => ({
      ...current,
      line1: '',
      districtId: null,
      latitude: null,
      longitude: null,
    }));
    setFormErrors({});
  };

  const operationalDistrict = operationalDistricts.find(
    (district) => district.ubigeoCode === location.districtCode,
  );
  const cityId = operationalDistrict?.cityId ?? null;
  const selectedDepartmentName =
    geography.department?.code === location.departmentCode ? geography.department.name : undefined;
  const selectedProvinceName =
    geography.province?.code === location.provinceCode ? geography.province.name : undefined;
  const selectedDistrictName =
    geography.district?.code === location.districtCode ? geography.district.name : undefined;
  const isAddressSynchronized = Boolean(
    resolvedLocation?.ubigeoCode &&
    resolvedLocation.ubigeoCode === location.districtCode &&
    resolvedLocation.latitude != null &&
    resolvedLocation.longitude != null &&
    form.latitude != null &&
    form.longitude != null &&
    Math.abs(resolvedLocation.latitude - form.latitude) < 0.000001 &&
    Math.abs(resolvedLocation.longitude - form.longitude) < 0.000001,
  );
  const activeDepartmentName = isAddressSynchronized
    ? (resolvedLocation?.region ?? selectedDepartmentName)
    : selectedDepartmentName;
  const activeProvinceName = isAddressSynchronized
    ? (resolvedLocation?.province ?? selectedProvinceName)
    : selectedProvinceName;
  const activeDistrictName = isAddressSynchronized
    ? (resolvedLocation?.district ?? selectedDistrictName)
    : selectedDistrictName;

  const defaultAddress = addresses.find((address) => address.isDefault) ?? null;
  const locatedAddresses = addresses.filter(
    (address) => address.latitude !== null && address.longitude !== null,
  ).length;
  const formSteps = [
    { label: 'Zona', ready: Boolean(location.districtCode) },
    { label: 'Dirección', ready: form.line1.trim().length >= 5 },
    { label: 'Entrada', ready: isAddressSynchronized },
  ];
  const completedFormSteps = formSteps.filter((step) => step.ready).length;
  const canSave = Boolean(
    completedFormSteps === formSteps.length && form.label.trim().length > 0 && !isResolvingPin,
  );
  const currentCoverageSignature = form.latitude != null && form.longitude != null
    ? [
        operationalDistrict?.id ?? 'no-district',
        Number(form.latitude).toFixed(7),
        Number(form.longitude).toFixed(7),
      ].join(':')
    : null;
  const visibleCoverage = coveragePreview?.signature === currentCoverageSignature
    ? coveragePreview.result
    : null;

  return (
    <div>
      <PageHeader
        eyebrow="Mi cuenta"
        title="Mis direcciones"
        description="Administra tus lugares frecuentes y confirma la entrada exacta para cada entrega."
        icon={MapPin}
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Mi cuenta' }, { label: 'Direcciones' }]}
        action={
          <Button leftIcon={<Plus className="size-4" />} onClick={openCreate}>
            Nueva dirección
          </Button>
        }
      />

      {isLoading || isGeoLoading ? (
        <AddressesSkeleton />
      ) : loadError ? (
        <AccountLoadError
          title="No pudimos cargar tus direcciones"
          message={loadError}
          onRetry={retryLoad}
        />
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Todavía no tienes direcciones guardadas"
          description="Guarda un lugar de entrega para recibir tus pedidos más rápido."
          action={
            <Button leftIcon={<Plus className="size-4" />} onClick={openCreate}>
              Guardar mi primera dirección
            </Button>
          }
        />
      ) : (
        <>
          <section className="mb-6 grid grid-cols-3 gap-2" aria-label="Resumen de direcciones">
            <AddressStat
              value={addresses.length}
              label={addresses.length === 1 ? 'Guardada' : 'Guardadas'}
              icon={Home}
            />
            <AddressStat value={locatedAddresses} label="Con punto exacto" icon={LocateFixed} />
            <AddressStat
              value={defaultAddress ? 'Sí' : 'No'}
              label="Principal definida"
              icon={Star}
              highlighted={Boolean(defaultAddress)}
            />
          </section>

          <ul className="grid gap-4 lg:grid-cols-2">
            {addresses.map((address) => {
              const isActive = activeAddress?.id === address.id;

              return (
                <li key={address.id}>
                  <Card
                    className={cn(
                      'flex h-full flex-col rounded-card p-0 transition hover:border-brand-200 hover:shadow-e3',
                      isActive
                        ? 'border-brand-600 ring-1 ring-brand-300'
                        : address.isDefault && 'border-brand-300 ring-1 ring-brand-200',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-line bg-surface-muted/45 p-4 sm:p-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className={cn(
                            'grid size-10 shrink-0 place-items-center rounded-card',
                            isActive || address.isDefault
                              ? 'bg-brand-700 text-white'
                              : 'bg-brand-50 text-brand-700',
                          )}
                        >
                          <Home className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="truncate font-extrabold text-ink">{address.label}</h2>
                            {isActive && (
                              <span className="inline-flex items-center gap-1 rounded-pill bg-brand-700 px-2 py-0.5 text-[10px] font-extrabold text-white">
                                <Truck className="size-3" /> Entrega actual
                              </span>
                            )}
                            {address.isDefault && (
                              <span className="rounded-pill bg-brand-100 px-2 py-0.5 text-[10px] font-extrabold text-brand-800">
                                Principal
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-ink-muted">
                            {address.latitude !== null && address.longitude !== null
                              ? 'Punto exacto confirmado'
                              : 'Falta confirmar el punto'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(address)}
                        className="grid size-11 shrink-0 place-items-center rounded-field text-ink-muted transition hover:bg-red-50 hover:text-red-600"
                        aria-label={`Eliminar ${address.label}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <div className="flex flex-1 flex-col p-4 sm:p-5">
                      <p className="text-sm font-semibold leading-6 text-ink">{address.line1}</p>
                      {addressZoneLabel(address) && (
                        <p className="mt-1 text-xs text-ink-muted">{addressZoneLabel(address)}</p>
                      )}
                      {address.reference ? (
                        <div className="mt-4 rounded-card border border-line bg-surface-muted/55 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-[.1em] text-ink-muted">
                            Referencia para el repartidor
                          </p>
                          <p className="mt-1 text-xs leading-5 text-ink">{address.reference}</p>
                        </div>
                      ) : (
                        <p className="mt-4 text-xs italic text-ink-muted">
                          Sin referencia adicional.
                        </p>
                      )}

                      {coverageIssue && coverageIssue.id === address.id && (
                        <p
                          role="alert"
                          className="mt-4 flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"
                        >
                          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                          {coverageIssue.reason}
                        </p>
                      )}

                      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
                        {isActive ? (
                          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-brand-200 bg-brand-50 px-3 text-xs font-extrabold text-brand-800">
                            <CheckCircle2 className="size-3.5" /> Entregando aquí
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            leftIcon={<Truck className="size-3.5" />}
                            isLoading={deliveringId === address.id}
                            onClick={() => void deliverHere(address)}
                          >
                            Entregar aquí
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<Pencil className="size-3.5" />}
                          onClick={() => openEdit(address)}
                        >
                          Editar
                        </Button>
                        {address.latitude !== null && address.longitude !== null && (
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<ExternalLink className="size-3.5" />}
                            component="a"
                            href={`https://www.openstreetmap.org/?mlat=${address.latitude}&mlon=${address.longitude}#map=17/${address.latitude}/${address.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver mapa
                          </Button>
                        )}
                        {!address.isDefault && (
                          <Button
                            size="sm"
                            variant="ghost"
                            leftIcon={<Star className="size-3.5" />}
                            onClick={() => handleMakeDefault(address)}
                          >
                            Hacer principal
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar dirección' : 'Nueva dirección'}
        description="Completa la zona, selecciona una coincidencia y confirma la entrada exacta en el mapa."
        icon={MapPin}
        eyebrow="Ubicación de entrega"
        maxWidth="lg"
      >
        <div>
          <div className="mb-5 rounded-card border border-brand-100 bg-brand-50/55 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-extrabold text-ink">Progreso de la dirección</p>
              <span className="text-xs font-black text-brand-700">{completedFormSteps}/3</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {formSteps.map((step, index) => (
                <div
                  key={step.label}
                  className={cn(
                    'flex min-w-0 items-center gap-2 rounded-pill border px-2.5 py-2 text-[11px] font-bold',
                    step.ready
                      ? 'border-brand-200 bg-white text-brand-800'
                      : 'border-transparent text-ink-muted',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-pill text-[10px]',
                      step.ready ? 'bg-brand-700 text-white' : 'bg-neutral-100',
                    )}
                  >
                    {step.ready ? <Check className="size-3" /> : index + 1}
                  </span>
                  <span>{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.92fr)]">
            <div className="grid gap-4">
              <FormSection
                title={isAddressSynchronized ? 'Zona confirmada' : 'Zona y dirección'}
                description={
                  isAddressSynchronized
                    ? 'El departamento, provincia y distrito se obtuvieron desde el pin.'
                    : 'La selección ayuda a buscar; el pin confirmará la zona administrativa final.'
                }
                icon={Navigation}
              >
                {isResolvingPin ? (
                  <div
                    role="status"
                    className="flex items-center gap-3 rounded-card border border-brand-100 bg-brand-50/70 p-4 text-sm text-brand-900"
                  >
                    <span className="size-3 animate-pulse rounded-full bg-brand-600" />
                    <div>
                      <p className="font-extrabold">Identificando la zona del pin…</p>
                      <p className="mt-0.5 text-xs text-brand-800">
                        Estamos verificando distrito, provincia y departamento.
                      </p>
                    </div>
                  </div>
                ) : isAddressSynchronized ? (
                  <div className="rounded-card border border-brand-200 bg-brand-50/55 p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
                      <p className="flex items-center gap-2 text-xs font-extrabold text-brand-900">
                        <CheckCircle2 className="size-4" /> Zona obtenida desde las coordenadas
                      </p>
                      <span className="rounded-pill bg-white px-2.5 py-1 text-[10px] font-extrabold tracking-wide text-brand-800 ring-1 ring-brand-100">
                        UBIGEO {location.districtCode}
                      </span>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      {[
                        ['Departamento', activeDepartmentName ?? '—'],
                        ['Provincia', activeProvinceName ?? '—'],
                        ['Distrito', activeDistrictName ?? '—'],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="rounded-card bg-white px-3 py-2.5 ring-1 ring-brand-100"
                        >
                          <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-ink-muted">
                            {label}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-extrabold text-ink">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="pt-3">
                      <Button size="sm" variant="ghost" onClick={resetAddressLocation}>
                        Cambiar zona o dirección
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <PeruLocationSelector
                      value={location}
                      onChange={selectLocation}
                      onSelectionChange={setGeography}
                      disabled={isResolvingPin}
                      error={formErrors.districtId}
                    />
                    <p className="mt-3 flex items-start gap-2 rounded-card bg-surface-muted px-3 py-2.5 text-xs leading-5 text-ink-muted">
                      <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-700" />
                      Igual que en Cobertura, la zona elegida es una referencia de búsqueda. La
                      ubicación final siempre será la detectada en el pin.
                    </p>
                  </>
                )}
                {isAddressSynchronized && formErrors.districtId && (
                  <p
                    role="alert"
                    className="mt-3 flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {formErrors.districtId}
                  </p>
                )}
                {isAddressSynchronized && !operationalDistrict && !formErrors.districtId && (
                  <p
                    role="status"
                    className="mt-3 flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    Puedes guardar esta dirección. Actualmente está fuera de nuestras zonas de
                    delivery y volveremos a validar la cobertura cuando realices un pedido.
                  </p>
                )}
                <div className="mt-4">
                  <AddressAutocomplete
                    value={form.line1}
                    onChange={(line1) => {
                      setForm((current) => ({
                        ...current,
                        line1,
                        latitude: null,
                        longitude: null,
                      }));
                      setResolvedLocation(null);
                      setFormErrors((current) => ({ ...current, line1: undefined }));
                    }}
                    onSelect={applyResolvedAddress}
                    cityId={cityId}
                    cityName={activeProvinceName}
                    districtId={operationalDistrict?.id}
                    districtName={activeDistrictName}
                    departmentName={activeDepartmentName}
                    provinceName={activeProvinceName}
                    ubigeoCode={location.districtCode}
                    error={formErrors.line1}
                    disabled={isResolvingPin}
                  />
                  {form.line1.trim().length >= 5 && !/\d/.test(form.line1) && (
                    <p
                      role="status"
                      className="mt-3 flex items-start gap-2 rounded-card bg-amber-50 p-3 text-xs text-amber-800"
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Añade el número, lote o
                      puerta para evitar demoras.
                    </p>
                  )}
                </div>
              </FormSection>

              <FormSection
                title="Detalles para el repartidor"
                description="Ayuda a identificar rápidamente el lugar al llegar."
                icon={Info}
              >
                <FormStack>
                  <Input
                    label="Etiqueta"
                    placeholder="Casa, Oficina..."
                    value={form.label}
                    onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
                  />
                  <Input
                    label="Referencia (opcional)"
                    placeholder="Frente al parque, puerta verde..."
                    value={form.reference ?? ''}
                    onChange={(event) => setForm((f) => ({ ...f, reference: event.target.value }))}
                  />
                  <Checkbox
                    checked={form.isDefault ?? false}
                    onChange={(event) =>
                      setForm((f) => ({ ...f, isDefault: event.target.checked }))
                    }
                    label="Usar como dirección principal"
                  />
                </FormStack>
              </FormSection>
            </div>

            <FormSection
              title="Confirma la entrada"
              description="Puedes ajustar el punto haciendo clic sobre el mapa."
              icon={MapPin}
              tone="brand"
              className="h-fit lg:sticky lg:top-0"
            >
              <AddressMapPicker
                value={
                  form.latitude != null && form.longitude != null
                    ? { latitude: form.latitude, longitude: form.longitude }
                    : null
                }
                onChange={({ latitude, longitude }) => {
                  setForm((current) => ({ ...current, latitude, longitude }));
                  setResolvedLocation(null);
                  setFormErrors((current) => ({ ...current, position: undefined }));
                }}
                cityId={cityId}
                cityName={activeProvinceName}
                departmentName={activeDepartmentName}
                provinceName={activeProvinceName}
                districtId={operationalDistrict?.id}
                districtName={activeDistrictName}
                districtCenter={
                  !isAddressSynchronized && geography.district?.code === location.districtCode
                    ? {
                        latitude: geography.district.latitude,
                        longitude: geography.district.longitude,
                      }
                    : null
                }
                address={resolvedLocation}
                onAddressResolved={applyResolvedAddress}
                onAddressResolutionFailed={() => {
                  setForm((current) => ({
                    ...current,
                    latitude: resolvedLocation?.latitude ?? null,
                    longitude: resolvedLocation?.longitude ?? null,
                  }));
                }}
                onResolvingChange={setIsResolvingPin}
                autoLocate={editingId === null}
              />
              {formErrors.position && (
                <p role="alert" className="mt-2 text-xs font-semibold text-red-600">
                  {formErrors.position}
                </p>
              )}
              {isAddressSynchronized && !formErrors.position && (
                <p
                  role="status"
                  className="mt-3 flex items-center gap-2 rounded-card border border-brand-200 bg-white px-3 py-2.5 text-xs font-bold text-brand-800"
                >
                  <CheckCircle2 className="size-4" /> Entrada y zona oficial sincronizadas
                </p>
              )}
            </FormSection>
          </div>

          {visibleCoverage && (
            <AddressCoveragePreview
              result={visibleCoverage}
              onSelectPickup={(pickup) => {
                selectPickup(pickup);
                toast.success(`Recojo seleccionado en ${pickup.name}`);
              }}
            />
          )}

          <FormActions>
            <Button variant="outline" disabled={isSaving || isCheckingCoverage} onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!canSave}
              isLoading={isSaving || isCheckingCoverage}
              leftIcon={visibleCoverage ? <PackageCheck className="size-4" /> : undefined}
              onClick={handleSave}
            >
              {visibleCoverage
                ? (editingId ? 'Guardar cambios' : 'Guardar dirección')
                : 'Comprobar cobertura'}
            </Button>
          </FormActions>
        </div>
      </Modal>

      <Modal
        isOpen={pendingDelete !== null}
        onClose={() => !isDeleting && setPendingDelete(null)}
        title="Eliminar dirección"
        description={`Esta acción eliminará “${pendingDelete?.label ?? ''}” de tus direcciones guardadas.`}
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" disabled={isDeleting} onClick={() => setPendingDelete(null)}>
            Cancelar
          </Button>
          <Button variant="danger" isLoading={isDeleting} onClick={() => void handleDelete()}>
            Eliminar dirección
          </Button>
        </div>
      </Modal>
    </div>
  );
};

const AddressesSkeleton = () => (
  <div>
    <div className="mb-6 grid grid-cols-3 gap-2">
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-19 rounded-card sm:h-17" />
      ))}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="rounded-card border border-line bg-white">
          <div className="flex items-center gap-3 border-b border-line bg-surface-muted/45 p-4 sm:p-5">
            <Skeleton className="size-10 shrink-0 rounded-card" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="mt-2 h-3 w-3/5" />
            <Skeleton className="mt-4 h-14 w-full rounded-card" />
            <div className="mt-4 flex gap-2 border-t border-line pt-4">
              <Skeleton className="h-9 w-32 rounded-field" />
              <Skeleton className="h-9 w-24 rounded-field" />
            </div>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const AddressStat = ({
  value,
  label,
  icon: Icon,
  highlighted = false,
}: {
  value: string | number;
  label: string;
  icon: typeof Home;
  highlighted?: boolean;
}) => (
  <div
    className={cn(
      'rounded-card border p-3 text-center sm:flex sm:items-center sm:gap-3 sm:text-left',
      highlighted ? 'border-brand-200 bg-brand-50' : 'border-line bg-white',
    )}
  >
    <span
      className={cn(
        'mx-auto grid size-8 place-items-center rounded-card sm:mx-0',
        highlighted ? 'bg-brand-700 text-white' : 'bg-surface-muted text-brand-700',
      )}
    >
      <Icon className="size-4" />
    </span>
    <div className="mt-2 min-w-0 sm:mt-0">
      <p className="text-lg font-black text-ink">{value}</p>
      <p className="truncate text-[10px] font-semibold text-ink-muted sm:text-xs">{label}</p>
    </div>
  </div>
);

export default AddressesPage;
