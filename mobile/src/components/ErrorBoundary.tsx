import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PrimaryButton } from './PrimaryButton';
import { colors, layout, radius, spacing, type } from '../theme/tokens';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Se avisa aquí además de registrar en consola (telemetría, Sentry…). */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Última red bajo el árbol de la app.
 *
 * Hasta ahora cualquier excepción durante el render cerraba la aplicación de
 * golpe: el cliente veía desaparecer Misky Challay sin una palabra y sin saber que
 * su carrito seguía ahí. Con esto la caída se convierte en una pantalla que
 * explica lo ocurrido y ofrece dos salidas reales — volver a montar el árbol o
 * reiniciar el paquete entero.
 *
 * Es un componente de clase porque React solo entrega los errores de render a
 * `getDerivedStateFromError` / `componentDidCatch`, que no tienen equivalente en
 * hooks. Los errores de código asíncrono (una promesa rechazada) NO llegan aquí:
 * esos los recoge cada pantalla con su estado de error y su reintento.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // En una build de tienda el rastro no se imprime: no le dice nada al cliente
    // y sí a quien lea el log del dispositivo.
    if (__DEV__) {
      console.error('[app] excepción no controlada durante el render:', error, info.componentStack);
    }
    this.props.onError?.(error, info);
  }

  private retry = (): void => {
    this.setState({ error: null });
  };

  private reload = (): void => {
    // En desarrollo y en Expo Go no hay paquete que recargar: si falla, al menos
    // queda el reintento, que vuelve a montar el árbol desde cero.
    void Updates.reloadAsync().catch(() => this.retry());
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <SafeAreaView style={styles.page}>
        <StatusBar style="light" />

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.icon}>
            <MaterialCommunityIcons name="cake-variant-outline" size={40} color={colors.onDark} />
          </View>

          <Text style={styles.title}>Algo salió mal</Text>

          <Text style={styles.copy}>
            Algo falló dentro de la app. No perdiste nada: tu carrito y tus pedidos siguen
            guardados. Vuelve a intentarlo y, si se repite, reinicia la aplicación.
          </Text>

          {__DEV__ && (
            <View style={styles.debug}>
              <Text style={styles.debugTitle}>Detalle (solo en desarrollo)</Text>
              <Text style={styles.debugText}>{error.message}</Text>
            </View>
          )}

          <PrimaryButton label="Reintentar" onPress={this.retry} style={styles.action} />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reiniciar la aplicación"
            onPress={this.reload}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="restart" size={19} color={colors.onDark} />
            <Text style={styles.secondaryLabel}>Reiniciar la aplicación</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.surfaceDark,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  icon: {
    width: 84,
    height: 84,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceDarkRaised,
  },
  title: {
    ...type.title,
    color: colors.onDark,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  copy: {
    ...type.body,
    color: colors.onDarkMuted,
    textAlign: 'center',
    marginTop: spacing.sm + spacing.xs,
  },
  debug: {
    alignSelf: 'stretch',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceDarkRaised,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  debugTitle: {
    ...type.label,
    color: colors.onDarkMuted,
    textTransform: 'uppercase',
  },
  debugText: {
    ...type.bodySm,
    color: colors.onDark,
    marginTop: spacing.xs,
  },
  action: {
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    backgroundColor: colors.accent600,
    borderColor: colors.accent600,
  },
  secondary: {
    minHeight: layout.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  secondaryLabel: {
    ...type.body,
    fontWeight: '800',
    color: colors.onDark,
  },
  pressed: {
    opacity: 0.7,
  },
});
