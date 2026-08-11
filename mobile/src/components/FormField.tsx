import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, type } from '../theme/tokens';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
}

export function FormField({ label, error, hint, icon, secureTextEntry, style, ...props }: FormFieldProps) {
  const [showSecret, setShowSecret] = useState(false);
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, error && styles.fieldError]}>
        {icon && <MaterialCommunityIcons name={icon} color={colors.inkMuted} size={19} />}
        <TextInput
          placeholderTextColor="#87938d"
          secureTextEntry={secureTextEntry && !showSecret}
          style={[styles.input, style]}
          {...props}
        />
        {secureTextEntry && (
          <Pressable hitSlop={10} onPress={() => setShowSecret((value) => !value)} accessibilityLabel={showSecret ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
            <MaterialCommunityIcons name={showSecret ? 'eye-off-outline' : 'eye-outline'} color={colors.inkMuted} size={21} />
          </Pressable>
        )}
      </View>
      <Text style={[styles.helper, error && styles.error]}>{error || hint || ' '}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 7 },
  label: { ...type.bodySm, color: colors.ink, fontWeight: '800' },
  field: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 15 },
  fieldError: { borderColor: colors.danger, backgroundColor: '#fffafa' },
  input: { ...type.body, flex: 1, color: colors.ink, paddingVertical: 13 },
  // El texto de ayuda y el de error son justo los que hay que poder leer: van a
  // 12 px como mínimo, nunca por debajo.
  helper: { ...type.caption, minHeight: 16, color: colors.inkMuted },
  error: { color: colors.danger, fontWeight: '700' },
});
