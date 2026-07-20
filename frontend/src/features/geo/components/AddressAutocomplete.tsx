import { useEffect, useRef, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { MapPin, Navigation, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useDebounce } from '@hooks/useDebounce';
import { getApiErrorMessage } from '@services/api/client';
import { geoApi } from '../services/geo.service';
import type { AddressSuggestion } from '../types';

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  cityId: number | null;
  cityName?: string;
  districtId?: number | null;
  districtName?: string;
  label?: string;
  placeholder?: string;
  error?: string;
}

/** Entrada contextual: ciudad/distrito primero, direccion verificada despues. */
export const AddressAutocomplete = ({
  value,
  onChange,
  onSelect,
  cityId,
  cityName,
  districtId,
  districtName,
  label = 'Dirección exacta',
  placeholder = 'Ej. Av. José Larco 345',
  error,
}: AddressAutocompleteProps) => {
  const [options, setOptions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const debounced = useDebounce(value.trim(), 500);
  const requestId = useRef(0);

  useEffect(() => {
    if (!cityId || debounced.length < 3) {
      setOptions([]);
      return;
    }
    const currentRequest = ++requestId.current;
    setLoading(true);
    geoApi.addressSuggestions({ query: debounced, cityId, districtId: districtId ?? undefined })
      .then((rows) => { if (requestId.current === currentRequest) setOptions(rows); })
      .catch(() => { if (requestId.current === currentRequest) setOptions([]); })
      .finally(() => { if (requestId.current === currentRequest) setLoading(false); });
  }, [cityId, districtId, debounced]);

  const choose = async (suggestion: AddressSuggestion) => {
    if (suggestion.latitude !== null && suggestion.longitude !== null) {
      onChange(suggestion.line1);
      onSelect(suggestion);
      return;
    }
    if (!cityId) return;
    setResolving(true);
    try {
      const resolved = await geoApi.resolveAddress({
        query: suggestion.line1,
        cityId,
        districtId: districtId ?? undefined,
      });
      if (!resolved) {
        onSelect(suggestion);
        toast('No encontramos el número exacto; marca la entrada en el mapa.');
        return;
      }
      onChange(resolved.line1);
      onSelect(resolved);
    } catch (requestError) {
      toast.error(getApiErrorMessage(requestError));
    } finally {
      setResolving(false);
    }
  };

  return (
    <Autocomplete<AddressSuggestion, false, false, true>
      freeSolo
      options={options}
      loading={loading || resolving}
      inputValue={value}
      filterOptions={(rows) => rows}
      getOptionLabel={(option) => typeof option === 'string' ? option : option.label}
      isOptionEqualToValue={(option, selected) => typeof selected !== 'string' && option.id === selected.id}
      onInputChange={(_event, nextValue, reason) => {
        if (reason === 'input' || reason === 'clear') onChange(nextValue);
      }}
      onChange={(_event, nextValue) => {
        if (nextValue && typeof nextValue !== 'string') void choose(nextValue);
        if (typeof nextValue === 'string' && nextValue.trim().length >= 5) {
          void choose({
            id: `manual-${nextValue}`,
            label: [nextValue, districtName, cityName, 'Perú'].filter(Boolean).join(', '),
            line1: nextValue.trim(),
            district: districtName ?? null,
            districtId: districtId ?? null,
            city: cityName ?? null,
            latitude: null,
            longitude: null,
            source: 'context',
          });
        }
      }}
      noOptionsText={value.trim().length < 3 ? 'Escribe al menos 3 caracteres' : 'Sigue escribiendo o marca el punto en el mapa'}
      loadingText="Buscando direcciones..."
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <span className="mr-3 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><MapPin className="size-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{option.line1}</span>
            <span className="block truncate text-xs text-ink-muted">{option.label}</span>
          </span>
          {option.latitude !== null ? <Navigation className="ml-2 size-4 shrink-0 text-brand-600" /> : <Search className="ml-2 size-4 shrink-0 text-ink-muted" />}
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={Boolean(error)}
          helperText={error ?? (districtName ? `Buscando en ${districtName}, ${cityName ?? 'Lima'}, Perú` : 'Selecciona el distrito para obtener mejores resultados')}
        />
      )}
      slotProps={{ paper: { sx: { mt: 1, borderRadius: 3, border: '1px solid', borderColor: 'divider', boxShadow: '0 18px 45px rgba(20,55,37,.14)', '& .MuiAutocomplete-option': { py: 1.25 } } } }}
    />
  );
};
