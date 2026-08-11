import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/tokens';
import { PrimaryButton } from './PrimaryButton';

export function LoadingState({ label = 'Cargando…' }: { label?: string }) {
  return <View style={styles.state}><ActivityIndicator color={colors.brand600} size="large" /><Text style={styles.copy}>{label}</Text></View>;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.state}>
      <MaterialCommunityIcons name="cloud-alert-outline" color={colors.danger} size={42} />
      <Text style={styles.title}>No pudimos cargar esta información</Text>
      <Text style={styles.copy}>{message}</Text>
      {onRetry && <PrimaryButton label="Reintentar" variant="secondary" onPress={onRetry} style={styles.button} />}
    </View>
  );
}

const styles = StyleSheet.create({
  state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { color: colors.ink, fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 12 },
  copy: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  button: { marginTop: spacing.md, minWidth: 160 },
});
