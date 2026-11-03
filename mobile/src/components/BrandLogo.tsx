import { Image, StyleSheet, View } from 'react-native';

export function BrandLogo({ compact = false, inverse = false }: { inverse?: boolean; compact?: boolean }) {
  return (
    <View style={[styles.row, inverse && styles.onDark]} accessible accessibilityLabel="Misky Challay">
      {compact ? (
        <Image source={require('../../assets/misky-mark.png')} style={styles.mark} resizeMode="contain" />
      ) : (
        <Image source={require('../../assets/misky-challay-wordmark.png')} style={styles.wordmark} resizeMode="cover" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  onDark: { backgroundColor: '#ffffff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  mark: { width: 40, height: 40 },
  wordmark: { width: 180, height: 50 },
});
