import { type ColorRamp } from './colorUtils';
import { rampsFromTokens, type ThemeTokens } from './tokens';

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
  const ramp = rampsFromTokens(tokens);

  // Las tres rampas se publican COMPLETAS: sobrescribir solo 400/500 dejaba las
  // demas paradas de accent con el valor de index.css mientras el editor movia
  // el color, y el aviso sin cobertura del carrito quedaba de otro tono.
  setRamp(root, 'brand', ramp.brand);
  setRamp(root, 'accent', ramp.accent);
  setRamp(root, 'tertiary', ramp.tertiary);

  const radius = Math.min(5, Math.max(0, tokens.radius));
  root.setProperty('--radius-field', `${radius}px`);
  root.setProperty('--radius-card', `${radius}px`);
  root.setProperty('--radius-pill', `${radius}px`);
  root.setProperty('--font-sans', tokens.fontFamily === 'serif' ? 'Georgia, Cambria, serif' : tokens.fontFamily === 'system' ? 'ui-sans-serif, system-ui, sans-serif' : "'Inter', ui-sans-serif, system-ui, sans-serif");
  root.setProperty('--text-base-size', `${Math.min(18, Math.max(14, tokens.baseFontSize))}px`);
  const shadow = Math.min(1.5, Math.max(0, tokens.shadowStrength / 100));
  root.setProperty('--density-scale', tokens.density === 'compact' ? '0.88' : '1');
  root.setProperty('--shadow-alpha-e1', String(0.05 * shadow));
  root.setProperty('--shadow-alpha-e2', String(0.06 * shadow));
  root.setProperty('--shadow-alpha-e3', String(0.10 * shadow));
  root.setProperty('--shadow-alpha-e4', String(0.14 * shadow));
  root.setProperty('--shadow-alpha-e5', String(0.20 * shadow));
};
