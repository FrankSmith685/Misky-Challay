const CURRENCY = 'PEN';
const LOCALE = 'es-PE';

export const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY }).format(amount);

export const formatCalories = (calories: number): string => `${Math.round(calories)} kcal`;

export const formatMacro = (grams: number): string => `${Math.round(grams)} g`;

export const formatDate = (value: string | Date): string =>
  new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }).format(
    typeof value === 'string' ? new Date(value) : value,
  );

/**
 * FECHAS DEL PANEL
 * ---------------------------------------------------------------------------
 * `formatDate` siempre imprime fecha Y hora, asi que quien solo necesitaba una
 * de las dos se escribia su propio `toLocaleString`: llegaron a convivir tres
 * formatos distintos en la misma pantalla. Estos tres helpers cubren los casos
 * que faltaban; `formatDate` y `formatCurrency` no cambian.
 *
 * Un timestamp corrupto no debe tumbar una pantalla entera: `Intl` lanza
 * RangeError con una fecha invalida, de ahi el guion como salida segura.
 */
const INVALID = '—';

const toDate = (value: string | Date): Date | null => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Solo la hora, en 24h: "14:35". */
export const formatTime = (value: string | Date): string => {
  const date = toDate(value);
  if (!date) return INVALID;
  // hourCycle 'h23' y no `hour12: false`: este ultimo imprime "24:15" a medianoche.
  return new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
};

/** Solo la fecha, en formato peruano: "06/08/2026". */
export const formatDateOnly = (value: string | Date): string => {
  const date = toDate(value);
  if (!date) return INVALID;
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Antiguedad legible de un dato: "hace 5 min".
 *
 * Se queda en unidades cortas a proposito (min / h / d): se pinta en banderolas
 * de estado y en cabeceras de tarjeta, donde "hace 5 minutos" ya no cabe. A
 * partir de una semana la distancia deja de ser informativa y se da la fecha.
 */
export const formatRelative = (value: string | Date): string => {
  const date = toDate(value);
  if (!date) return INVALID;

  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  if (abs < 45_000) return diff >= 0 ? 'hace un momento' : 'en un momento';

  const prefix = diff >= 0 ? 'hace' : 'en';
  const minutes = Math.floor(abs / MINUTE);
  if (minutes < 60) return `${prefix} ${Math.max(1, minutes)} min`;

  const hours = Math.floor(abs / HOUR);
  if (hours < 24) return `${prefix} ${hours} h`;

  const days = Math.floor(abs / DAY);
  if (days < 7) return `${prefix} ${days} d`;

  return formatDateOnly(date);
};
