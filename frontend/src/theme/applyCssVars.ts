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

  // Todos los radios rectangulares respetan el límite visual de 5px.
  const radius = `${Math.min(5, Math.max(0, tokens.radius))}px`;
  root.setProperty('--radius-field', radius);
  root.setProperty('--radius-card', radius);
  root.setProperty('--radius-pill', radius);
};
