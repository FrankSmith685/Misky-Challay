import { useCallback, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { useMobileNotifications } from '../src/providers/MobileNotificationsProvider';
import { useToast } from '../src/providers/ToastProvider';
import { mobileAnalytics } from '../src/services/analytics';
import { colors, layout, radius, spacing, type } from '../src/theme/tokens';

const ONBOARDING_KEY = 'verde-bowl.onboarding.v1';

/**
 * Marca de «este teléfono ya vio la bienvenida». Vive aquí, junto a la pantalla
 * que la escribe, y la lee el arranque para decidir si la muestra.
 * No se borra al cerrar sesión: es del aparato, no de la cuenta.
 */
export const onboardingStorage = {
  async hasSeen(): Promise<boolean> {
    return (await AsyncStorage.getItem(ONBOARDING_KEY)) === 'true';
  },

  markSeen(): Promise<void> {
    return AsyncStorage.setItem(ONBOARDING_KEY, 'true');
  },

  clear(): Promise<void> {
    return AsyncStorage.removeItem(ONBOARDING_KEY);
  },
};

const STEPS = 3;

type PermissionState = 'idle' | 'granted' | 'denied';

/**
 * BIENVENIDA EN TRES PASOS.
 *
 * El permiso de avisos —la única herramienta de retención que tiene la app—
 * estaba enterrado tras un botón dentro de Mi cuenta, y el de ubicación se pedía
 * en seco al abrir el mapa de direcciones. Aquí se explica PARA QUÉ sirve cada
 * uno antes de que salte el diálogo del sistema, que es lo que decide si el
 * cliente acepta o lo rechaza para siempre.
 *
 * Nada de esto es obligatorio: los tres pasos se pueden saltar y todo se puede
 * cambiar después en Mi cuenta.
 */
export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const toast = useToast();
  const notifications = useMobileNotifications();

  const scrollRef = useRef<ScrollView>(null);
  const [step, setStep] = useState(0);
  const [locationState, setLocationState] = useState<PermissionState>('idle');
  const [finishing, setFinishing] = useState(false);

  const goTo = useCallback(
    (next: number) => {
      const target = Math.max(0, Math.min(STEPS - 1, next));
      setStep(target);
      scrollRef.current?.scrollTo({ x: target * width, animated: true });
      void Haptics.selectionAsync();
    },
    [width],
  );

  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, width));
      setStep(Math.max(0, Math.min(STEPS - 1, index)));
    },
    [width],
  );

  /** El consentimiento se guarda SIEMPRE, diga que sí o que no: es una respuesta. */
  const finish = useCallback(
    async (analyticsAccepted: boolean) => {
      setFinishing(true);
      try {
        await mobileAnalytics.setConsent(analyticsAccepted);
        await onboardingStorage.markSeen();
        if (analyticsAccepted) void mobileAnalytics.track('APP_OPEN', { onboarding: true });
      } finally {
        setFinishing(false);
      }
      router.replace('/(tabs)');
    },
    [],
  );

  const askLocation = useCallback(async () => {
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      setLocationState(result.granted ? 'granted' : 'denied');
      if (!result.granted) {
        toast.show({
          tone: 'info',
          message: 'Sin ubicación puedes escribir tu dirección a mano; nada se bloquea.',
        });
      }
    } catch {
      setLocationState('denied');
    }
  }, [toast]);

  const askNotifications = useCallback(async () => {
    await notifications.enable();
  }, [notifications]);

  const pushGranted = notifications.status === 'enabled';
  const pushUnavailable =
    notifications.status === 'unsupported' || notifications.status === 'configuration-required';

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar style="light" />

      <View style={styles.topBar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}>
            <MaterialCommunityIcons name="leaf" size={18} color={colors.brand800} />
          </View>
          <Text style={styles.brandName}>
            Verde<Text style={styles.accent}>Bowl</Text>
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Saltar la bienvenida"
          hitSlop={layout.iconHitSlop}
          onPress={() => void finish(false)}
          style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
        >
          <Text style={styles.skipLabel}>Saltar</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
      >
        {/* Paso 1: qué es esto y por qué merece la pena. */}
        <ScrollView
          style={{ width }}
          contentContainerStyle={styles.slide}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <MaterialCommunityIcons name="bowl-mix" size={54} color={colors.onDark} />
          </View>

          <Text style={styles.eyebrow}>BIENVENIDO A VERDE BOWL</Text>
          <Text style={styles.title}>Comida real, armada a tu manera</Text>
          <Text style={styles.copy}>
            Arma tu bowl ingrediente a ingrediente y mira cómo cambian las calorías, la proteína y el
            precio antes de pedir. Nosotros calculamos; tú decides.
          </Text>

          <View style={styles.bullets}>
            <Bullet icon="tune-variant" text="Personaliza cada bowl y guárdalo para repetirlo." />
            <Bullet icon="bike-fast" text="Delivery, recojo en local o pedido desde tu mesa." />
            <Bullet icon="shield-check-outline" text="Precios con IGV incluido y alérgenos siempre a la vista." />
          </View>
        </ScrollView>

        {/* Paso 2: los dos permisos, explicados ANTES de que salte el diálogo. */}
        <ScrollView
          style={{ width }}
          contentContainerStyle={styles.slide}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.eyebrow}>DOS PERMISOS, NINGUNA SORPRESA</Text>
          <Text style={styles.title}>Para qué te los pedimos</Text>
          <Text style={styles.copy}>
            Los dos son opcionales y puedes cambiarlos cuando quieras desde Mi cuenta.
          </Text>

          <PermissionCard
            icon="map-marker-radius-outline"
            title="Tu ubicación"
            description="Solo mientras eliges dirección: sirve para comprobar si llegamos a tu zona y colocar el punto exacto de entrega en el mapa."
            actionLabel="Permitir ubicación"
            grantedLabel="Ubicación activada"
            deniedLabel="Sin ubicación: escribirás la dirección a mano"
            state={locationState}
            onPress={() => void askLocation()}
          />

          <PermissionCard
            icon="bell-ring-outline"
            title="Avisos del pedido"
            description="Te avisamos cuando el pago se confirma, cuando tu bowl entra en cocina y cuando sale hacia ti. Nada de publicidad."
            actionLabel="Activar avisos"
            grantedLabel="Avisos activados"
            deniedLabel={
              pushUnavailable
                ? 'Esta versión de prueba todavía no envía avisos'
                : 'Sin avisos: podrás seguir el pedido dentro de la app'
            }
            state={pushGranted ? 'granted' : notifications.error || pushUnavailable ? 'denied' : 'idle'}
            busy={notifications.status === 'busy'}
            onPress={() => void askNotifications()}
          />
        </ScrollView>

        {/* Paso 3: consentimiento de medición, con respuesta explícita. */}
        <ScrollView
          style={{ width }}
          contentContainerStyle={styles.slide}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <MaterialCommunityIcons name="chart-line-variant" size={48} color={colors.onDark} />
          </View>

          <Text style={styles.eyebrow}>ÚLTIMA PREGUNTA</Text>
          <Text style={styles.title}>¿Nos ayudas a mejorar la app?</Text>
          <Text style={styles.copy}>
            Si aceptas, registramos qué pantallas usas y dónde te trabas, sin nombres ni datos de
            pago, para arreglar lo que estorba. Si prefieres que no, la app funciona exactamente
            igual.
          </Text>

          <View style={styles.bullets}>
            <Bullet icon="eye-off-outline" text="Nunca guardamos tu dirección, tu correo ni tu tarjeta." />
            <Bullet icon="delete-outline" text="Al cerrar sesión se borra todo lo medido en este teléfono." />
            <Bullet icon="cog-outline" text="Puedes cambiar de idea en Mi cuenta › Preferencias." />
          </View>
        </ScrollView>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityRole="progressbar" accessibilityLabel={`Paso ${step + 1} de ${STEPS}`}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={[styles.dot, index === step && styles.dotActive]} />
          ))}
        </View>

        {step < STEPS - 1 ? (
          <PrimaryButton label="Continuar" onPress={() => goTo(step + 1)} style={styles.cta} />
        ) : (
          <>
            <PrimaryButton
              label="Sí, quiero ayudar"
              loading={finishing}
              onPress={() => void finish(true)}
              style={styles.cta}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="No compartir datos de uso"
              disabled={finishing}
              onPress={() => void finish(false)}
              style={({ pressed }) => [styles.decline, pressed && styles.pressed]}
            >
              <Text style={styles.declineLabel}>No, gracias</Text>
            </Pressable>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function Bullet({
  icon,
  text,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.bullet}>
      <MaterialCommunityIcons name={icon} size={20} color={colors.brand100} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

interface PermissionCardProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  description: string;
  actionLabel: string;
  grantedLabel: string;
  deniedLabel: string;
  state: PermissionState;
  busy?: boolean;
  onPress: () => void;
}

function PermissionCard({
  icon,
  title,
  description,
  actionLabel,
  grantedLabel,
  deniedLabel,
  state,
  busy = false,
  onPress,
}: PermissionCardProps) {
  return (
    <View style={styles.permission}>
      <View style={styles.permissionHead}>
        <View style={styles.permissionIcon}>
          <MaterialCommunityIcons name={icon} size={22} color={colors.onDark} />
        </View>
        <Text style={styles.permissionTitle}>{title}</Text>
      </View>

      <Text style={styles.permissionCopy}>{description}</Text>

      {state === 'granted' ? (
        <View style={styles.permissionDone}>
          <MaterialCommunityIcons name="check-circle" size={19} color={colors.brand100} />
          <Text style={styles.permissionDoneText}>{grantedLabel}</Text>
        </View>
      ) : (
        <>
          <PrimaryButton
            label={actionLabel}
            loading={busy}
            onPress={onPress}
            style={styles.permissionAction}
          />
          {state === 'denied' && <Text style={styles.permissionHint}>{deniedLabel}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.onDark,
  },
  brandName: {
    ...type.heading,
    color: colors.onDark,
  },
  accent: {
    color: colors.accent500,
  },
  skip: {
    minHeight: layout.minTouch,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  skipLabel: {
    ...type.body,
    fontWeight: '800',
    color: colors.onDarkMuted,
  },
  pressed: {
    opacity: 0.7,
  },
  pager: {
    flex: 1,
  },
  slide: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  hero: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDarkRaised,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    ...type.label,
    color: colors.brand100,
    textTransform: 'uppercase',
  },
  title: {
    ...type.display,
    color: colors.onDark,
    marginTop: spacing.sm,
  },
  copy: {
    ...type.body,
    color: colors.onDarkMuted,
    marginTop: spacing.sm + spacing.xs,
  },
  bullets: {
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  bullet: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + spacing.xs,
  },
  bulletText: {
    ...type.bodySm,
    flex: 1,
    color: colors.onDark,
  },
  permission: {
    borderRadius: radius.md,
    backgroundColor: colors.surfaceDarkRaised,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  permissionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  permissionIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  permissionTitle: {
    ...type.heading,
    flex: 1,
    color: colors.onDark,
  },
  permissionCopy: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    marginTop: spacing.sm,
  },
  permissionAction: {
    marginTop: spacing.md,
    backgroundColor: colors.accent500,
    borderColor: colors.accent500,
  },
  permissionHint: {
    ...type.caption,
    color: colors.onDarkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  permissionDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch,
    marginTop: spacing.sm,
  },
  permissionDoneText: {
    ...type.body,
    fontWeight: '800',
    color: colors.brand100,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  dotActive: {
    width: 26,
    backgroundColor: colors.accent500,
  },
  cta: {
    backgroundColor: colors.accent500,
    borderColor: colors.accent500,
  },
  decline: {
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  declineLabel: {
    ...type.body,
    fontWeight: '800',
    color: colors.onDarkMuted,
  },
});
