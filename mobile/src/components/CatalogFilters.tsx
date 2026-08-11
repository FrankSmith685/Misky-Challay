import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { Chip } from './Chip';
import { PrimaryButton } from './PrimaryButton';
import { Skeleton } from './Skeleton';
import { colors, radius, spacing, type } from '../theme/tokens';
import type { Allergen, DietaryTag, FoodPreferences } from '../types/domain';

/**
 * Filtros dietéticos del menú, los mismos que acepta GET /catalog/products
 * (dietaryTags, excludeAllergens, maxCalories y minProtein). En la web viven en
 * una barra desplegable; en el móvil no cabe: van en una hoja inferior que se
 * arrastra, se edita en borrador y solo se aplica al confirmar, para no lanzar
 * una petición por cada toque.
 */
export interface CatalogFilterState {
  /** Códigos de etiqueta dietética: el plato debe tenerlas TODAS. */
  dietaryTags: string[];
  /** Códigos de alérgeno: el plato no debe tener NINGUNO. */
  excludeAllergens: string[];
  maxCalories: number | null;
  minProtein: number | null;
}

export const EMPTY_CATALOG_FILTERS: CatalogFilterState = {
  dietaryTags: [],
  excludeAllergens: [],
  maxCalories: null,
  minProtein: null,
};

/** Cuántos filtros dietéticos hay puestos: alimenta el contador del botón «Filtros». */
export function countCatalogFilters(state: CatalogFilterState): number {
  return (
    state.dietaryTags.length +
    state.excludeAllergens.length +
    (state.maxCalories === null ? 0 : 1) +
    (state.minProtein === null ? 0 : 1)
  );
}

/** Los mismos escalones que ofrece la web, para que un cliente vea lo mismo en ambos sitios. */
const CALORIE_STEPS = [400, 500, 600] as const;
const PROTEIN_STEPS = [15, 25, 35] as const;

export interface CatalogFiltersProps {
  visible: boolean;
  onClose: () => void;
  /** Filtros aplicados ahora mismo. La hoja parte de aquí cada vez que se abre. */
  value: CatalogFilterState;
  onApply: (next: CatalogFilterState) => void;
  dietaryTags: DietaryTag[];
  allergens: Allergen[];
  loading?: boolean;
  /**
   * Perfil alimentario del cliente (GET /account/food-preferences). Si lo tiene
   * guardado, puede volcarlo en los filtros de un toque en vez de repetirlo aquí.
   */
  preferences?: FoodPreferences | null;
}

const toggleCode = (list: string[], code: string): string[] =>
  list.includes(code) ? list.filter((item) => item !== code) : [...list, code];

export function CatalogFilters({
  visible,
  onClose,
  value,
  onApply,
  dietaryTags,
  allergens,
  loading = false,
  preferences,
}: CatalogFiltersProps) {
  const { height } = useWindowDimensions();
  const [draft, setDraft] = useState<CatalogFilterState>(value);

  // El borrador se sincroniza al abrir: si el cliente cierra sin aplicar, lo que
  // tocó se descarta y la próxima vez vuelve a ver lo que de verdad está puesto.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  const active = countCatalogFilters(draft);

  const hasProfile =
    preferences !== null &&
    preferences !== undefined &&
    (preferences.dietaryTags.length > 0 ||
      preferences.allergens.length > 0 ||
      preferences.calorieTarget !== null ||
      preferences.proteinTarget !== null);

  const applyProfile = useCallback(() => {
    if (!preferences) return;
    setDraft({
      dietaryTags: [...preferences.dietaryTags],
      excludeAllergens: [...preferences.allergens],
      maxCalories: preferences.calorieTarget,
      minProtein: preferences.proteinTarget,
    });
  }, [preferences]);

  const confirm = () => {
    onApply(draft);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Filtrar el menú"
      subtitle="Cruzamos tus preferencias con la carta de la cocina seleccionada."
      maxHeightRatio={0.92}
    >
      <ScrollView
        style={{ maxHeight: height * 0.52 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <Skeleton height={38} rounded="pill" count={5} gap={spacing.sm + spacing.xs} />
        ) : (
          <>
            {hasProfile && (
              <Chip
                icon="account-heart-outline"
                label="Usar mi perfil alimentario"
                onPress={applyProfile}
                style={styles.profileChip}
              />
            )}

            <FilterGroup
              label="Preferencias"
              hint="El plato debe cumplirlas todas."
              empty={dietaryTags.length === 0 ? 'La cocina aún no publica etiquetas.' : undefined}
            >
              {dietaryTags.map((tag) => (
                <Chip
                  key={tag.code}
                  size="sm"
                  label={tag.name}
                  selected={draft.dietaryTags.includes(tag.code)}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      dietaryTags: toggleCode(current.dietaryTags, tag.code),
                    }))
                  }
                />
              ))}
            </FilterGroup>

            <FilterGroup label="Calorías máximas">
              {CALORIE_STEPS.map((step) => (
                <Chip
                  key={step}
                  size="sm"
                  label={`Hasta ${step} kcal`}
                  selected={draft.maxCalories === step}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      maxCalories: current.maxCalories === step ? null : step,
                    }))
                  }
                />
              ))}
            </FilterGroup>

            <FilterGroup label="Proteína mínima">
              {PROTEIN_STEPS.map((step) => (
                <Chip
                  key={step}
                  size="sm"
                  label={`${step} g o más`}
                  selected={draft.minProtein === step}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      minProtein: current.minProtein === step ? null : step,
                    }))
                  }
                />
              ))}
            </FilterGroup>

            <FilterGroup
              label="Excluir alérgenos"
              hint="Ocultamos los platos que lo declaran."
              empty={allergens.length === 0 ? 'No hay alérgenos declarados.' : undefined}
            >
              {allergens.map((allergen) => (
                <Chip
                  key={allergen.code}
                  size="sm"
                  tone="danger"
                  label={allergen.name}
                  selected={draft.excludeAllergens.includes(allergen.code)}
                  onPress={() =>
                    setDraft((current) => ({
                      ...current,
                      excludeAllergens: toggleCode(current.excludeAllergens, allergen.code),
                    }))
                  }
                />
              ))}
            </FilterGroup>

            {/* RN-009: informamos de lo declarado; no podemos garantizar la ausencia de trazas. */}
            <View style={styles.notice}>
              <MaterialCommunityIcons
                name="information-outline"
                size={19}
                color={colors.warning}
              />
              <Text style={styles.noticeText}>
                Preparamos todo en una misma cocina, así que no podemos descartar trazas. Si tu
                alergia es severa, avísanos en las notas del pedido.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.actions}>
        <PrimaryButton
          label="Limpiar"
          variant="secondary"
          disabled={active === 0}
          onPress={() => setDraft(EMPTY_CATALOG_FILTERS)}
          style={styles.clear}
        />
        <PrimaryButton
          label={active > 0 ? `Ver resultados (${active})` : 'Ver resultados'}
          onPress={confirm}
          style={styles.confirm}
        />
      </View>
    </BottomSheet>
  );
}

function FilterGroup({
  label,
  hint,
  empty,
  children,
}: {
  label: string;
  hint?: string;
  /** Texto a mostrar cuando el backend no devolvió opciones para este grupo. */
  empty?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {hint ? <Text style={styles.groupHint}>{hint}</Text> : null}
      {empty ? (
        <Text style={styles.groupEmpty}>{empty}</Text>
      ) : (
        <View style={styles.groupChips}>{children}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.md,
  },
  profileChip: {
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  group: {
    marginBottom: spacing.lg,
  },
  groupLabel: {
    ...type.label,
    color: colors.brand700,
    textTransform: 'uppercase',
  },
  groupHint: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  groupEmpty: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: spacing.sm,
  },
  groupChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm + spacing.xs,
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: '#fff7e5',
    padding: spacing.sm + spacing.xs,
  },
  noticeText: {
    ...type.bodySm,
    flex: 1,
    color: '#7a4d00',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    paddingTop: spacing.md,
  },
  clear: {
    flex: 1,
  },
  confirm: {
    flex: 2,
  },
});
