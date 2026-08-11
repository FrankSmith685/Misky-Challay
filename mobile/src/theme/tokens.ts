import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  brand900: '#123d2b',
  brand800: '#194e37',
  brand700: '#1c6243',
  brand600: '#237c52',
  brand100: '#dcf2e4',
  brand50: '#f0f9f4',
  accent500: '#e8940f',
  ink: '#14201a',
  inkMuted: '#5d6b64',
  surface: '#ffffff',
  surfaceMuted: '#f6f8f7',
  line: '#e3e8e5',
  success: '#15875b',
  warning: '#b16c00',
  danger: '#c43d3d',

  /**
   * Superficie elevada: la tarjeta que flota sobre `surfaceMuted`. Es blanca como
   * `surface`, pero con nombre propio para que la sombra y el borde acompanen
   * siempre al mismo rol y no se decida caso por caso.
   */
  surfaceRaised: '#ffffff',
  /** Borde tenue para tarjetas elevadas: mas suave que `line` porque la sombra ya separa. */
  lineSoft: '#eef2f0',

  /**
   * Paleta de las pantallas de fondo oscuro (splash, cabeceras de marca, hojas
   * de exito). Hasta ahora se pintaba `inkMuted` sobre `brand900`, que da 1.9:1
   * de contraste: ilegible. `onDark` da 11.3:1 y `onDarkMuted` 7.7:1.
   */
  surfaceDark: '#123d2b',
  surfaceDarkRaised: '#1b4b35',
  onDark: '#f2f8f4',
  onDarkMuted: '#b9d4c5',
  /** Velo de los modales y hojas inferiores. */
  backdrop: 'rgba(11, 30, 22, 0.55)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/**
 * Escala tipografica. Se usa como `style={type.body}`, nunca `fontSize` suelto.
 * El minimo absoluto es 12: por debajo el texto deja de leerse a distancia de brazo.
 */
export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.8 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '900', letterSpacing: -0.5 },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: '800' },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '500' },
  bodySm: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.3 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
} satisfies Record<string, TextStyle>;

/** Elevacion en tres pasos. `elevation` es lo unico que Android mira. */
export const shadow = {
  sm: {
    shadowColor: colors.brand900,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: colors.brand900,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  lg: {
    shadowColor: colors.brand900,
    shadowOpacity: 0.16,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
} satisfies Record<string, ViewStyle>;

/** Medidas de interaccion compartidas: 44 px es el minimo tactil de iOS y Android. */
export const layout = {
  minTouch: 44,
  /** hitSlop uniforme para iconos de 24 px dentro de una caja de 44. */
  iconHitSlop: { top: 10, bottom: 10, left: 10, right: 10 },
} as const;

export type ToneName = 'light' | 'dark';
