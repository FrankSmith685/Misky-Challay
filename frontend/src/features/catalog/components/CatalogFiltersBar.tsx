import { useState, type ReactNode } from 'react';
import {
  Box,
  Chip,
  Collapse,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ChevronDown, Heart, Search, SlidersHorizontal, Sparkles, UtensilsCrossed, X } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import {
  resetFilters,
  setFilters,
  toggleDietaryTag,
  toggleExcludedAllergen,
  toggleOnlyFavorites,
} from '../catalogSlice';

/** Buscador y filtros progresivos: lo frecuente siempre visible, lo específico bajo demanda. */
export const CatalogFiltersBar = () => {
  const dispatch = useAppDispatch();
  const { categories, tags, allergens, filters } = useAppSelector((state) => state.catalog);
  const favoritesCount = useAppSelector((state) => state.favorites.items.length);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeAdvanced = filters.dietaryTags.length + filters.excludeAllergens.length;
  const activeTotal =
    activeAdvanced +
    (filters.search.trim() ? 1 : 0) +
    (filters.categoryId !== null ? 1 : 0) +
    (filters.productMode !== 'ALL' ? 1 : 0) +
    (filters.onlyFavorites ? 1 : 0);

  return (
    <Paper
      component="section"
      aria-label="Buscar y filtrar el menú"
      variant="outlined"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-card)',
        borderColor: 'var(--color-line)',
        boxShadow: 'var(--shadow-e2)',
        '&::before': {
          content: '""', position: 'absolute', inset: '0 0 auto', height: 3,
          background: 'linear-gradient(90deg, var(--color-brand-600) 0 68%, var(--color-accent-400) 68%)',
        },
      }}
    >
      <Box sx={{ p: { xs: 2, sm: 2.75 } }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          sx={{ alignItems: { md: 'stretch' } }}
        >
          <TextField
            type="search"
            value={filters.search}
            onChange={(event) => dispatch(setFilters({ search: event.target.value }))}
            placeholder="Buscar tortas o ingredientes"
            fullWidth
            slotProps={{
              htmlInput: { 'aria-label': 'Buscar platos o ingredientes' },
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={19} />
                  </InputAdornment>
                ),
              },
            }}
            sx={{
              flex: 1,
              // Misma altura que la escala de Button (md): en /menu no conviven tres alturas.
              '& .MuiOutlinedInput-root': {
                minHeight: 44,
                bgcolor: 'background.default',
                borderRadius: 'var(--radius-field)',
              },
            }}
          />
          <Button
            variant={showAdvanced ? 'primary' : 'outline'}
            onClick={() => setShowAdvanced((visible) => !visible)}
            leftIcon={<SlidersHorizontal size={17} />}
            endIcon={
              <ChevronDown
                size={16}
                style={{
                  transform: showAdvanced ? 'rotate(180deg)' : undefined,
                  transition: 'transform 180ms',
                }}
              />
            }
            aria-expanded={showAdvanced}
            aria-controls="catalog-advanced-filters"
          >
            Filtros {activeAdvanced > 0 ? `(${activeAdvanced})` : ''}
          </Button>
          {activeTotal > 0 && (
            <Button variant="ghost" onClick={() => dispatch(resetFilters())} leftIcon={<X size={16} />}>
              Limpiar
            </Button>
          )}
        </Stack>

        <Box sx={{ mt: 2.25 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: 'block', mb: 1, fontSize: 11, fontWeight: 850, letterSpacing: '.12em' }}
          >
            Elige cómo quieres pedir
          </Typography>
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              overflowX: 'auto',
              pb: .5,
              scrollbarWidth: 'thin',
              '& .MuiChip-root': { flexShrink: 0, minHeight: 36 },
            }}
          >
            {/* Los favoritos se marcan desde el menú: aquí también se pueden usar. */}
            {favoritesCount > 0 && (
              <>
                <Chip
                  icon={<Heart size={13} fill={filters.onlyFavorites ? 'currentColor' : 'none'} />}
                  label={`Mis favoritos (${favoritesCount})`}
                  clickable
                  color={filters.onlyFavorites ? 'error' : 'default'}
                  variant={filters.onlyFavorites ? 'filled' : 'outlined'}
                  aria-pressed={filters.onlyFavorites}
                  onClick={() => dispatch(toggleOnlyFavorites())}
                  sx={{ borderRadius: 'var(--radius-pill)', fontWeight: 800 }}
                />
                <Box
                  aria-hidden="true"
                  sx={{ alignSelf: 'center', flexShrink: 0, width: '1px', height: 22, bgcolor: 'divider' }}
                />
              </>
            )}
            <CategoryChip
              label="Todo el menú"
              active={filters.productMode === 'ALL' && filters.categoryId === null}
              onClick={() => dispatch(setFilters({ productMode: 'ALL', categoryId: null }))}
            />
            <Chip
              icon={<Sparkles size={14} />}
              label="Arma tu bowl"
              clickable
              color={filters.productMode === 'CUSTOM' ? 'primary' : 'default'}
              variant={filters.productMode === 'CUSTOM' ? 'filled' : 'outlined'}
              aria-pressed={filters.productMode === 'CUSTOM'}
              onClick={() => dispatch(setFilters({ productMode: 'CUSTOM', categoryId: null, onlyFavorites: false }))}
              sx={{ borderRadius: 'var(--radius-pill)', fontWeight: 800 }}
            />
            <Chip
              icon={<UtensilsCrossed size={14} />}
              label="Platos listos"
              clickable
              color={filters.productMode === 'READY' ? 'primary' : 'default'}
              variant={filters.productMode === 'READY' ? 'filled' : 'outlined'}
              aria-pressed={filters.productMode === 'READY'}
              onClick={() => dispatch(setFilters({ productMode: 'READY', categoryId: null }))}
              sx={{ borderRadius: 'var(--radius-pill)', fontWeight: 800 }}
            />
            <Box
              aria-hidden="true"
              sx={{ alignSelf: 'center', flexShrink: 0, width: '1px', height: 22, bgcolor: 'divider' }}
            />
            {categories.map((category) => (
              <CategoryChip
                key={category.id}
                label={category.name}
                active={filters.productMode === 'ALL' && filters.categoryId === category.id}
                onClick={() => dispatch(setFilters({ productMode: 'ALL', categoryId: category.id }))}
              />
            ))}
          </Box>
        </Box>
      </Box>

      <Collapse in={showAdvanced}>
        <Box
          id="catalog-advanced-filters"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(4,1fr)' },
            gap: { xs: 2.5, sm: 3 },
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: 'rgba(245,237,245,.65)',
            p: { xs: 2, sm: 2.75 },
          }}
        >
          <FilterGroup label="Preferencias">
            {tags.map((tag) => {
              const active = filters.dietaryTags.includes(tag.code);
              return (
                <Chip
                  key={tag.code}
                  label={tag.name}
                  size="small"
                  clickable
                  color={active ? 'primary' : 'default'}
                  variant={active ? 'filled' : 'outlined'}
                  onClick={() => dispatch(toggleDietaryTag(tag.code))}
                  sx={{ borderRadius: 'var(--radius-pill)' }}
                />
              );
            })}
          </FilterGroup>

          <FilterGroup label="Excluir alérgenos">
            {allergens.map((allergen) => {
              const active = filters.excludeAllergens.includes(allergen.code);
              return (
                <Chip
                  key={allergen.code}
                  label={allergen.name}
                  size="small"
                  clickable
                  color={active ? 'error' : 'default'}
                  variant={active ? 'filled' : 'outlined'}
                  onClick={() => dispatch(toggleExcludedAllergen(allergen.code))}
                  sx={{ borderRadius: 'var(--radius-pill)' }}
                />
              );
            })}
          </FilterGroup>
        </Box>
      </Collapse>
    </Paper>
  );
};

const CategoryChip = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <Chip
    label={label}
    clickable
    color={active ? 'primary' : 'default'}
    variant={active ? 'filled' : 'outlined'}
    onClick={onClick}
    sx={{ borderRadius: 'var(--radius-pill)', fontWeight: active ? 800 : 650 }}
  />
);

const FilterGroup = ({ label, children }: { label: string; children: ReactNode }) => (
  <Box>
    <Typography
      variant="overline"
      color="text.secondary"
      sx={{ fontSize: 11, fontWeight: 850, letterSpacing: '.1em' }}
    >
      {label}
    </Typography>
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: .75, mt: .9 }}>{children}</Box>
  </Box>
);
