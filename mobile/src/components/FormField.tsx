import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
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
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const { onFocus, onBlur, ...inputProps } = props;
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused, error && styles.fieldError]}>
        {icon && (
          <View pointerEvents="none">
            <MaterialCommunityIcons name={icon} color={focused ? colors.brand700 : colors.inkMuted} size={20} />
          </View>
        )}
        <TextInput
          ref={inputRef}
          placeholderTextColor="#87938d"
          secureTextEntry={secureTextEntry && !showSecret}
          editable={inputProps.editable !== false}
          showSoftInputOnFocus
          style={[styles.input, style]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...inputProps}
        />
        {secureTextEntry && (
          <Pressable hitSlop={10} onPress={() => { setShowSecret((value) => !value); inputRef.current?.focus(); }} accessibilityLabel={showSecret ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
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
  field: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: radius.md + 4, paddingHorizontal: 16 },
  // No aplicar shadow/elevation condicionalmente al enfocar. En Android con
  // Fabric eso puede desmontar y volver a montar la vista nativa durante
  // `onFocus`, disparar `onBlur` de inmediato y cerrar el teclado. El borde y
  // el fondo sí cambian sin reemplazar el EditText.
  fieldFocused: { borderColor: colors.brand600, backgroundColor: colors.brand50 },
  fieldError: { borderColor: colors.danger, backgroundColor: '#fffafa' },
  input: { ...type.body, flex: 1, color: colors.ink, paddingVertical: 13 },
  // El texto de ayuda y el de error son justo los que hay que poder leer: van a
  // 12 px como mínimo, nunca por debajo.
  helper: { ...type.caption, minHeight: 16, color: colors.inkMuted },
  error: { color: colors.danger, fontWeight: '700' },
});
