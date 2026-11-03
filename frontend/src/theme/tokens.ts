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
};

/** Valores por defecto. Coinciden con styles/index.css para no alterar el look inicial. */
export const DEFAULT_TOKENS: ThemeTokens = {
  primary: '#8b3d59',
  secondary: '#c28a47',
  tertiary: '#527363',
  radius: 5,
};

/**
 * Rampa brand por defecto, identica a la de styles/index.css. Se usa cuando el
 * usuario no ha tocado el primary, para que el arranque sea pixel-identico.
 */
export const DEFAULT_BRAND_RAMP: ColorRamp = {
  50: '#fcf5f6',
  100: '#f5e6eb',
  200: '#e9cbd6',
  300: '#d8a5b8',
  400: '#bf7893',
  500: '#a55475',
  600: '#8b3d59',
  700: '#713047',
  800: '#572538',
  900: '#391b28',
};

/**
 * Rampa accent por defecto, identica a la de styles/index.css. El acento se
 * ancla en el stop 500 (no en 600 como brand), asi que 600..900 son sombras.
 */
export const DEFAULT_ACCENT_RAMP: ColorRamp = {
  50: '#fcf7ee',
  100: '#f6ecd8',
  200: '#ead6b1',
  300: '#dbba83',
  400: '#ce9f60',
  500: '#c28a47',
  600: '#a16b31',
  700: '#805027',
  800: '#633e23',
  900: '#442b1c',
};

/** Color complementario compartido por Tailwind y Material UI. */
export const DEFAULT_TERTIARY_RAMP: ColorRamp = {
  50: '#f2f7f3',
  100: '#e4eee6',
  200: '#c8dccd',
  300: '#a2bfa9',
  400: '#80a48c',
  500: '#658a73',
  600: '#527363',
  700: '#415c4e',
  800: '#33483d',
  900: '#24332c',
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
  muted: '#faf6f1',
  line: '#e7ddd5',
  ink: '#352721',
  inkMuted: '#76665e',
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
    return {
      primary: isHex(saved.primary ?? '') ? saved.primary! : DEFAULT_TOKENS.primary,
      secondary: isHex(saved.secondary ?? '') ? saved.secondary! : DEFAULT_TOKENS.secondary,
      tertiary: isHex(saved.tertiary ?? '') ? saved.tertiary! : DEFAULT_TOKENS.tertiary,
      radius:
        typeof saved.radius === 'number'
          ? Math.min(RADIUS_RANGE.max, Math.max(RADIUS_RANGE.min, saved.radius))
          : DEFAULT_TOKENS.radius,
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
