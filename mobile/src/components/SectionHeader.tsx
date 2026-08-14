import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, layout, spacing, type } from '../theme/tokens';

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ eyebrow, title, description, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={layout.iconHitSlop}
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <MaterialCommunityIcons name="arrow-right" size={18} color={colors.brand700} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  copy: { flex: 1 },
  eyebrow: { ...type.label, color: colors.brand600, letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { ...type.title, color: colors.ink, marginTop: 4 },
  description: { ...type.bodySm, color: colors.inkMuted, marginTop: 5 },
  action: { minHeight: layout.minTouch, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: spacing.sm },
  actionText: { ...type.bodySm, color: colors.brand700, fontWeight: '900' },
  pressed: { opacity: 0.7 },
});
