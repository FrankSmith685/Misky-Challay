import { useEffect, useRef, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import { Building2, MapPin, Navigation, Search } from 'lucide-react';
import toast from '@components/mui/MuiToast';
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
  departmentName?: string;
  provinceName?: string;
  ubigeoCode?: string | null;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  requireDistrict?: boolean;
}

const precisionLabel = (suggestion: AddressSuggestion) => {
  if (suggestion.precision === 'exact') return 'Número exacto';
  if (suggestion.precision === 'near') return 'Calle cercana';
  if (suggestion.source === 'context') return 'Ubicar en mapa';
  return 'Punto aproximado';
};

/**
 * Autocomplete compartido para cobertura, cuenta y checkout.
 * En checkout permite buscar por calle y distrito en un solo campo.
 */
export const AddressAutocomplete = ({
  value,
  onChange,
  onSelect,
  cityId,
  cityName,
  districtId,
  districtName,
  departmentName,
  provinceName,
  ubigeoCode,
  label = 'Dirección exacta',
  placeholder = 'Ej. Av. José Larco 345',
  error,
  disabled = false,
  requireDistrict = true,
}: AddressAutocompleteProps) => {
  const [options, setOptions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [searchError, setSearchError] = useState('');
  const debounced = useDebounce(value.trim(), 350);
  const requestId = useRef(0);
  const canSearch = !requireDistrict || Boolean(districtName);

  useEffect(() => {
    if (!canSearch || debounced.length < 2) {
      setOptions([]);
      setSearchError('');
      return;
    }

    const currentRequest = ++requestId.current;
    setLoading(true);
    setSearchError('');
    geoApi
      .addressSuggestions({
        query: debounced,
        cityId: cityId ?? undefined,
        districtId: districtId ?? undefined,
        department: departmentName,
        province: provinceName,
        district: districtName,
      })
      .then((rows) => {
        if (requestId.current === currentRequest) setOptions(rows);
      })
      .catch((requestError) => {
        if (requestId.current !== currentRequest) return;
        setOptions([]);
        setSearchError(getApiErrorMessage(requestError));
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });
  }, [canSearch, cityId, departmentName, districtId, districtName, provinceName, debounced]);

  useEffect(() => {
    setOptions([]);
    setSearchError('');
    requestId.current += 1;
  }, [districtId]);

  const choose = async (suggestion: AddressSuggestion) => {
    if (suggestion.latitude !== null && suggestion.longitude !== null) {
      onChange(suggestion.line1);
      onSelect(suggestion);
      return;
    }
    setResolving(true);
    try {
      const resolved = await geoApi.resolveAddress({
        query: suggestion.line1,
        cityId: cityId ?? undefined,
        districtId: districtId ?? undefined,
        department: departmentName,
        province: provinceName,
        district: districtName,
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

  const helperText = error
    ?? (!canSearch
      ? 'Selecciona primero el distrito para activar las sugerencias.'
      : searchError
        ? 'No pudimos cargar coincidencias. Puedes escribir la dirección y marcarla en el mapa.'
        : loading || resolving
          ? `Buscando dentro de ${districtName ?? 'tu distrito'}…`
          : value.trim().length === 1
            ? 'Escribe un carácter más para comenzar la búsqueda.'
      : options.length > 0
              ? `${options.length} coincidencia${options.length === 1 ? '' : 's'}${districtName ? ` en ${districtName}` : ''}.`
              : districtName
                ? `Las sugerencias se limitarán a ${districtName}.`
                : 'Escribe la calle y el distrito; selecciona una coincidencia para calcular el delivery.');

  return (
    <Autocomplete<AddressSuggestion, false, false, true>
      freeSolo
      autoHighlight
      openOnFocus
      selectOnFocus
      clearOnBlur={false}
      disabled={disabled || !canSearch}
      options={options}
      loading={loading || resolving}
      inputValue={value}
      filterOptions={(rows) => rows}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.line1)}
      isOptionEqualToValue={(option, selected) =>
        typeof selected !== 'string' && option.id === selected.id
      }
      onInputChange={(_event, nextValue, reason) => {
        if (reason === 'input' || reason === 'clear') onChange(nextValue);
      }}
      onChange={(_event, nextValue) => {
        if (nextValue && typeof nextValue !== 'string') void choose(nextValue);
        if (typeof nextValue === 'string' && nextValue.trim().length >= 3) {
          void choose({
            id: `manual-${nextValue}`,
            label: [nextValue, districtName, cityName, 'Perú'].filter(Boolean).join(', '),
            line1: nextValue.trim(),
            district: districtName ?? null,
            districtId: districtId ?? null,
            ubigeoCode: ubigeoCode ?? null,
            city: provinceName ?? cityName ?? null,
            province: provinceName ?? cityName ?? null,
            region: departmentName ?? null,
            postcode: null,
            latitude: null,
            longitude: null,
            source: 'context',
            precision: 'manual',
            hasHouseNumber: /\d/.test(nextValue),
          });
        }
      }}
      noOptionsText={
        value.trim().length < 2
          ? 'Escribe al menos 2 caracteres'
          : 'No hay coincidencias todavía; continúa escribiendo'
      }
      loadingText="Buscando calles y numeraciones…"
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <span className="mr-3 grid size-10 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700 ring-1 ring-brand-100">
            {option.hasHouseNumber ? (
              <Building2 className="size-4" />
            ) : (
              <MapPin className="size-4" />
            )}
          </span>
          <span className="min-w-0 flex-1 py-0.5">
            <span className="block truncate text-sm font-extrabold text-ink">
              {option.line1}
            </span>
            <span className="mt-0.5 block truncate text-xs text-ink-muted">
              {[option.district, option.city, option.region]
                .filter((item): item is string => Boolean(item))
                .filter((item, index, all) => all.indexOf(item) === index)
                .join(' · ')}
            </span>
          </span>
          <Chip
            size="small"
            label={precisionLabel(option)}
            color={option.precision === 'exact' ? 'success' : 'default'}
            variant={option.precision === 'exact' ? 'filled' : 'outlined'}
            sx={{ ml: 1, display: { xs: 'none', sm: 'inline-flex' }, fontSize: 10 }}
          />
          {option.latitude !== null ? (
            <Navigation className="ml-2 size-4 shrink-0 text-brand-600" />
          ) : (
            <Search className="ml-2 size-4 shrink-0 text-ink-muted" />
          )}
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={canSearch ? placeholder : 'Elige un distrito para comenzar'}
          error={Boolean(error)}
          helperText={helperText}
          slotProps={{
            ...params.slotProps,
            formHelperText: {
              sx: { minHeight: 20, mt: 1, lineHeight: 1.45 },
            },
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {(loading || resolving) && <CircularProgress color="inherit" size={18} />}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
      slotProps={{
        paper: {
          sx: {
            mt: 1,
            overflow: 'hidden',
            borderRadius: 'var(--radius-card)',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 'var(--shadow-e4)',
            '& .MuiAutocomplete-listbox': { p: 1 },
            '& .MuiAutocomplete-option': {
              minHeight: 64,
              borderRadius: 'var(--radius-field)',
              px: 1.25,
              py: 1,
              '&[aria-selected="true"]': { bgcolor: 'primary.50' },
            },
          },
        },
      }}
    />
  );
};
