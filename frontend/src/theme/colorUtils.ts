/**
 * Utilidades de color SIN dependencias externas.
 *
 * Se usan para el tema gestionable: a partir de un color base (hex) generamos
 * una rampa 50..900 coherente (tintes hacia blanco y sombras hacia negro) para
 * alimentar tanto a Material UI como a las variables CSS de Tailwind.
 */

export type Rgb = { r: number; g: number; b: number };

/** '#abc' o '#aabbcc' -> {r,g,b}. Devuelve negro si el formato es invalido. */
export const hexToRgb = (hex: string): Rgb => {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
};

const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

export const rgbToHex = ({ r, g, b }: Rgb): string =>
  '#' + [r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('');

/** Mezcla un color hacia un valor de canal objetivo (255 = blanco, 0 = negro). */
const mixChannel = (base: string, target: number, weight: number): string => {
  const { r, g, b } = hexToRgb(base);
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex({
    r: r + (target - r) * w,
    g: g + (target - g) * w,
    b: b + (target - b) * w,
  });
};

/** Acerca el color al blanco (tinte mas claro). */
export const tint = (hex: string, weight: number): string => mixChannel(hex, 255, weight);

/** Acerca el color al negro (sombra mas oscura). */
export const shade = (hex: string, weight: number): string => mixChannel(hex, 0, weight);

export type ColorRamp = Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>;

/**
 * Genera una rampa 50..900 desde un color base, anclando el color elegido en el
 * stop 600 (el "main"). Los tonos claros son tintes; los oscuros, sombras.
 */
export const rampFromHex = (hex: string): ColorRamp => ({
  50: tint(hex, 0.92),
  100: tint(hex, 0.84),
  200: tint(hex, 0.68),
  300: tint(hex, 0.48),
  400: tint(hex, 0.26),
  500: tint(hex, 0.1),
  600: hex,
  700: shade(hex, 0.18),
  800: shade(hex, 0.34),
  900: shade(hex, 0.48),
});

/** Luminancia relativa sRGB (0 = negro, 1 = blanco). */
const luminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

/** Devuelve el color de texto legible (tinta oscura o blanco) sobre un fondo. */
export const readableText = (hex: string, dark = '#14201a', light = '#ffffff'): string =>
  luminance(hex) > 0.42 ? dark : light;

/** Valida si una cadena es un hex de 3 o 6 digitos con '#'. */
export const isHex = (value: string): boolean => /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
