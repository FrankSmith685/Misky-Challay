import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { Chip } from './Chip';
import { PrimaryButton } from './PrimaryButton';
import { Skeleton } from './Skeleton';
import { colors, radius, spacing, type } from '../theme/tokens';
import type { Allergen, DietaryTag, FoodPreferences } from '../types/domain';

/** Filtros de preferencias y alérgenos del menú. */
export interface CatalogFilterState {
  dietaryTags: string[];
  excludeAllergens: string[];
}

export const EMPTY_CATALOG_FILTERS: CatalogFilterState = {
  dietaryTags: [],
  excludeAllergens: [],
};

export function countCatalogFilters(state: CatalogFilterState): number {
  return state.dietaryTags.length + state.excludeAllergens.length;
}

export interface CatalogFiltersProps {
  visible: boolean;
  onClose: () => void;
  value: CatalogFilterState;
  onApply: (next: CatalogFilterState) => void;
  dietaryTags: DietaryTag[];
  allergens: Allergen[];
  loading?: boolean;
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
  const [draft, setDraft] = useState<CatalogFilterState>(value);

  // El borrador se sincroniza al abrir: si el cliente cierra sin aplicar, lo que
  // tocÃ³ se descarta y la prÃ³xima vez vuelve a ver lo que de verdad estÃ¡ puesto.
  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  const active = countCatalogFilters(draft);

  const hasProfile =
    preferences !== null &&
    preferences !== undefined &&
    (preferences.dietaryTags.length > 0 || preferences.allergens.length > 0);

  const applyProfile = useCallback(() => {
    if (!preferences) return;
    setDraft({
      dietaryTags: [...preferences.dietaryTags],
      excludeAllergens: [...preferences.allergens],
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
      title="Filtrar menÃº"
      subtitle="Cruzamos tus preferencias con la carta de la cocina seleccionada."
      maxHeightRatio={0.92}
      footer={
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
      }
    >
      <ScrollView
        style={styles.scroll}
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
              empty={dietaryTags.length === 0 ? 'La cocina aÃºn no publica etiquetas.' : undefined}
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

            <FilterGroup
              label="Excluir alÃ©rgenos"
              hint="Ocultamos los platos que lo declaran."
              empty={allergens.length === 0 ? 'No hay alÃ©rgenos declarados.' : undefined}
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
                Preparamos todo en una misma cocina, asÃ­ que no podemos descartar trazas. Si tu
                alergia es severa, avÃ­sanos en las notas del pedido.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

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
  /** Filtros de preferencias y alérgenos del menú. */
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
  scroll: {
    flexShrink: 1,
  },
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
  },
  clear: {
    flex: 1,
  },
  confirm: {
    flex: 2,
  },
});

