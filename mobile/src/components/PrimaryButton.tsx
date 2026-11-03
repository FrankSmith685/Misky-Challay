import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type PressableProps } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme/tokens';

interface PrimaryButtonProps extends PressableProps {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  trailingIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  haptic?: boolean;
}

export function PrimaryButton({ label, loading = false, variant = 'primary', icon, trailingIcon, haptic = true, disabled, style, onPress, ...props }: PrimaryButtonProps) {
  const blocked = disabled || loading;
  const secondary = variant === 'secondary' || variant === 'ghost';
  const foreground = secondary ? colors.brand700 : colors.surface;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={blocked}
      onPress={(event) => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(event);
      }}
      style={(state) => [
        styles.base,
        styles[variant],
        state.pressed && !blocked && styles.pressed,
        blocked && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={foreground} /> : (
        <View style={styles.content}>
          {icon ? <MaterialCommunityIcons name={icon} size={20} color={foreground} /> : null}
          <Text style={[styles.label, secondary && styles.labelSecondary]}>{label}</Text>
          {trailingIcon ? <MaterialCommunityIcons name={trailingIcon} size={20} color={foreground} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 56, paddingHorizontal: 20, borderRadius: radius.md + 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  primary: { backgroundColor: colors.brand600, borderColor: colors.brand600, ...shadow.sm },
  secondary: { backgroundColor: colors.surface, borderColor: '#b7dcf5' },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  label: { color: colors.surface, fontSize: 15, fontWeight: '900', letterSpacing: .1 },
  labelSecondary: { color: colors.brand700 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.55 },
});
