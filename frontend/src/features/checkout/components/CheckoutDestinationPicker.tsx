import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle2, MapPin, Store } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { formatCurrency } from '@lib/format';
import type { DeliveryType, SelectedAddress, SelectedPickupBranch } from '@context/AppStateContext';
import { AddressAutocomplete } from '@features/geo/components/AddressAutocomplete';
import { geoApi } from '@features/geo/services/geo.service';
import { DELIVERY_REFERENCE_MAX_LENGTH, getDeliveryReferenceError } from '@features/geo/utils/deliveryAddress';
import type { AddressSuggestion, Branch, CoverageResult } from '@features/geo/types';
import { getApiErrorMessage } from '@services/api/client';

interface Props {
  deliveryLabel?: string;
  deliveryType: DeliveryType;
  address: SelectedAddress | null;
  pickupBranch: SelectedPickupBranch | null;
  branchId: number | null;
  deliveryFee?: number | null;
  cakeDeliveryFee?: number;
  deliveryFeeLoading?: boolean;
  extraDeliveryFee?: number;
  onReferenceChange: (value: string) => void;
  onDelivery: (address: SelectedAddress, branchId: number) => void;
  onPickup: (branch: SelectedPickupBranch) => void;
  onChangePickup: () => void;
  onChangeAddress: () => void;
  onOpenMap: () => void;
}

export const CheckoutDestinationPicker = ({
  deliveryLabel = 'Delivery',
  deliveryType,
  address,
  pickupBranch,
  branchId,
  deliveryFee,
  cakeDeliveryFee = 0,
  deliveryFeeLoading = false,
  extraDeliveryFee,
  onReferenceChange,
  onDelivery,
  onPickup,
  onChangePickup,
  onChangeAddress,
  onOpenMap,
}: Props) => {
  const [query, setQuery] = useState('');
  const [candidate, setCandidate] = useState<AddressSuggestion | null>(null);
  const [coverage, setCoverage] = useState<CoverageResult | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [branchRetry, setBranchRetry] = useState(0);
  const [addressRetry, setAddressRetry] = useState(0);
  const requestId = useRef(0);
  const restorationKey = useRef('');
  const [referenceTouched, setReferenceTouched] = useState(false);

  useEffect(() => { setReferenceTouched(false); }, [address?.line1, address?.latitude, address?.longitude]);

  useEffect(() => {
    requestId.current += 1;
    setChecking(false);
    setCoverage(null);
    setError('');
  }, [deliveryType]);

  useEffect(() => {
    if (deliveryType !== 'PICKUP' || pickupBranch) return;
    let active = true;
    setLoadingBranches(true);
    geoApi.getBranches()
      .then((rows) => { if (active) { setBranches(rows.filter((branch) => branch.acceptsPickup)); setError(''); } })
      .catch(() => { if (active) setError('No pudimos cargar los locales. Vuelve a intentarlo.'); })
      .finally(() => { if (active) setLoadingBranches(false); });
    return () => { active = false; };
  }, [deliveryType, pickupBranch, branchRetry]);

  useEffect(() => () => { requestId.current += 1; }, []);

  useEffect(() => {
    if (deliveryType !== 'DELIVERY' || !address || branchId !== null) {
      restorationKey.current = '';
      return;
    }
    const key = `${address.line1}|${address.latitude}|${address.longitude}|${addressRetry}`;
    if (restorationKey.current === key) return;
    restorationKey.current = key;
    if (address.latitude == null || address.longitude == null) {
      setError('Esta dirección guardada no tiene un punto exacto. Elige otra o ajústala en el mapa.');
      return;
    }
    const current = ++requestId.current;
    setChecking(true);
    setError('');
    geoApi.checkCoverage({ latitude: address.latitude, longitude: address.longitude, districtId: address.districtId })
      .then((result) => {
        if (current !== requestId.current) return;
        setCoverage(result);
        if (result.covered && result.branch) onDelivery(address, result.branch.id);
        else setError(result.reason ?? 'Esta dirección está fuera de cobertura. Elige otra ubicación.');
      })
      .catch((requestError) => {
        if (current !== requestId.current) return;
        setError(axios.isAxiosError(requestError) && (requestError.response?.status ?? 0) >= 500
          ? 'No pudimos calcular el delivery ahora. Vuelve a intentarlo.'
          : getApiErrorMessage(requestError));
      })
      .finally(() => { if (current === requestId.current) setChecking(false); });
  }, [address, addressRetry, branchId, deliveryType, onDelivery]);

  const checkAddress = async (suggestion: AddressSuggestion) => {
    setCandidate(suggestion);
    setCoverage(null);
    setError('');
    const current = ++requestId.current;
    if (suggestion.latitude == null || suggestion.longitude == null) {
      setError('No pudimos ubicar esta dirección con precisión. Escribe calle, número y distrito, o marca el punto en el mapa.');
      return;
    }
    setChecking(true);
    try {
      const result = await geoApi.checkCoverage({
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        districtId: suggestion.districtId ?? undefined,
      });
      if (current !== requestId.current) return;
      setCoverage(result);
      if (!result.covered || !result.branch) {
        setError(result.reason ?? 'Esta dirección está fuera de nuestra cobertura de delivery.');
        return;
      }
      onDelivery({
        label: [suggestion.district, suggestion.province].filter(Boolean).join(', ') || 'Entrega',
        line1: suggestion.line1,
        districtId: suggestion.districtId ?? undefined,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude,
        hasHouseNumber: suggestion.hasHouseNumber,
      }, result.branch.id);
    } catch (requestError) {
      if (current !== requestId.current) return;
      setError(
        axios.isAxiosError(requestError) && (requestError.response?.status ?? 0) >= 500
          ? 'No pudimos calcular el delivery ahora. Tu búsqueda sigue aquí; vuelve a intentarlo.'
          : getApiErrorMessage(requestError),
      );
    } finally {
      if (current === requestId.current) setChecking(false);
    }
  };

  if (deliveryType === 'PICKUP') {
    return pickupBranch ? (
      <div className="flex items-start justify-between gap-3 rounded-card border border-brand-100 bg-brand-50/60 p-4 text-sm">
        <div>
          <p className="flex items-center gap-2 font-bold text-ink"><Store className="size-4 text-brand-700" />{pickupBranch.name}</p>
          <p className="mt-1 text-xs text-ink-muted">{pickupBranch.addressLine}</p>
          <p className="mt-2 text-xs font-semibold text-brand-800">Recojo gratis en taller</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onChangePickup}>
          Cambiar
        </Button>
      </div>
    ) : (
      <div className="grid gap-3 rounded-card border border-line bg-surface-muted/55 p-4">
        <p className="text-sm font-semibold text-ink">Elige el local donde recogerás tu pedido. El recojo es gratis.</p>
        {loadingBranches && <p role="status" className="text-xs text-ink-muted">Cargando locales…</p>}
        {error && <div className="flex flex-wrap items-center gap-2"><p role="alert" className="text-xs text-red-700">{error}</p><Button type="button" size="sm" variant="ghost" onClick={() => setBranchRetry((value) => value + 1)}>Reintentar</Button></div>}
        {!loadingBranches && !error && branches.length === 0 && <p className="text-xs text-ink-muted">No hay locales de recojo disponibles ahora.</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              onClick={() => onPickup({ id: branch.id, name: branch.name, addressLine: branch.addressLine })}
              className="rounded-card border border-line bg-white p-3 text-left transition hover:border-brand-500 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <span className="block text-sm font-bold text-ink">{branch.name}</span>
              <span className="mt-1 block text-xs text-ink-muted">{branch.addressLine}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-card border border-line bg-surface-muted/55 p-4">
      {address ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-ink">{branchId ? <CheckCircle2 className="size-4 text-brand-700" /> : <MapPin className="size-4 text-ink-muted" />}{address.line1}</p>
            <p className="mt-1 text-xs text-ink-muted">{address.label}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => { requestId.current += 1; onChangeAddress(); setQuery(''); setCandidate(null); setCoverage(null); setError(''); }}>
            Cambiar
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm font-semibold text-ink">Escribe tu dirección y selecciona una coincidencia.</p>
          <AddressAutocomplete
            value={query}
            onChange={(value) => { requestId.current += 1; setQuery(value); setCandidate(null); setCoverage(null); setError(''); setChecking(false); }}
            onSelect={(suggestion) => { setQuery(suggestion.line1); void checkAddress(suggestion); }}
            cityId={null}
            requireDistrict={false}
            label="Dirección de entrega"
            placeholder="Calle, número y distrito"
          />
          {checking && <p role="status" className="text-xs text-brand-800">Comprobando cobertura y costo de delivery…</p>}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {coverage?.nearestPickup && !coverage.covered && (
            <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => onPickup({ id: coverage.nearestPickup!.id, name: coverage.nearestPickup!.name, addressLine: coverage.nearestPickup!.addressLine })}>
              Recoger en {coverage.nearestPickup.name}
            </Button>
          )}
          {candidate && error && candidate.latitude != null && (
            <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => void checkAddress(candidate)}>
              Reintentar cálculo
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" className="w-fit" leftIcon={<MapPin className="size-4" />} onClick={onOpenMap}>
            Ajustar ubicación en el mapa
          </Button>
        </>
      )}
      {address && checking && <p role="status" className="text-xs text-brand-800">Actualizando cobertura de esta dirección…</p>}
      {address && error && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs text-red-700">{error}</p>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAddressRetry((value) => value + 1)}>Reintentar</Button>
        </div>
      )}
      {address && branchId && deliveryFee != null && (
        <div className="text-sm font-bold text-brand-800">
          <p>{deliveryLabel}: {formatCurrency(deliveryFee)}</p>
          {extraDeliveryFee ? <span className="ml-1 text-xs font-normal text-ink-muted">(incluye {formatCurrency(extraDeliveryFee)} por distancia adicional)</span> : null}
          {cakeDeliveryFee > 0 && <p className="mt-1 text-xs font-normal text-ink-muted">Incluye {formatCurrency(cakeDeliveryFee)} por manejo especial de torta.</p>}
        </div>
      )}
      {address && branchId && deliveryFee == null && deliveryFeeLoading && (
        <p role="status" className="text-sm text-ink-muted">Calculando delivery…</p>
      )}
      {address && (
        <Input
          id="checkout-address-reference"
          label="Referencia para el repartidor (opcional)"
          placeholder="Ej. puerta azul, frente al parque"
          value={address.reference ?? ''}
          onChange={(event) => onReferenceChange(event.target.value)}
          onBlur={() => setReferenceTouched(true)}
          maxLength={DELIVERY_REFERENCE_MAX_LENGTH}
          error={referenceTouched ? getDeliveryReferenceError(address) : undefined}
          hint="Puedes añadir una referencia si ayuda a ubicar la entrada."
        />
      )}
    </div>
  );
};
