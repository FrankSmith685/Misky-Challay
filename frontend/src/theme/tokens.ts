import { isHex, rampFromHex, rampFromHexAt500, type ColorRamp } from './colorUtils';

/**
 * TOKENS DEL TEMA GESTIONABLE.
 *
 * Estos son los valores que el editor visual del Sistema de Diseno permite
 * cambiar en vivo. Se guardan en localStorage (por navegador) y alimentan tanto
 * al tema de Material UI (buildTheme) como a las variables CSS de Tailwind
 * (applyCssVars).
 */
export type ThemeTokens = {
  /** Color de marca. Mapea a palette.primary (MUI) y a la rampa brand-* (Tailwind). */
  primary: string;
  /** Color de acento calido. Mapea a palette.secondary y a accent-* (Tailwind). */
  secondary: string;
  /** Tercer color de marca (NUEVO). Mapea a palette.tertiary y a tertiary-* (Tailwind). */
  tertiary: string;
  /** Radio de bordes base en px (MUI shape.borderRadius). */
  radius: number;
  /** Familia tipográfica segura; no requiere descargar una fuente nueva. */
  fontFamily: 'inter' | 'system' | 'serif';
  /** Tamaño base del texto, limitado para conservar legibilidad y ritmo. */
  baseFontSize: number;
  density: 'comfortable' | 'compact';
  shadowStrength: number;
};

/** Valores por defecto de la identidad visual actual. */
export const DEFAULT_TOKENS: ThemeTokens = {
  primary: '#006fb9',
  secondary: '#ffbd16',
  tertiary: '#f15b3a',
  radius: 5,
  fontFamily: 'inter',
  baseFontSize: 16,
  density: 'comfortable',
  shadowStrength: 100,
};

/** Identidad anterior inmediata, usada solo para migrar preferencias guardadas. */
const PREVIOUS_DEFAULT_TOKENS: ThemeTokens = {
  primary: '#24577a',
  secondary: '#e29a3b',
  tertiary: '#3e7d72',
  radius: 5,
  fontFamily: 'inter',
  baseFontSize: 16,
  density: 'comfortable',
  shadowStrength: 100,
};

/** Identidad histórica, usada solo para migrar preferencias guardadas. */
const LEGACY_DEFAULT_TOKENS: ThemeTokens = {
  primary: '#8b3d59',
  secondary: '#c28a47',
  tertiary: '#527363',
  radius: 5,
  fontFamily: 'inter',
  baseFontSize: 16,
  density: 'comfortable',
  shadowStrength: 100,
};

/**
 * Rampa brand por defecto, identica a la de styles/index.css. Se usa cuando el
 * usuario no ha tocado el primary, para que el arranque sea pixel-identico.
 */
export const DEFAULT_BRAND_RAMP: ColorRamp = {
  50: '#ebf3f9',
  100: '#d6e8f4',
  200: '#add1e9',
  300: '#7ab4db',
  400: '#4294cb',
  500: '#1a7dc0',
  600: '#006fb9',
  700: '#005b98',
  800: '#00497a',
  900: '#003a60',
};

/**
 * Rampa accent por defecto, identica a la de styles/index.css. El acento se
 * ancla en el stop 500 (no en 600 como brand), asi que 600..900 son sombras.
 */
export const DEFAULT_ACCENT_RAMP: ColorRamp = {
  50: '#fffbf1',
  100: '#fff6e1',
  200: '#ffedbe',
  300: '#ffde8b',
  400: '#ffc940',
  500: '#ffbd16',
  600: '#b88810',
  700: '#8f6a0c',
  800: '#6e5109',
  900: '#543e07',
};

/** Color complementario compartido por Tailwind y Material UI. */
export const DEFAULT_TERTIARY_RAMP: ColorRamp = {
  50: '#fef2ef',
  100: '#fde5df',
  200: '#fbcbc0',
  300: '#f8aa99',
  400: '#f5866d',
  500: '#f26b4e',
  600: '#f15b3a',
  700: '#c64b30',
  800: '#9f3c26',
  900: '#7d2f1e',
};

/**
 * Rampa de error. No es gestionable desde el editor: el rojo de aviso no debe
 * moverse con la marca, pero si necesita paradas numericas para los fondos
 * suaves de alertas y banners.
 */
export const DEFAULT_ERROR_RAMP: ColorRamp = {
  50: '#fef2f2',
  100: '#fee2e2',
  200: '#fecaca',
  300: '#fca5a5',
  400: '#f87171',
  500: '#ef4444',
  600: '#dc2626',
  700: '#b91c1c',
  800: '#991b1b',
  900: '#7f1d1d',
};

/**
 * Superficies y tintas neutras. Espejo en JS de los tokens --color-surface,
 * --color-line y --color-ink de styles/index.css, para que el tema de MUI y
 * Tailwind pinten los mismos neutros.
 */
export const SURFACE = {
  base: '#ffffff',
  muted: '#f5faff',
  line: '#d6e5ef',
  ink: '#17324d',
  inkMuted: '#5b7185',
} as const;

/** Rampas completas 50..900 derivadas de los tokens gestionables. */
export type ThemeRamps = {
  brand: ColorRamp;
  accent: ColorRamp;
  tertiary: ColorRamp;
  error: ColorRamp;
};

/**
 * Fuente unica de las rampas: la consumen tanto applyCssVars (variables CSS de
 * Tailwind) como buildTheme (paletas de MUI). Si el color sigue en su valor por
 * defecto usamos la rampa afinada a mano; si cambio, la generamos.
 */
export const rampsFromTokens = (tokens: ThemeTokens): ThemeRamps => ({
  brand: tokens.primary === DEFAULT_TOKENS.primary ? DEFAULT_BRAND_RAMP : rampFromHex(tokens.primary),
  accent: tokens.secondary === DEFAULT_TOKENS.secondary ? DEFAULT_ACCENT_RAMP : rampFromHexAt500(tokens.secondary),
  tertiary: tokens.tertiary === DEFAULT_TOKENS.tertiary ? DEFAULT_TERTIARY_RAMP : rampFromHex(tokens.tertiary),
  error: DEFAULT_ERROR_RAMP,
});

/** Limites del control de radio (px). */
export const RADIUS_RANGE = { min: 0, max: 5 } as const;

// Conserva la clave del editor y las paletas personalizadas.
const STORAGE_KEY = 'misky-challay.theme.tokens.v2';

/** Lee los tokens guardados y los combina con los valores por defecto. */
export const loadTokens = (): ThemeTokens => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TOKENS;
    const saved = JSON.parse(raw) as Partial<ThemeTokens>;
    // Actualiza solo la combinación azul anterior; conserva las paletas elegidas.
    if (saved.primary?.toLowerCase() === '#006acb'
      && saved.secondary?.toLowerCase() === '#ff8a0b'
      && saved.tertiary?.toLowerCase() === '#008dd4') {
      return { ...DEFAULT_TOKENS, radius: typeof saved.radius === 'number' ? Math.min(RADIUS_RANGE.max, Math.max(RADIUS_RANGE.min, saved.radius)) : DEFAULT_TOKENS.radius };
    }
    const migrateLegacy = <K extends 'primary' | 'secondary' | 'tertiary'>(key: K): string =>
      [PREVIOUS_DEFAULT_TOKENS, LEGACY_DEFAULT_TOKENS].some((previous) => saved[key]?.toLowerCase() === previous[key])
        ? DEFAULT_TOKENS[key]
        : saved[key] ?? DEFAULT_TOKENS[key];
    return {
      primary: isHex(migrateLegacy('primary')) ? migrateLegacy('primary') : DEFAULT_TOKENS.primary,
      secondary: isHex(migrateLegacy('secondary')) ? migrateLegacy('secondary') : DEFAULT_TOKENS.secondary,
      tertiary: isHex(migrateLegacy('tertiary')) ? migrateLegacy('tertiary') : DEFAULT_TOKENS.tertiary,
      radius:
        typeof saved.radius === 'number'
          ? Math.min(RADIUS_RANGE.max, Math.max(RADIUS_RANGE.min, saved.radius))
          : DEFAULT_TOKENS.radius,
      fontFamily: saved.fontFamily === 'system' || saved.fontFamily === 'serif' || saved.fontFamily === 'inter'
        ? saved.fontFamily
        : DEFAULT_TOKENS.fontFamily,
      baseFontSize: typeof saved.baseFontSize === 'number'
        ? Math.min(18, Math.max(14, saved.baseFontSize))
        : DEFAULT_TOKENS.baseFontSize,
      density: saved.density === 'compact' ? 'compact' : 'comfortable',
      shadowStrength: typeof saved.shadowStrength === 'number'
        ? Math.min(150, Math.max(0, saved.shadowStrength))
        : DEFAULT_TOKENS.shadowStrength,
    };
  } catch {
    return DEFAULT_TOKENS;
  }
};

/** Persiste los tokens en localStorage (silencioso si el navegador lo bloquea). */
export const saveTokens = (tokens: ThemeTokens): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // Modo privado o storage lleno: no es critico.
  }
};
