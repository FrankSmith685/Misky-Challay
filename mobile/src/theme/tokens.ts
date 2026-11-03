import type { TextStyle, ViewStyle } from 'react-native';

export const colors = {
  /** Azul del logotipo, de claro a oscuro para botones y superficies. */
  brand950: '#031d38',
  brand900: '#05284c',
  brand800: '#073a6b',
  brand700: '#094d8a',
  brand600: '#0b5fa8',
  brand100: '#deeffc',
  brand50: '#f1f8ff',
  /** Ámbar accesible para insignias y botones con texto blanco. */
  accent600: '#a75c00',
  accent500: '#e8940f',
  accent400: '#f5a524',
  accent100: '#fdedcc',
  accent50: '#fff8ea',
  ink: '#15283d',
  inkSoft: '#2b415a',
  inkMuted: '#536578',
  surface: '#ffffff',
  surfaceMuted: '#f7fbff',
  line: '#dce6f0',
  success: '#15875b',
  warning: '#b16c00',
  danger: '#c43d3d',
  danger50: '#fff1f1',
  warning50: '#fff7e5',
  success50: '#edf9f3',
  info: '#2878a8',
  info50: '#eef7fc',

  /**
   * Superficie elevada: la tarjeta que flota sobre `surfaceMuted`. Es blanca como
   * `surface`, pero con nombre propio para que la sombra y el borde acompanen
   * siempre al mismo rol y no se decida caso por caso.
   */
  surfaceRaised: '#ffffff',
  /** Borde tenue para tarjetas elevadas: mas suave que `line` porque la sombra ya separa. */
  lineSoft: '#e8f1f9',

  /**
   * Paleta de cabeceras y pantallas oscuras. Las tintas claras mantienen
   * contraste suficiente sobre el azul profundo.
   */
  surfaceDark: '#05284c',
  surfaceDarkRaised: '#073a6b',
  onDark: '#f7fbff',
  onDarkMuted: '#d7eaff',
  /** Velo de los modales y hojas inferiores. */
  backdrop: 'rgba(5, 26, 50, 0.58)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 999,
} as const;

/**
 * Escala tipografica. Se usa como `style={type.body}`, nunca `fontSize` suelto.
 * El minimo absoluto es 12: por debajo el texto deja de leerse a distancia de brazo.
 */
export const type = {
  hero: { fontSize: 38, lineHeight: 43, fontWeight: '900', letterSpacing: -1.25 },
  display: { fontSize: 32, lineHeight: 38, fontWeight: '900', letterSpacing: -0.9 },
  title: { fontSize: 25, lineHeight: 31, fontWeight: '900', letterSpacing: -0.55 },
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
  /** El contenido no se estira indefinidamente en tablets o plegables. */
  contentMaxWidth: 760,
  compactBreakpoint: 380,
  tabletBreakpoint: 720,
} as const;

export type ToneName = 'light' | 'dark';
