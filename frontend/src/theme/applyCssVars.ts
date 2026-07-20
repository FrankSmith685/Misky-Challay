import { rampFromHex, tint, type ColorRamp } from './colorUtils';
import { DEFAULT_BRAND_RAMP, DEFAULT_TOKENS, type ThemeTokens } from './tokens';

/**
 * Sincroniza los tokens del tema con las VARIABLES CSS de Tailwind v4
 * (definidas en styles/index.css como --color-brand-*, --color-accent-*, etc.).
 *
 * Gracias a esto, al cambiar un color en el editor no solo se actualizan los
 * componentes de MUI, sino tambien todo lo que usa clases Tailwind de marca
 * (bg-brand-600, text-accent-500, el header del panel, etc.).
 */

const STOPS: Array<keyof ColorRamp> = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const setRamp = (root: CSSStyleDeclaration, name: string, ramp: ColorRamp) => {
  STOPS.forEach((stop) => {
    root.setProperty(`--color-${name}-${stop}`, ramp[stop]);
  });
};

export const applyCssVars = (tokens: ThemeTokens): void => {
  const root = document.documentElement.style;

  // Marca (brand). Si el primary sigue en su valor por defecto usamos la rampa
  // afinada a mano de index.css; si cambio, la generamos desde el color elegido.
  const brand = tokens.primary === DEFAULT_TOKENS.primary ? DEFAULT_BRAND_RAMP : rampFromHex(tokens.primary);
  setRamp(root, 'brand', brand);

  // Acento (secondary) -> Tailwind solo usa accent-400/500.
  root.setProperty('--color-accent-500', tokens.secondary);
  root.setProperty('--color-accent-400', tint(tokens.secondary, 0.18));

  // Tercer color (nuevo) -> rampa completa tertiary-*.
  setRamp(root, 'tertiary', rampFromHex(tokens.tertiary));

  // Radio de tarjeta usado por Tailwind (rounded-card).
  root.setProperty('--radius-card', `${tokens.radius}px`);
};
