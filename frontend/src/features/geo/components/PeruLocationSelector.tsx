import { useEffect, useMemo, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import type { AutocompleteRenderInputParams } from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import { geoApi } from '../services/geo.service';
import type { PeruDepartment, PeruDistrict, PeruProvince } from '../types';

export interface PeruLocationValue {
  departmentCode: string;
  provinceCode: string;
  districtCode: string;
}

export interface PeruLocationSelection {
  department: PeruDepartment | null;
  province: PeruProvince | null;
  district: PeruDistrict | null;
}

interface PeruLocationSelectorProps {
  value: PeruLocationValue;
  onChange: (value: PeruLocationValue) => void;
  onSelectionChange?: (selection: PeruLocationSelection) => void;
  disabled?: boolean;
  error?: string;
}

const EMPTY_VALUE: PeruLocationValue = {
  departmentCode: '',
  provinceCode: '',
  districtCode: '',
};

export const PeruLocationSelector = ({
  value,
  onChange,
  onSelectionChange,
  disabled = false,
  error,
}: PeruLocationSelectorProps) => {
  const [departments, setDepartments] = useState<PeruDepartment[]>([]);
  const [provinces, setProvinces] = useState<PeruProvince[]>([]);
  const [districts, setDistricts] = useState<PeruDistrict[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    setLoadingDepartments(true);
    geoApi
      .getDepartments()
      .then(setDepartments)
      .catch(() => setLoadError('No pudimos cargar los departamentos.'))
      .finally(() => setLoadingDepartments(false));
  }, []);

  useEffect(() => {
    if (!value.departmentCode) {
      setProvinces([]);
      return;
    }
    let active = true;
    setLoadingProvinces(true);
    setLoadError('');
    geoApi
      .getProvinces(value.departmentCode)
      .then((rows) => {
        if (active) setProvinces(rows);
      })
      .catch(() => {
        if (active) setLoadError('No pudimos cargar las provincias.')
      })
      .finally(() => {
        if (active) setLoadingProvinces(false);
      });
    return () => {
      active = false;
    };
  }, [value.departmentCode]);

  useEffect(() => {
    if (!value.provinceCode) {
      setDistricts([]);
      return;
    }
    let active = true;
    setLoadingDistricts(true);
    setLoadError('');
    geoApi
      .getGeographicDistricts(value.provinceCode)
      .then((rows) => {
        if (active) setDistricts(rows);
      })
      .catch(() => {
        if (active) setLoadError('No pudimos cargar los distritos.')
      })
      .finally(() => {
        if (active) setLoadingDistricts(false);
      });
    return () => {
      active = false;
    };
  }, [value.provinceCode]);

  const selection = useMemo<PeruLocationSelection>(
    () => ({
      department: departments.find((row) => row.code === value.departmentCode) ?? null,
      province: provinces.find((row) => row.code === value.provinceCode) ?? null,
      district: districts.find((row) => row.code === value.districtCode) ?? null,
    }),
    [departments, districts, provinces, value],
  );

  useEffect(() => {
    onSelectionChange?.(selection);
  }, [onSelectionChange, selection]);

  const textField = (
    label: string,
    placeholder: string,
    loading: boolean,
    helperText?: string,
  ) => (params: AutocompleteRenderInputParams) => (
    <TextField
      {...params}
      label={label}
      placeholder={placeholder}
      error={Boolean(error || loadError)}
      helperText={helperText}
      slotProps={{
        ...params.slotProps,
        formHelperText: { sx: { minHeight: helperText ? 20 : 0, mt: 0.75 } },
        input: {
          ...params.slotProps.input,
          endAdornment: (
            <>
              {loading && <CircularProgress color="inherit" size={17} />}
              {params.slotProps.input.endAdornment}
            </>
          ),
        },
      }}
    />
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Autocomplete
        disablePortal
        options={departments}
        value={selection.department}
        loading={loadingDepartments}
        disabled={disabled}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, selected) => option.code === selected.code}
        onChange={(_event, next) =>
          onChange(next
            ? { departmentCode: next.code, provinceCode: '', districtCode: '' }
            : EMPTY_VALUE)
        }
        renderInput={textField(
          'Departamento',
          'Elige departamento',
          loadingDepartments,
          error || loadError || undefined,
        )}
      />

      <Autocomplete
        disablePortal
        options={provinces}
        value={selection.province}
        loading={loadingProvinces}
        disabled={disabled || !value.departmentCode}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, selected) => option.code === selected.code}
        onChange={(_event, next) =>
          onChange({
            departmentCode: value.departmentCode,
            provinceCode: next?.code ?? '',
            districtCode: '',
          })
        }
        renderInput={textField(
          'Provincia',
          value.departmentCode ? 'Elige provincia' : 'Primero el departamento',
          loadingProvinces,
        )}
      />

      <Autocomplete
        disablePortal
        options={districts}
        value={selection.district}
        loading={loadingDistricts}
        disabled={disabled || !value.provinceCode}
        getOptionLabel={(option) => option.name}
        isOptionEqualToValue={(option, selected) => option.code === selected.code}
        onChange={(_event, next) =>
          onChange({
            departmentCode: value.departmentCode,
            provinceCode: value.provinceCode,
            districtCode: next?.code ?? '',
          })
        }
        renderInput={textField(
          'Distrito',
          value.provinceCode ? 'Elige distrito' : 'Primero la provincia',
          loadingDistricts,
        )}
      />
    </div>
  );
};
