import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clock, MapPin, Navigation, Store, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { FormSection } from '@components/ui/FormSection';
import { useAppState } from '@context/AppStateContext';
import { getApiErrorMessage } from '@services/api/client';
import { trackUxEvent } from '@services/analytics';
import { formatCurrency } from '@lib/format';
import { geoApi } from '../services/geo.service';
import type { City, CoverageResult, District } from '../types';
import { AddressAutocomplete } from './AddressAutocomplete';
import { AddressMapPicker, type MapPosition } from './AddressMapPicker';

interface CoverageCheckerProps {
  /** Se llama cuando el cliente confirma una direccion con cobertura. */
  onConfirmed?: () => void;
}

/**
 * Verificador de cobertura (RN-001, RN-002, RN-003).
 * El backend decide: aqui solo se muestra el resultado y se guarda el contexto de
 * compra (ciudad, direccion, sucursal) en useAppState.
 */
export const CoverageChecker = ({ onConfirmed }: CoverageCheckerProps) => {
  const { cityId, setCity, setAddress, setBranch, setDeliveryType } = useAppState();

  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtId, setDistrictId] = useState<number | ''>('');
  const [line1, setLine1] = useState('');
  const [unit, setUnit] = useState('');
  const [reference, setReference] = useState('');
  const [position, setPosition] = useState<MapPosition | null>(null);
  const [result, setResult] = useState<CoverageResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const progressSteps = [
    { label: 'Zona', ready: districtId !== '' },
    { label: 'Dirección', ready: line1.trim().length >= 5 },
    { label: 'Punto exacto', ready: position !== null },
  ];
  const completedSteps = progressSteps.filter((step) => step.ready).length;

  useEffect(() => {
    geoApi
      .getCities()
      .then((data) => {
        setCities(data);
        if (data.length > 0 && cityId === null) setCity(data[0].id);
      })
      .catch((error) => toast.error(getApiErrorMessage(error)));
    // Solo al montar: la ciudad inicial se fija una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cityId === null) return;
    geoApi
      .getDistricts(cityId)
      .then(setDistricts)
      .catch((error) => toast.error(getApiErrorMessage(error)));
    setDistrictId('');
    setLine1('');
    setUnit('');
    setReference('');
    setPosition(null);
    setResult(null);
  }, [cityId]);

  const handleCheck = async () => {
    if (districtId === '') {
      toast.error('Elige tu distrito');
      return;
    }
    if (line1.trim().length < 5) {
      toast.error('Escribe la calle y el número de entrega');
      return;
    }
    if (!position) {
      toast.error('Confirma la entrada exacta en el mapa');
      return;
    }

    setIsChecking(true);
    try {
      const coverage = await geoApi.checkCoverage({
        cityId: cityId ?? undefined,
        districtId: Number(districtId),
        latitude: position?.latitude,
        longitude: position?.longitude,
      });
      setResult(coverage);
      void trackUxEvent(coverage.covered ? 'COVERAGE_SUCCESS' : 'COVERAGE_FAIL', { districtId: Number(districtId), reason: coverage.reason?.slice(0, 120) ?? null });
    } catch (error) {
      void trackUxEvent('COVERAGE_ERROR', { message: getApiErrorMessage(error).slice(0, 120) });
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsChecking(false);
    }
  };

  const handleConfirm = () => {
    if (!result?.covered || !result.branch) return;

    const district = districts.find((item) => item.id === Number(districtId));

    setAddress({
      label: district?.name ?? 'Mi direccion',
      line1: line1.trim() || (district?.name ?? ''),
      districtId: district?.id,
      latitude: position?.latitude,
      longitude: position?.longitude,
      reference: [unit.trim() ? `Departamento/piso: ${unit.trim()}` : '', reference.trim()].filter(Boolean).join(' · ') || undefined,
    });
    setBranch(result.branch.id);
    toast.success(`Te atiende ${result.branch.name}`);
    onConfirmed?.();
  };

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-brand-100 bg-white shadow-sm">
        <div className="h-1 bg-neutral-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400 transition-all duration-500"
            style={{ width: `${(completedSteps / progressSteps.length) * 100}%` }}
          />
        </div>
        <div className="grid grid-cols-3 gap-1 p-2 sm:gap-3 sm:p-3">
          {progressSteps.map((step, index) => (
            <div
              key={step.label}
              className={`flex items-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold transition-all duration-300 sm:px-3 sm:text-sm ${
                step.ready ? 'bg-brand-50 text-brand-800' : 'text-ink-muted'
              }`}
            >
              <span className={`grid size-6 shrink-0 place-items-center rounded-full transition-colors ${step.ready ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-ink-muted'}`}>
                {step.ready ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(330px,.9fr)]">
        <div className="space-y-4">
          <FormSection title="1. Elige tu zona" description="Así priorizamos resultados del distrito correcto y evitamos direcciones duplicadas." icon={Navigation}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Select
            id="city"
            label="Provincia / ciudad"
            value={cityId ?? ''}
            onChange={(event) => setCity(Number(event.target.value))}
          >
            {cities.map((city) => (
              <SelectOption key={city.id} value={city.id}>
                {city.name}
              </SelectOption>
            ))}
          </Select>

          <Select
            id="district"
            label="Distrito"
            value={districtId}
            onChange={(event) => {
              setDistrictId(event.target.value === '' ? '' : Number(event.target.value));
              setPosition(null);
              setResult(null);
            }}
          >
            <SelectOption value="">Elige tu distrito</SelectOption>
            {districts.map((district) => (
              <SelectOption key={district.id} value={district.id}>
                {district.name}
              </SelectOption>
            ))}
          </Select>
            </div>
          </FormSection>

          <FormSection title="2. Busca tu dirección" description="Selecciona una coincidencia; después podrás ajustar la puerta exacta." icon={MapPin}>
            <AddressAutocomplete
              value={line1}
              onChange={(value) => { setLine1(value); setPosition(null); setResult(null); }}
              onSelect={(suggestion) => {
                setLine1(suggestion.line1);
                if (suggestion.districtId != null) setDistrictId(suggestion.districtId);
                setResult(null);
                if (suggestion.latitude != null && suggestion.longitude != null) setPosition({ latitude: suggestion.latitude, longitude: suggestion.longitude });
              }}
              cityId={cityId}
              cityName={cities.find((city) => city.id === cityId)?.name}
              districtId={districtId === '' ? null : Number(districtId)}
              districtName={districts.find((district) => district.id === Number(districtId))?.name}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Input label="Departamento / piso" placeholder="Ej. 502, interior B" value={unit} onChange={(event) => setUnit(event.target.value)} autoComplete="address-line2" />
              <Input label="Referencia" placeholder="Puerta verde, frente al parque…" value={reference} onChange={(event) => setReference(event.target.value)} />
            </div>
            {line1.trim().length >= 5 && !/\d/.test(line1) && (
              <p role="status" className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                No vemos un número de puerta. Puedes añadirlo o confirmar el acceso exacto en el mapa.
              </p>
            )}
            <Button className="mt-4 w-full" onClick={handleCheck} isLoading={isChecking} leftIcon={<MapPin className="size-4" />}>
              Verificar esta dirección
            </Button>
          </FormSection>
        </div>

        <FormSection title="3. Confirma el punto" description="Mueve el punto a la entrada por donde recibes pedidos." icon={MapPin} tone="brand" className="h-fit">
          <AddressMapPicker
            value={position}
            cityId={cityId}
            onChange={(next) => { setPosition(next); setResult(null); }}
            onAddressResolved={(address) => {
              setLine1(address.line1);
              if (address.districtId != null) setDistrictId(address.districtId);
              setResult(null);
            }}
            coveragePolygon={result?.zone?.polygon}
          />
        </FormSection>
      </div>

      {result && (
        <div
          className={`rounded-2xl border p-5 shadow-sm ${
            result.covered ? 'border-brand-200 bg-brand-50' : 'border-red-200 bg-red-50'
          }`}
        >
          {result.covered && result.branch && result.zone ? (
            <>
              <p className="flex items-center gap-2 font-semibold text-brand-800">
                <CheckCircle2 className="size-5" /> Si llegamos a tu direccion
              </p>

              <dl className="mt-3 grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
                <div>
                  <dt className="inline font-medium text-ink">Sucursal: </dt>
                  <dd className="inline">{result.branch.name}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-ink">Zona: </dt>
                  <dd className="inline">{result.zone.name}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-ink">Delivery: </dt>
                  <dd className="inline">{formatCurrency(result.zone.deliveryFee)}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-ink">Pedido minimo: </dt>
                  <dd className="inline">{formatCurrency(result.zone.minimumOrder)}</dd>
                </div>
              </dl>

              <p className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
                <Clock className="size-4" />
                Llega en ~{result.etaMinutes} min ·{' '}
                {result.branch.isOpenNow ? 'Abierto ahora' : 'Cerrado en este momento'}
              </p>

              <Button className="mt-4" onClick={handleConfirm}>
                Usar esta direccion
              </Button>
            </>
          ) : (
            <div>
              <p className="flex items-center gap-2 font-medium text-red-700">
                <XCircle className="size-5" />
                {result.reason ?? 'Todavía no llegamos a esta dirección'}
              </p>
              {result.nearestPickup && (
                <div className="mt-4 rounded-xl border border-red-100 bg-white/80 p-4">
                  <p className="flex items-center gap-2 font-semibold text-ink"><Store className="size-4 text-brand-700" /> Alternativa cercana</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Recoge en {result.nearestPickup.name} · {result.nearestPickup.distanceKm} km
                    {result.nearestPickup.isOpenNow ? ' · abierto ahora' : ' · cerrado ahora'}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">{result.nearestPickup.addressLine}</p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    onClick={() => {
                      setBranch(result.nearestPickup!.id);
                      setDeliveryType('PICKUP');
                      toast.success(`Recojo seleccionado en ${result.nearestPickup!.name}`);
                      onConfirmed?.();
                    }}
                  >
                    Elegir recojo en tienda
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
