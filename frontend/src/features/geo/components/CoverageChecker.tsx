import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Map,
  MapPin,
  Navigation,
  Search,
  Store,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { FormSection } from '@components/ui/FormSection';
import { Input } from '@components/ui/Input';
import { useAppSelector } from '@app/hooks';
import { ROUTES } from '@constants/routes';
import { useAppState, type SelectedAddress } from '@context/AppStateContext';
import { getApiErrorMessage } from '@services/api/client';
import { trackUxEvent } from '@services/analytics';
import { accountApi } from '@features/account/services/account.service';
import { geoApi } from '../services/geo.service';
import type { Address, AddressSuggestion, CoverageResult, District } from '../types';
import { AddressAutocomplete } from './AddressAutocomplete';
import { AddressMapPicker, type MapPosition } from './AddressMapPicker';
import { CoverageProgress } from './CoverageProgress';
import { CoverageResultCard } from './CoverageResultCard';
import {
  PeruLocationSelector,
  type PeruLocationSelection,
  type PeruLocationValue,
} from './PeruLocationSelector';

interface CoverageCheckerProps {
  /** Se llama cuando el cliente confirma una dirección con cobertura. */
  onConfirmed?: () => void;
}

/**
 * Verificador guiado de cobertura. El backend sigue siendo la fuente de verdad;
 * este componente organiza la captura, representa el resultado y guarda el
 * contexto de compra confirmado.
 */
export const CoverageChecker = ({ onConfirmed }: CoverageCheckerProps) => {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const {
    cityId,
    deliveryType,
    pickupBranch,
    setCity,
    setDeliveryType,
    selectDelivery,
    selectPickup,
  } = useAppState();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

  const [operationalDistricts, setOperationalDistricts] = useState<District[]>([]);
  const [location, setLocation] = useState<PeruLocationValue>({
    departmentCode: '15',
    provinceCode: '1501',
    districtCode: '150101',
  });
  const [geography, setGeography] = useState<PeruLocationSelection>({
    department: null,
    province: null,
    district: null,
  });
  const [line1, setLine1] = useState('');
  const [unit, setUnit] = useState('');
  const [reference, setReference] = useState('');
  const [position, setPosition] = useState<MapPosition | null>(null);
  const [resolvedLocation, setResolvedLocation] = useState<AddressSuggestion | null>(null);
  const [result, setResult] = useState<CoverageResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isResolvingPin, setIsResolvingPin] = useState(false);
  const [locationError, setLocationError] = useState('');

  const formRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const isAddressSynchronized = Boolean(
    resolvedLocation?.ubigeoCode &&
      resolvedLocation.ubigeoCode === location.districtCode &&
      resolvedLocation.latitude != null &&
      resolvedLocation.longitude != null &&
      position &&
      Math.abs(resolvedLocation.latitude - position.latitude) < 0.000001 &&
      Math.abs(resolvedLocation.longitude - position.longitude) < 0.000001,
  );
  const progressSteps = [
    { label: 'Zona', ready: location.districtCode !== '' },
    { label: 'Dirección', ready: line1.trim().length >= 5 },
    { label: 'Punto exacto', ready: isAddressSynchronized },
  ];
  const isReady = progressSteps.every((step) => step.ready) && !isResolvingPin;

  const operationalDistrict = operationalDistricts.find(
    (item) => item.ubigeoCode === location.districtCode,
  );
  const selectedDepartmentName = geography.department?.code === location.departmentCode
    ? geography.department.name
    : undefined;
  const selectedProvinceName = geography.province?.code === location.provinceCode
    ? geography.province.name
    : undefined;
  const selectedDistrictName = geography.district?.code === location.districtCode
    ? geography.district.name
    : undefined;
  const activeDepartmentName = isAddressSynchronized
    ? resolvedLocation?.region ?? undefined
    : selectedDepartmentName;
  const activeProvinceName = isAddressSynchronized
    ? resolvedLocation?.province ?? undefined
    : selectedProvinceName;
  const activeDistrictName = isAddressSynchronized
    ? resolvedLocation?.district ?? undefined
    : selectedDistrictName;
  const addressLabel = [line1.trim(), activeDistrictName, activeProvinceName]
    .filter(Boolean)
    .join(', ');

  const nextRequirement =
    location.districtCode === ''
      ? 'Selecciona departamento, provincia y distrito de entrega.'
      : line1.trim().length < 5
        ? 'Ahora escribe y selecciona la dirección.'
        : !position
          ? 'Marca la entrada exacta en el mapa.'
          : isResolvingPin
            ? 'Estamos sincronizando la dirección con el pin.'
            : !isAddressSynchronized
              ? 'Ajusta el pin para confirmar la zona administrativa correcta.'
              : 'Todo listo para calcular tu cobertura.';

  const resetAddressFields = () => {
    setLine1('');
    setUnit('');
    setReference('');
    setPosition(null);
    setResolvedLocation(null);
    setResult(null);
  };

  const selectLocation = (next: PeruLocationValue) => {
    setLocation(next);
    resetAddressFields();
  };

  const applyResolvedAddress = (address: AddressSuggestion) => {
    const resolvedUbigeo = address.ubigeoCode ?? operationalDistricts.find(
      (district) => district.id === address.districtId,
    )?.ubigeoCode ?? null;
    const synchronizedAddress = resolvedUbigeo === address.ubigeoCode
      ? address
      : { ...address, ubigeoCode: resolvedUbigeo };

    setLine1(address.line1);
    if (resolvedUbigeo) {
      setLocation({
        departmentCode: resolvedUbigeo.slice(0, 2),
        provinceCode: resolvedUbigeo.slice(0, 4),
        districtCode: resolvedUbigeo,
      });
    } else {
      // A new pin without a verified UBIGEO must not inherit the old district.
      setLocation((current) => ({ ...current, districtCode: '' }));
    }
    setResolvedLocation(synchronizedAddress);
    setResult(null);
    if (address.latitude != null && address.longitude != null) {
      setPosition({
        latitude: address.latitude,
        longitude: address.longitude,
      });
    }
  };

  useEffect(() => {
    setLocationError('');
    geoApi
      .getCities()
      .then(async (cities) => {
        const districtGroups = await Promise.all(
          cities.map((city) => geoApi.getDistricts(city.id)),
        );
        setOperationalDistricts(districtGroups.flat());
      })
      .catch((error) => {
        const message = getApiErrorMessage(error);
        setLocationError(message);
        toast.error(message);
      })
    // El catálogo geográfico nacional funciona aunque no exista una sede en la zona.
  }, []);

  useEffect(() => {
    if (deliveryType === 'PICKUP') return;
    const nextCityId = operationalDistrict?.cityId ?? null;
    if (cityId !== nextCityId) setCity(nextCityId);
  }, [cityId, deliveryType, operationalDistrict, setCity]);

  const handleCheck = async () => {
    if (!isReady || !position) {
      toast.error(nextRequirement);
      return;
    }

    setIsChecking(true);
    try {
      const coverage = await geoApi.checkCoverage({
        cityId: cityId ?? undefined,
        districtId: operationalDistrict?.id,
        latitude: position.latitude,
        longitude: position.longitude,
      });
      setResult(coverage);
      void trackUxEvent(coverage.covered ? 'COVERAGE_SUCCESS' : 'COVERAGE_FAIL', {
        districtId: operationalDistrict?.id ?? null,
        ubigeoCode: location.districtCode,
        reason: coverage.reason?.slice(0, 120) ?? null,
      });
      window.setTimeout(
        () => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        80,
      );
    } catch (error) {
      const message = getApiErrorMessage(error);
      void trackUxEvent('COVERAGE_ERROR', { message: message.slice(0, 120) });
      toast.error(message);
    } finally {
      setIsChecking(false);
    }
  };

  /**
   * La direccion confirmada aqui entra en la libreta del cliente identificado.
   * Sin esto solo existia en el localStorage de este navegador: al entrar desde
   * otro equipo no habia nada que recuperar.
   *
   * Se reutiliza la fila existente si ya guardo este mismo punto (~11 m), para no
   * llenarle la libreta de copias cada vez que reconfirma la misma entrada.
   */
  const persistToAddressBook = async (selected: SelectedAddress): Promise<Address | null> => {
    try {
      const existing = await accountApi.listAddresses();
      const duplicate = existing.find(
        (saved) =>
          saved.latitude != null &&
          saved.longitude != null &&
          selected.latitude != null &&
          selected.longitude != null &&
          Math.abs(Number(saved.latitude) - selected.latitude) < 0.0001 &&
          Math.abs(Number(saved.longitude) - selected.longitude) < 0.0001,
      );
      if (duplicate) return duplicate;

      return await accountApi.createAddress({
        label: selected.label.slice(0, 50),
        line1: selected.line1,
        reference: selected.reference,
        districtId: selected.districtId ?? null,
        ubigeoCode: location.districtCode || null,
        departmentName: activeDepartmentName ?? null,
        provinceName: activeProvinceName ?? null,
        districtName: activeDistrictName ?? null,
        latitude: selected.latitude ?? null,
        longitude: selected.longitude ?? null,
        // La primera direccion se vuelve la principal: es la que se propondra
        // cuando entre desde un navegador sin contexto guardado.
        isDefault: existing.length === 0,
      });
    } catch {
      // Guardar en la libreta es una comodidad, no puede impedirle pedir.
      return null;
    }
  };

  const handleConfirm = async () => {
    if (!result?.covered || !result.branch || isConfirming) return;

    // Consultar cobertura es público; asociar una dirección a una compra o a una
    // libreta es una acción personal. No dejamos un contexto que parezca guardado
    // para un visitante anónimo.
    if (!isAuthenticated) {
      const from = `${routeLocation.pathname}${routeLocation.search}`;
      toast('Inicia sesión para guardar y usar esta dirección.');
      onConfirmed?.();
      navigate(ROUTES.login, { state: { from } });
      return;
    }

    const selected: SelectedAddress = {
      label: activeDistrictName ?? 'Mi dirección',
      line1: line1.trim() || (activeDistrictName ?? ''),
      districtId: operationalDistrict?.id,
      latitude: position?.latitude,
      longitude: position?.longitude,
      reference:
        [unit.trim() ? `Departamento/piso: ${unit.trim()}` : '', reference.trim()]
          .filter(Boolean)
          .join(' · ')
          .slice(0, 200) || undefined,
    };

    setIsConfirming(true);
    const saved = await persistToAddressBook(selected);
    setIsConfirming(false);

    selectDelivery({ ...selected, id: saved?.id }, result.branch.id);
    toast.success(`Te atiende ${result.branch.name}`);
    onConfirmed?.();
  };

  const handlePickup = () => {
    if (!result?.nearestPickup) return;

    if (!isAuthenticated) {
      const from = `${routeLocation.pathname}${routeLocation.search}`;
      toast('Inicia sesión para elegir un local de recojo.');
      onConfirmed?.();
      navigate(ROUTES.login, { state: { from } });
      return;
    }

    selectPickup({
      id: result.nearestPickup.id,
      name: result.nearestPickup.name,
      addressLine: result.nearestPickup.addressLine,
      distanceKm: result.nearestPickup.distanceKm,
    });
    toast.success(`Recojo seleccionado en ${result.nearestPickup.name}`);
    onConfirmed?.();
  };

  const handleEdit = () => {
    setResult(null);
    window.setTimeout(
      () => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      40,
    );
  };

  if (isAuthenticated && deliveryType === 'PICKUP' && pickupBranch) {
    return (
      <section
        role="status"
        aria-live="polite"
        className="grid gap-4 rounded-card border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 shadow-e2 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-700 text-white">
            <Store className="size-5" />
          </span>
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[.14em] text-brand-700">
              Recojo confirmado
            </p>
            <h3 className="mt-1 text-lg font-black text-ink">{pickupBranch.name}</h3>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-ink-muted">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              {pickupBranch.addressLine}
            </p>
            {pickupBranch.distanceKm != null && (
              <p className="mt-1 text-xs font-semibold text-brand-800">
                A {pickupBranch.distanceKm} km del punto que consultaste
              </p>
            )}
          </div>
        </div>

        <div data-testid="pickup-no-address-notice" className="rounded-card border border-brand-100 bg-white px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-brand-900">
            <CheckCircle2 className="size-4" /> No necesitas elegir una dirección de entrega.
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Tu pedido quedará asociado directamente a este local para recogerlo en tienda.
          </p>
        </div>

        <Button className="w-fit" variant="outline" onClick={() => setDeliveryType('DELIVERY')}>
          Cambiar local o usar delivery
        </Button>
      </section>
    );
  }

  return (
    <div ref={formRef} className="grid gap-6">
      <CoverageProgress steps={progressSteps} />

      {locationError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 p-4 text-xs leading-5 text-red-800"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="block">No pudimos cargar las ubicaciones</strong>
            {locationError}
          </span>
        </div>
      )}

      <div className="grid items-start gap-6 xl:gap-8 lg:grid-cols-[minmax(0,1.02fr)_minmax(380px,.98fr)]">
        <div className="grid gap-5">
          <FormSection
            title={isAddressSynchronized ? '1. Ubicación confirmada' : '1. Elige tu zona'}
            description={
              isAddressSynchronized
                ? 'La zona oficial se obtuvo desde el pin. El mapa es ahora la fuente de verdad.'
                : 'Esta selección ayuda a buscar; al mover el pin la reemplazaremos por la ubicación detectada.'
            }
            icon={Navigation}
            className="rounded-card"
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
                    <div key={label} className="rounded-card bg-white px-3 py-2.5 ring-1 ring-brand-100">
                      <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-ink-muted">
                        {label}
                      </p>
                      <p className="mt-0.5 truncate text-sm font-extrabold text-ink">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="pt-3">
                  <Button size="sm" variant="ghost" onClick={resetAddressFields}>
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
                />
                <p className="mt-3 flex items-start gap-2 rounded-card bg-surface-muted px-3 py-2.5 text-xs leading-5 text-ink-muted">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-brand-700" />
                  La selección es un contexto de búsqueda. La zona final siempre será la que corresponda al pin.
                </p>
              </>
            )}
          </FormSection>

          <FormSection
            title="2. Busca tu dirección"
            description="Selecciona una coincidencia y añade una referencia que ayude al repartidor."
            icon={Search}
            className="rounded-card"
          >
            <AddressAutocomplete
              value={line1}
              onChange={(value) => {
                setLine1(value);
                setPosition(null);
                setResolvedLocation(null);
                setResult(null);
              }}
              onSelect={applyResolvedAddress}
              cityId={cityId}
              cityName={activeProvinceName}
              districtId={operationalDistrict?.id}
              districtName={activeDistrictName}
              departmentName={activeDepartmentName}
              provinceName={activeProvinceName}
              ubigeoCode={location.districtCode}
              disabled={isResolvingPin}
            />

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Input
                label="Dpto. / interior / piso"
                placeholder="Ej. 502, interior B"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                autoComplete="address-line2"
              />
              <Input
                label="Referencia"
                placeholder="Puerta verde, frente al parque…"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>

            {line1.trim().length >= 5 && !/\d/.test(line1) && (
              <p
                role="status"
                className="mt-3 flex items-start gap-2 rounded-card bg-amber-50 p-3 text-xs leading-5 text-amber-800"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                No vemos un número de puerta. Añádelo o ajusta la entrada exacta en el mapa.
              </p>
            )}
          </FormSection>
        </div>

        <div className="grid gap-5 lg:sticky lg:top-24">
          {result && (
            <div ref={resultRef}>
              <CoverageResultCard
                result={result}
                addressLabel={addressLabel}
                isConfirming={isConfirming}
                isAuthenticated={isAuthenticated}
                onConfirm={() => void handleConfirm()}
                onPickup={handlePickup}
                onEdit={handleEdit}
              />
            </div>
          )}

          <FormSection
            title="3. Confirma el punto exacto"
            description="Mueve el pin hasta la puerta o entrada por donde recibirás el pedido."
            icon={MapPin}
            tone="brand"
            className="rounded-card"
          >
            <AddressMapPicker
              value={position}
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
              onChange={(next) => {
                setPosition(next);
                setResult(null);
              }}
              address={resolvedLocation}
              onAddressResolved={(address) => {
                applyResolvedAddress(address);
              }}
              onAddressResolutionFailed={() => {
                setPosition(
                  resolvedLocation?.latitude != null && resolvedLocation.longitude != null
                    ? {
                        latitude: resolvedLocation.latitude,
                        longitude: resolvedLocation.longitude,
                      }
                    : null,
                );
                setResult(null);
              }}
              onResolvingChange={setIsResolvingPin}
              autoLocate
              coveragePolygon={result?.zone?.polygon}
            />
          </FormSection>
        </div>
      </div>

      <div className="grid gap-4 rounded-card border border-line bg-white p-4 shadow-e2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6 sm:p-5">
        <div className="flex items-start gap-3 px-1 py-1">
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-card ${
              isReady ? 'bg-brand-50 text-brand-700' : 'bg-neutral-100 text-ink-muted'
            }`}
          >
            {isReady ? <CheckCircle2 className="size-4" /> : <Map className="size-4" />}
          </span>
          <div>
            <p className="text-xs font-extrabold text-ink">
              {isReady ? 'Dirección lista para validar' : 'Completa tu ubicación'}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-ink-muted">{nextRequirement}</p>
          </div>
        </div>
        <Button
          className="w-full sm:w-auto sm:min-w-56"
          size="lg"
          disabled={!isReady || isChecking}
          isLoading={isChecking}
          leftIcon={<MapPin className="size-4" />}
          onClick={() => void handleCheck()}
        >
          Verificar cobertura
        </Button>
      </div>
    </div>
  );
};
