import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadow, spacing, type } from '../theme/tokens';
import type { CoverageResult } from '../types/domain';
import { money } from '../lib/format';
import { PrimaryButton } from './PrimaryButton';

interface CoverageSummaryCardProps {
  result: CoverageResult;
  onSelectPickup?: (pickup: NonNullable<CoverageResult['nearestPickup']>) => void;
}

export function CoverageSummaryCard({ result, onSelectPickup }: CoverageSummaryCardProps) {
  const delivery = result.covered && result.branch && result.zone
    ? { branch: result.branch, zone: result.zone }
    : null;
  const pickup = result.nearestPickup;

  return (
    <View style={[styles.card, delivery ? styles.covered : styles.notCovered]}>
      <MaterialCommunityIcons
        name={delivery ? 'truck-check-outline' : 'map-marker-off-outline'}
        size={26}
        color={delivery ? colors.success : colors.danger}
      />
      <View style={styles.copy}>
        <Text style={styles.title}>{delivery ? '¡Sí llegamos!' : 'Fuera de cobertura'}</Text>
        <Text style={styles.detail}>
          {delivery
            ? [
                `Te atenderá ${delivery.branch.name}`,
                `envío ${money(delivery.zone.deliveryFee)}`,
                delivery.zone.minimumOrder > 0 ? `mínimo ${money(delivery.zone.minimumOrder)}` : 'sin mínimo',
                result.etaMinutes ? `~${result.etaMinutes} min` : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : (result.reason ?? 'Todavía no repartimos en esta zona.')}
        </Text>
        {!delivery && pickup ? (
          <View style={styles.pickup}>
            <Text style={styles.pickupText}>
              Recojo en {pickup.name} · {pickup.distanceKm} km ·{' '}
              {pickup.isOpenNow ? 'abierto ahora' : 'cerrado ahora'}
            </Text>
            {onSelectPickup ? (
              <PrimaryButton
                label="Elegir este local para recojo"
                variant="secondary"
                onPress={() => onSelectPickup(pickup)}
                style={styles.pickupButton}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadow.sm,
  },
  covered: { backgroundColor: colors.brand50 },
  notCovered: { backgroundColor: '#fff0f0' },
  copy: { flex: 1 },
  title: { ...type.body, fontWeight: '800', color: colors.ink },
  detail: { ...type.bodySm, color: colors.inkMuted, marginTop: 3 },
  pickup: { marginTop: spacing.sm },
  pickupText: { ...type.caption, color: colors.inkMuted },
  pickupButton: { minHeight: 46, marginTop: spacing.sm },
});
