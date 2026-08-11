import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from '../components/PrimaryButton';
import { primeResource } from '../hooks/useResource';
import { businessApi } from '../services/api/business.service';
import { colors, layout, radius, shadow, spacing, type } from '../theme/tokens';
import type { PublicSettings } from '../types/domain';

/**
 * COMPUERTA DE LA APP.
 *
 * El servidor publica en GET /settings/public qué versión mínima puede operar,
 * cuál es la última y si hay una ventana de mantenimiento. Pero el servidor no
 * puede forzar nada por sí solo: la decisión vive aquí, y por eso esta pieza es
 * la única que no se puede añadir de forma retroactiva — una instalación ya
 * repartida solo obedece lo que su primera versión sabía consultar.
 *
 * Tres desenlaces, en orden:
 *   1. Mantenimiento activo -> pantalla completa, sin navegación por debajo.
 *   2. Versión por debajo de la mínima -> bloqueo duro, no descartable.
 *   3. Versión por debajo de la última -> aviso suave, descartable un día.
 *
 * Si la consulta falla NO se bloquea: se falla en abierto. Un servidor caído no
 * puede dejar sin comer a quien ya tiene la app instalada.
 */

const REMINDER_KEY = 'verde-bowl.update-reminder';
const REMINDER_MS = 24 * 60 * 60 * 1_000;

/**
 * La misma clave que usan las pantallas que leen la configuración pública con
 * `useResource`. Al sembrarla desde aquí, la portada, el checkout, los
 * documentos legales y la ayuda reutilizan esta respuesta en vez de pedir otra
 * vez lo mismo nada más arrancar.
 */
const SETTINGS_KEY = 'settings:public';

interface AppGateValue {
  settings: PublicSettings | null;
  /** Hay una actualización nueva pero no obligatoria. */
  updateAvailable: boolean;
  updateUrl: string;
  openUpdate(): void;
  refresh(): Promise<void>;
}

const AppGateContext = createContext<AppGateValue | null>(null);

/**
 * Compara versiones MAYOR.MENOR.PARCHE por partes numéricas.
 *
 * Nunca como cadenas: en texto '0.10.0' es MENOR que '0.9.0', así que la décima
 * versión menor quedaría bloqueada por la novena. Lo que no sea numérico cuenta
 * como cero, que es la lectura prudente: ante la duda, no bloquear.
 */
export const compareVersions = (left: string, right: string): number => {
  const parts = (value: string): number[] =>
    value
      .trim()
      .split('.')
      .map((chunk) => {
        const parsed = Number.parseInt(chunk, 10);
        return Number.isFinite(parsed) ? parsed : 0;
      });

  const a = parts(left);
  const b = parts(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

/** Versión instalada. En un cliente sin binario nativo no hay nada que comparar. */
const installedVersion = (): string | null => Application.nativeApplicationVersion;

export function AppGateProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [checking, setChecking] = useState(false);
  const [softDismissed, setSoftDismissed] = useState(true);

  /** Evita dos consultas solapadas al volver del segundo plano con la app fría. */
  const inflight = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    if (inflight.current) return inflight.current;

    setChecking(true);
    const request = businessApi
      .publicSettings()
      .then((next) => {
        setSettings(next);
        /*
         * Sembrar, no invalidar: la compuerta se resuelve antes de montar el
         * navegador, así que las pantallas que lean `settings:public` encuentran
         * esta respuesta ya en la caché y no repiten la petición al abrirse.
         */
        primeResource(SETTINGS_KEY, next);
      })
      .catch(() => {
        // Se falla en abierto: sin respuesta, la app opera con normalidad.
      })
      .finally(() => {
        setChecking(false);
        inflight.current = null;
      });

    inflight.current = request;
    return request;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Al volver del segundo plano: una ventana de mantenimiento puede haber
  // empezado con el teléfono en el bolsillo.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  const version = installedVersion();
  const mobile = settings?.mobile ?? null;

  const maintenance = mobile?.maintenance.activo === true;

  /*
   * Sin versión nativa legible (Expo Go, web) no se bloquea a nadie: no hay
   * tienda a la que mandarle ni forma de comprobar qué tiene instalado.
   */
  const blocked =
    !maintenance &&
    mobile !== null &&
    version !== null &&
    compareVersions(version, mobile.minSupportedVersion) < 0;

  const updateAvailable =
    !blocked &&
    !maintenance &&
    mobile !== null &&
    version !== null &&
    compareVersions(version, mobile.latestVersion) < 0;

  const updateUrl = mobile?.updateUrl ?? '';

  const openUpdate = useCallback(() => {
    if (updateUrl) void Linking.openURL(updateUrl).catch(() => undefined);
  }, [updateUrl]);

  // El aviso suave se recuerda una vez al día: repetirlo en cada arranque lo
  // convierte en ruido y el cliente deja de leerlo.
  useEffect(() => {
    if (!updateAvailable) return;

    let active = true;
    void AsyncStorage.getItem(REMINDER_KEY)
      .then((raw) => {
        if (!active) return;
        const last = Number(raw);
        setSoftDismissed(Number.isFinite(last) && Date.now() - last < REMINDER_MS);
      })
      .catch(() => {
        if (active) setSoftDismissed(false);
      });

    return () => {
      active = false;
    };
  }, [updateAvailable]);

  const dismissSoft = useCallback(() => {
    setSoftDismissed(true);
    void AsyncStorage.setItem(REMINDER_KEY, String(Date.now())).catch(() => undefined);
  }, []);

  const value = useMemo<AppGateValue>(
    () => ({ settings, updateAvailable, updateUrl, openUpdate, refresh: load }),
    [load, openUpdate, settings, updateAvailable, updateUrl],
  );

  if (maintenance) {
    return (
      <GateScreen
        icon="tools"
        title="Estamos en mantenimiento"
        copy={
          mobile?.maintenance.mensaje ||
          'Volvemos en un rato. Gracias por la paciencia.'
        }
        actionLabel="Reintentar"
        loading={checking}
        onAction={() => void load()}
      />
    );
  }

  if (blocked) {
    return (
      <GateScreen
        icon="cellphone-arrow-down"
        title="Toca actualizar"
        copy={`Esta versión de Verde Bowl ya no puede tomar pedidos. Actualiza a la ${mobile?.minSupportedVersion ?? ''} o superior y sigues justo donde lo dejaste.`}
        actionLabel="Actualizar ahora"
        onAction={openUpdate}
        secondaryLabel="Ya actualicé"
        onSecondary={() => void load()}
      />
    );
  }

  return (
    <AppGateContext.Provider value={value}>
      {children}
      {updateAvailable && !softDismissed ? (
        <SoftUpdateBanner
          version={mobile?.latestVersion ?? ''}
          onUpdate={openUpdate}
          onDismiss={dismissSoft}
        />
      ) : null}
    </AppGateContext.Provider>
  );
}

export function useAppGate() {
  const value = useContext(AppGateContext);
  if (!value) throw new Error('useAppGate debe usarse dentro de AppGateProvider');
  return value;
}

/* ------------------------------------------------------------------ */
/* Pantalla de bloqueo                                                 */
/* ------------------------------------------------------------------ */

interface GateScreenProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  copy: string;
  actionLabel: string;
  onAction: () => void;
  loading?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

function GateScreen({
  icon,
  title,
  copy,
  actionLabel,
  onAction,
  loading = false,
  secondaryLabel,
  onSecondary,
}: GateScreenProps) {
  /*
   * Quien retira el splash es el navegador, y aquí el navegador no se monta: sin
   * esto el bloqueo quedaría debajo del splash nativo y la app parecería colgada.
   */
  useEffect(() => {
    void SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  return (
    <SafeAreaView style={styles.gate}>
      <StatusBar style="light" />

      <View style={styles.gateMark}>
        <MaterialCommunityIcons name={icon} size={38} color={colors.onDark} />
      </View>

      <Text style={styles.gateTitle}>{title}</Text>
      <Text style={styles.gateCopy}>{copy}</Text>

      <PrimaryButton
        label={actionLabel}
        loading={loading}
        onPress={onAction}
        style={styles.gateAction}
      />

      {secondaryLabel && onSecondary ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={12}
          onPress={onSecondary}
          style={styles.gateSecondary}
        >
          <Text style={styles.gateSecondaryLabel}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Aviso suave                                                         */
/* ------------------------------------------------------------------ */

interface SoftUpdateBannerProps {
  version: string;
  onUpdate: () => void;
  onDismiss: () => void;
}

function SoftUpdateBanner({ version, onUpdate, onDismiss }: SoftUpdateBannerProps) {
  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} pointerEvents="box-none" style={styles.bannerHost}>
      <View style={[styles.banner, shadow.lg]}>
        <MaterialCommunityIcons name="update" size={22} color={colors.brand700} />

        <View style={styles.bannerCopy}>
          <Text style={styles.bannerTitle}>Hay una versión nueva</Text>
          <Text style={styles.bannerText}>
            {version ? `La ${version} ya está en la tienda.` : 'Ya está disponible en la tienda.'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Actualizar la aplicación"
          hitSlop={8}
          onPress={onUpdate}
          style={({ pressed }) => [styles.bannerAction, pressed && styles.pressed]}
        >
          <Text style={styles.bannerActionLabel}>Actualizar</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ahora no"
          hitSlop={12}
          onPress={onDismiss}
          style={({ pressed }) => [styles.bannerClose, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="close" size={20} color={colors.inkMuted} />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceDark,
  },
  gateMark: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDarkRaised,
  },
  gateTitle: {
    ...type.title,
    color: colors.onDark,
    textAlign: 'center',
  },
  gateCopy: {
    ...type.body,
    color: colors.onDarkMuted,
    textAlign: 'center',
  },
  gateAction: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  gateSecondary: {
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  gateSecondaryLabel: {
    ...type.bodySm,
    color: colors.onDarkMuted,
    fontWeight: '700',
  },
  bannerHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    margin: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surfaceRaised,
  },
  bannerCopy: {
    flex: 1,
  },
  bannerTitle: {
    ...type.bodySm,
    color: colors.ink,
    fontWeight: '800',
  },
  bannerText: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  bannerAction: {
    minHeight: layout.minTouch,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  bannerActionLabel: {
    ...type.bodySm,
    color: colors.brand700,
    fontWeight: '800',
  },
  bannerClose: {
    width: layout.minTouch,
    height: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
