import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme/tokens';

export type MenuMode = 'ALL' | 'CUSTOM' | 'READY';

interface MenuModeSelectorProps {
  value?: MenuMode;
  onChange: (mode: MenuMode) => void;
  title?: string;
}

const options = [
  { value: 'ALL' as const, icon: 'view-grid-outline' as const, title: 'Todo' },
  { value: 'CUSTOM' as const, icon: 'cake-variant' as const, title: 'Personaliza' },
  { value: 'READY' as const, icon: 'chef-hat' as const, title: 'Clásicas' },
];

/** Selector compacto: el constructor es una categoría principal del menú. */
export function MenuModeSelector({ value = 'ALL', onChange, title = 'Explora el menú' }: MenuModeSelectorProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow}>ELIGE CÓMO EMPEZAR</Text>
      <Text style={styles.heading}>{title}</Text>
      <View style={styles.grid}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={option.title}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name={option.icon} size={20} color={selected ? colors.surface : colors.brand700} />
              <Text numberOfLines={1} style={[styles.cardTitle, selected && styles.cardTitleSelected]}>{option.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  eyebrow: { ...type.caption, color: colors.brand600, fontWeight: '900', letterSpacing: 1.1 },
  heading: { ...type.title, color: colors.ink },
  grid: { flexDirection: 'row', gap: spacing.sm },
  card: { minHeight: 50, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand100, backgroundColor: colors.brand50, paddingHorizontal: 7 },
  cardSelected: { borderColor: colors.brand700, backgroundColor: colors.brand700 },
  cardTitle: { ...type.caption, flexShrink: 1, color: colors.brand800, fontWeight: '900' },
  cardTitleSelected: { color: colors.surface },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
