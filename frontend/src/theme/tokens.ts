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
  // Morado mora: tomado de los tonos profundos de la referencia visual.
  primary: '#602060', // brand-600
  secondary: '#e8940f', // accent-500
  tertiary: '#6d5ae8', // NUEVO: violeta de marca
  radius: 5,
};

/**
 * Rampa brand por defecto, identica a la de styles/index.css. Se usa cuando el
 * usuario no ha tocado el primary, para que el arranque sea pixel-identico.
 */
export const DEFAULT_BRAND_RAMP: ColorRamp = {
  50: '#f8f1f8',
  100: '#eddaed',
  200: '#ddbadf',
  300: '#c88dc9',
  400: '#aa62ad',
  500: '#813b86',
  600: '#602060',
  700: '#4e1a4e',
  800: '#3b143b',
  900: '#2a0e2a',
};

/**
 * Rampa accent por defecto, identica a la de styles/index.css. El acento se
 * ancla en el stop 500 (no en 600 como brand), asi que 600..900 son sombras.
 */
export const DEFAULT_ACCENT_RAMP: ColorRamp = {
  50: '#fff8ea',
  100: '#fdedcc',
  200: '#fbdb9a',
  300: '#f8c162',
  400: '#f5a524',
  500: '#e8940f',
  600: '#a76b0b',
  700: '#825308',
  800: '#644006',
  900: '#4d3105',
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
 * Tailwind pinten EL MISMO neutro morado en lugar de cuatro casi identicos.
 */
export const SURFACE = {
  base: '#ffffff',
  muted: '#f8f6f8',
  line: '#e7e0e7',
  ink: '#201820',
  inkMuted: '#675d68',
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
  tertiary: rampFromHex(tokens.tertiary),
  error: DEFAULT_ERROR_RAMP,
});

/** Limites del control de radio (px). */
export const RADIUS_RANGE = { min: 0, max: 5 } as const;

// v3 reinicia el color por defecto para que el cambio de identidad visual se
// aplique también a navegadores que ya guardaron los tokens verdes anteriores.
// La clave nueva evita que un tema verde guardado vuelva a pintar la app.
const STORAGE_KEY = 'vb.theme.tokens.v3';

/** Lee los tokens guardados y los combina con los valores por defecto. */
export const loadTokens = (): ThemeTokens => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TOKENS;
    const saved = JSON.parse(raw) as Partial<ThemeTokens>;
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
