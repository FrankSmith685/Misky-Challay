import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, type ImageContentFit } from 'expo-image';
import { resolvePublicAssetUrl } from '../config/env';
import { bundledImageFor } from '../config/bundledImages';
import { colors } from '../theme/tokens';

export interface AppImageProps {
  /** Ruta que devuelve el backend; puede ser relativa (/media/…) o absoluta. */
  uri: string | null | undefined;
  /** El tamaño lo pone quien llama: este contenedor solo recorta y rellena. */
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  /** Fundido de entrada en milisegundos. 0 lo desactiva. */
  transitionMs?: number;
  accessibilityLabel?: string;
  fallbackIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  fallbackIconSize?: number;
  /** 'high' para la foto grande de una ficha; el resto puede esperar. */
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Borrón de color mientras llega la foto. Evita el salto de blanco a imagen que
 * hacía parpadear el menú al desplazarse.
 */
const PLACEHOLDER_BLURHASH = 'L6Ph2p%2.AyE_3t7t7R**0o#DgR4';

/**
 * Envoltorio de expo-image. Sustituye al `Image` de react-native: cachea en
 * disco, hace fundido y resuelve solo el caso de la foto rota, que antes cada
 * pantalla arreglaba con su propio `useState`.
 */
export function AppImage({
  uri,
  style,
  contentFit = 'cover',
  transitionMs = 220,
  accessibilityLabel,
  fallbackIcon = 'cake-variant-outline',
  fallbackIconSize = 34,
  priority = 'normal',
}: AppImageProps) {
  const [failed, setFailed] = useState(false);
  const bundled = bundledImageFor(uri);
  const resolved = resolvePublicAssetUrl(uri);
  const source = bundled ?? (resolved ? { uri: resolved } : null);
  const showImage = Boolean(source) && !failed;

  return (
    <View style={[styles.container, style]}>
      {showImage && source ? (
        <Image
          accessible={Boolean(accessibilityLabel)}
          accessibilityLabel={accessibilityLabel}
          source={source}
          placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
          placeholderContentFit={contentFit}
          contentFit={contentFit}
          transition={transitionMs}
          cachePolicy="memory-disk"
          priority={priority}
          onError={() => setFailed(true)}
          style={styles.image}
        />
      ) : (
        <View style={styles.fallback}>
          <MaterialCommunityIcons name={fallbackIcon} size={fallbackIconSize} color="#8ac7ea" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: colors.brand50,
  },
  image: {
    ...StyleSheet.absoluteFill,
  },
  fallback: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
});
