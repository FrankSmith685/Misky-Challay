import { isHex, type ColorRamp } from './colorUtils';

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
  primary: '#237c52', // brand-600
  secondary: '#e8940f', // accent-500
  tertiary: '#6d5ae8', // NUEVO: violeta de marca
  radius: 12,
};

/**
 * Rampa brand por defecto, identica a la de styles/index.css. Se usa cuando el
 * usuario no ha tocado el primary, para que el arranque sea pixel-identico.
 */
export const DEFAULT_BRAND_RAMP: ColorRamp = {
  50: '#f0f9f4',
  100: '#dcf2e4',
  200: '#bbe5cd',
  300: '#8ed1ac',
  400: '#5ab585',
  500: '#369a68',
  600: '#237c52',
  700: '#1c6243',
  800: '#194e37',
  900: '#16412f',
};

/** Limites del control de radio (px). */
export const RADIUS_RANGE = { min: 0, max: 24 } as const;

const STORAGE_KEY = 'vb.theme.tokens.v1';

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
        typeof saved.radius === 'number' && saved.radius >= RADIUS_RANGE.min && saved.radius <= RADIUS_RANGE.max
          ? saved.radius
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
