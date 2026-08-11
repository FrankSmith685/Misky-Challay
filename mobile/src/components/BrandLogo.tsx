import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/tokens';

export function BrandLogo({ inverse = false, compact = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <View style={styles.row} accessibilityLabel="Verde Bowl">
      <View style={[styles.mark, inverse && styles.markInverse]}>
        <MaterialCommunityIcons name="leaf" color={inverse ? colors.brand800 : colors.surface} size={21} />
      </View>
      {!compact && (
        <Text style={[styles.name, inverse && styles.nameInverse]}>
          Verde<Text style={styles.accent}>Bowl</Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  mark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' },
  markInverse: { backgroundColor: colors.surface },
  name: { color: colors.brand900, fontSize: 21, fontWeight: '900', letterSpacing: -0.6 },
  nameInverse: { color: colors.surface },
  accent: { color: colors.accent500 },
});
