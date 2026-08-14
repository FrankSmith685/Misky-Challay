import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, type } from '../theme/tokens';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

interface StatusPillProps {
  label: string;
  tone?: StatusTone;
  live?: boolean;
}

const palette: Record<StatusTone, { backgroundColor: string; color: string }> = {
  neutral: { backgroundColor: colors.surfaceMuted, color: colors.inkMuted },
  success: { backgroundColor: colors.success50, color: colors.success },
  warning: { backgroundColor: colors.warning50, color: colors.warning },
  danger: { backgroundColor: colors.danger50, color: colors.danger },
  info: { backgroundColor: colors.info50, color: colors.info },
};

export function StatusPill({ label, tone = 'neutral', live = false }: StatusPillProps) {
  const selected = palette[tone];
  return (
    <View style={[styles.pill, { backgroundColor: selected.backgroundColor }]}>
      {live ? <View style={[styles.dot, { backgroundColor: selected.color }]} /> : (
        <MaterialCommunityIcons name="circle-small" size={15} color={selected.color} />
      )}
      <Text numberOfLines={1} style={[styles.label, { color: selected.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', minHeight: 28, flexDirection: 'row', alignItems: 'center', borderRadius: radius.pill, paddingHorizontal: 9 },
  dot: { width: 7, height: 7, borderRadius: 4, marginRight: 6 },
  label: { ...type.caption, maxWidth: 130, fontWeight: '800', textTransform: 'uppercase' },
});
