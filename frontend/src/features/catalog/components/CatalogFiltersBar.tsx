import { useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Collapse,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { resetFilters, setFilters, toggleDietaryTag, toggleExcludedAllergen } from '../catalogSlice';

const CALORIE_STEPS = [400, 500, 600];

/** Buscador y filtros progresivos del catálogo, construidos con controles MUI. */
export const CatalogFiltersBar = () => {
  const dispatch = useAppDispatch();
  const { categories, tags, allergens, filters } = useAppSelector((state) => state.catalog);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeAdvanced = filters.dietaryTags.length + filters.excludeAllergens.length + (filters.maxCalories ? 1 : 0);
  const hasFilters = filters.search !== '' || filters.categoryId !== null || activeAdvanced > 0;

  return (
    <Paper variant="outlined" sx={{ mb: 4, overflow: 'hidden', borderRadius: 4, boxShadow: '0 12px 36px rgba(20,32,26,.055)' }}>
      <Box sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
          <TextField
            type="search"
            value={filters.search}
            onChange={(event) => dispatch(setFilters({ search: event.target.value }))}
            placeholder="Busca bowls, wraps o ingredientes"
            fullWidth
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search size={18} /></InputAdornment> } }}
            sx={{ flex: 1 }}
          />
          <Button
            variant={showAdvanced ? 'contained' : 'outlined'}
            onClick={() => setShowAdvanced((visible) => !visible)}
            startIcon={<SlidersHorizontal size={17} />}
            endIcon={<ChevronDown size={16} style={{ transform: showAdvanced ? 'rotate(180deg)' : undefined, transition: 'transform 180ms' }} />}
          >
            Filtros {activeAdvanced > 0 ? `(${activeAdvanced})` : ''}
          </Button>
          {hasFilters && (
            <Button color="inherit" onClick={() => dispatch(resetFilters())} startIcon={<X size={16} />}>
              Limpiar
            </Button>
          )}
        </Stack>

        <Box sx={{ display: 'flex', gap: 1, mt: 2, overflowX: 'auto', pb: .25, scrollbarWidth: 'thin' }}>
          <Chip
            label="Todo"
            clickable
            color={filters.categoryId === null ? 'primary' : 'default'}
            variant={filters.categoryId === null ? 'filled' : 'outlined'}
            onClick={() => dispatch(setFilters({ categoryId: null }))}
          />
          {categories.map((category) => {
            const active = filters.categoryId === category.id;
            return (
              <Chip
                key={category.id}
                label={category.name}
                clickable
                color={active ? 'primary' : 'default'}
                variant={active ? 'filled' : 'outlined'}
                onClick={() => dispatch(setFilters({ categoryId: category.id }))}
              />
            );
          })}
        </Box>
      </Box>

      <Collapse in={showAdvanced}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,1fr)' }, gap: 2.5, p: { xs: 2, sm: 2.5 }, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
          <FilterGroup label="Preferencias">
            {tags.map((tag) => {
              const active = filters.dietaryTags.includes(tag.code);
              return <Chip key={tag.code} label={tag.name} size="small" clickable color={active ? 'primary' : 'default'} variant={active ? 'filled' : 'outlined'} onClick={() => dispatch(toggleDietaryTag(tag.code))} />;
            })}
          </FilterGroup>

          <FilterGroup label="Calorías máximas">
            {CALORIE_STEPS.map((value) => {
              const active = filters.maxCalories === value;
              return <Chip key={value} label={`Hasta ${value} kcal`} size="small" clickable color={active ? 'primary' : 'default'} variant={active ? 'filled' : 'outlined'} onClick={() => dispatch(setFilters({ maxCalories: active ? null : value }))} />;
            })}
          </FilterGroup>

          <FilterGroup label="Excluir alérgenos">
            {allergens.map((allergen) => {
              const active = filters.excludeAllergens.includes(allergen.code);
              return <Chip key={allergen.code} label={allergen.name} size="small" clickable color={active ? 'error' : 'default'} variant={active ? 'filled' : 'outlined'} onClick={() => dispatch(toggleExcludedAllergen(allergen.code))} />;
            })}
          </FilterGroup>
        </Box>
      </Collapse>
    </Paper>
  );
};

const FilterGroup = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Box>
    <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>{label}</Typography>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: .75, mt: .75 }}>{children}</Box>
  </Box>
);
