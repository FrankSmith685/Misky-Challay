import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '../src/components/EmptyState';
import { ScreenScaffold } from '../src/components/ScreenScaffold';
import { useToast } from '../src/providers/ToastProvider';
import { colors, layout, radius, spacing, type } from '../src/theme/tokens';

/** Tiempo que el lector queda dormido tras un código que no es de mesa. */
const RETRY_DELAY_MS = 1_600;

/**
 * El QR de la mesa puede venir como enlace (verdebowl.pe/mesa/…, /dining/qr/…)
 * o como el token pelado. Cualquier otra cosa no es nuestra y se descarta.
 */
const tokenFrom = (value: string): string | null => {
  const raw = value.trim();
  const match = raw.match(/(?:mesa\/|dining\/qr\/)([a-zA-Z0-9-]{8,})/i);
  if (match) return match[1];
  return /^[a-zA-Z0-9-]{8,}$/.test(raw) ? raw : null;
};

export default function ScanTableScreen() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);
  const [torch, setTorch] = useState(false);

  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (unlockTimer.current !== null) clearTimeout(unlockTimer.current);
    },
    [],
  );

  const onScan = useCallback(
    ({ data }: { data: string }) => {
      if (locked) return;

      const token = tokenFrom(data);
      if (!token) {
        setLocked(true);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        toast.show({
          message: 'Ese código no pertenece a una mesa Misky Challay.',
          tone: 'warning',
          placement: 'top',
          haptic: false,
        });
        unlockTimer.current = setTimeout(() => setLocked(false), RETRY_DELAY_MS);
        return;
      }

      setLocked(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/mesa/[token]', params: { token } });
    },
    [locked, toast],
  );

  // Primer render antes de saber si hay permiso: fondo de marca, sin parpadeo blanco.
  if (!permission) {
    return (
      <View style={styles.page}>
        <StatusBar style="light" />
      </View>
    );
  }

  if (!permission.granted) {
    const blocked = !permission.canAskAgain;

    return (
      <ScreenScaffold title="Pedir desde la mesa">
        <EmptyState
          icon="camera-lock-outline"
          title="Necesitamos tu cámara un momento"
          message={
            blocked
              ? 'Diste el permiso por denegado. Actívalo en los ajustes del teléfono y vuelve a intentarlo.'
              : 'Solo se usa mientras escaneas el QR de la mesa: no guardamos fotos ni video.'
          }
          actionLabel={blocked ? 'Abrir ajustes' : 'Permitir cámara'}
          onAction={() => {
            if (blocked) void Linking.openSettings();
            else void requestPermission();
          }}
          secondaryLabel="Volver"
          onSecondary={() => router.back()}
        />
      </ScreenScaffold>
    );
  }

  return (
    <View style={styles.page}>
      <StatusBar style="light" />

      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={locked ? undefined : onScan}
      />

      <View
        style={[
          styles.overlay,
          { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.lg },
        ]}
      >
        <View style={styles.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar el escáner"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.circle, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="close" size={24} color={colors.onDark} />
          </Pressable>

          <View style={styles.topText}>
            <Text style={styles.eyebrow}>PEDIDO EN EL LOCAL</Text>

            <Text style={styles.title}>Escanea tu mesa</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Apagar la linterna' : 'Encender la linterna'}
            accessibilityState={{ selected: torch }}
            onPress={() => setTorch((value) => !value)}
            style={({ pressed }) => [
              styles.circle,
              torch && styles.circleActive,
              pressed && styles.pressed,
            ]}
          >
            <MaterialCommunityIcons
              name={torch ? 'flashlight' : 'flashlight-off'}
              size={22}
              color={torch ? colors.brand900 : colors.onDark}
            />
          </Pressable>
        </View>

        <View style={styles.frame}>
          <View style={[styles.corner, styles.topLeft]} />

          <View style={[styles.corner, styles.topRight]} />

          <View style={[styles.corner, styles.bottomLeft]} />

          <View style={[styles.corner, styles.bottomRight]} />

          <MaterialCommunityIcons name="qrcode-scan" size={76} color="rgba(255,255,255,0.28)" />
        </View>

        <View style={styles.help}>
          <MaterialCommunityIcons name="table-chair" size={26} color={colors.accent500} />

          <View style={styles.helpText}>
            <Text style={styles.helpTitle}>Busca el QR sobre la mesa</Text>

            <Text style={styles.helpCopy}>
              Centra el código dentro del marco. Abrimos la carta de este local automáticamente.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#07140e',
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(4,16,10,0.45)',
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  topText: {
    flex: 1,
  },
  circle: {
    width: layout.minTouch,
    height: layout.minTouch,
    borderRadius: radius.sm + 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  circleActive: {
    backgroundColor: colors.accent600,
  },
  eyebrow: {
    ...type.label,
    color: colors.onDarkMuted,
  },
  title: {
    ...type.title,
    color: colors.onDark,
    marginTop: 2,
  },
  frame: {
    alignSelf: 'center',
    width: 268,
    height: 268,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corner: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderColor: colors.accent600,
  },
  topLeft: {
    left: 0,
    top: 0,
    borderLeftWidth: 5,
    borderTopWidth: 5,
    borderTopLeftRadius: 20,
  },
  topRight: {
    right: 0,
    top: 0,
    borderRightWidth: 5,
    borderTopWidth: 5,
    borderTopRightRadius: 20,
  },
  bottomLeft: {
    left: 0,
    bottom: 0,
    borderLeftWidth: 5,
    borderBottomWidth: 5,
    borderBottomLeftRadius: 20,
  },
  bottomRight: {
    right: 0,
    bottom: 0,
    borderRightWidth: 5,
    borderBottomWidth: 5,
    borderBottomRightRadius: 20,
  },
  help: {
    flexDirection: 'row',
    gap: spacing.sm + spacing.xs,
    backgroundColor: 'rgba(12,44,29,0.94)',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  helpText: {
    flex: 1,
  },
  helpTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.onDark,
  },
  helpCopy: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: 3,
  },
  pressed: {
    opacity: 0.75,
  },
});
