import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';
import { colors, radius } from '../theme/tokens';

interface PrimaryButtonProps extends PressableProps {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

export function PrimaryButton({ label, loading = false, variant = 'primary', disabled, style, ...props }: PrimaryButtonProps) {
  const blocked = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={blocked}
      style={(state) => [
        styles.base,
        styles[variant],
        state.pressed && !blocked && styles.pressed,
        blocked && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? colors.brand700 : colors.surface} /> : (
        <Text style={[styles.label, (variant === 'secondary' || variant === 'ghost') && styles.labelSecondary]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 52, paddingHorizontal: 20, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  primary: { backgroundColor: colors.brand600, borderColor: colors.brand600 },
  secondary: { backgroundColor: colors.surface, borderColor: '#b8d5c6' },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  label: { color: colors.surface, fontSize: 15, fontWeight: '800' },
  labelSecondary: { color: colors.brand700 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.992 }] },
  disabled: { opacity: 0.55 },
});
