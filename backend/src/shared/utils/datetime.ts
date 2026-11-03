import { env } from '@config/env';

/** Para replacements de SQL crudo: Sequelize no aplica ahí la zona UTC de los modelos. */
export const sqlUtcDatetime = (date: Date): string =>
  date.toISOString().slice(0, 23).replace('T', ' ');

/**
 * FECHAS CON ZONA HORARIA EXPLICITA
 * ---------------------------------------------------------------------------
 * Un `Date` es un instante, no una fecha de calendario. "Que dia es" y "que hora
 * es" solo tienen respuesta dentro de una zona horaria.
 *
 * El horario de una sucursal se comprobaba mezclando dos relojes: la fecha salia
 * de `toISOString()` (UTC) y el dia de la semana y la hora de `getDay()`/`getHours()`
 * (hora local del proceso). En un contenedor —que arranca en UTC— un local abierto
 * de 10:00 a 22:00 se evaluaba de 05:00 a 17:00 hora de Lima y rechazaba todos los
 * pedidos de la cena. Incluso con el proceso en Lima, entre las 19:00 y las 23:59 la
 * fecha UTC ya es la del dia siguiente, asi que los cierres por feriado
 * (`exceptionDate`) se aplicaban el dia equivocado.
 *
 * Aqui las partes se derivan del MISMO instante y de la MISMA zona.
 */
export interface ZonedParts {
  /** Fecha de calendario en la zona indicada, formato YYYY-MM-DD. */
  isoDate: string;
  /** Dia de la semana, 0 = domingo (misma convencion que Date.getDay). */
  weekday: number;
  /** Minutos transcurridos desde la medianoche local. */
  minutes: number;
}

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Construir un Intl.DateTimeFormat no es gratis y esto corre en cada cotizacion.
const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  const cached = formatters.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  });

  formatters.set(timeZone, formatter);
  return formatter;
};

/** Zona horaria de la operacion cuando no se conoce la ciudad del pedido. */
export const defaultTimeZone = (): string => env.TZ;

export const zonedParts = (when: Date, timeZone: string = env.TZ): ZonedParts => {
  const parts = formatterFor(timeZone).formatToParts(when);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return {
    isoDate: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
};

/**
 * Desfase de la zona respecto a UTC en ese instante, en milisegundos.
 * Peru no aplica horario de verano (siempre -5h); se calcula de todos modos por si
 * algun dia se opera en una zona que si lo aplica.
 */
const offsetMs = (when: Date, timeZone: string): number => {
  const { isoDate, minutes } = zonedParts(when, timeZone);
  const [year, month, day] = isoDate.split('-').map(Number);

  const readInZone = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  // `when` truncado a minutos: `readInZone` tampoco lleva segundos.
  const readInUtc = Math.floor(when.getTime() / 60_000) * 60_000;

  return readInZone - readInUtc;
};

/**
 * Instante que corresponde a una hora de calendario concreta en una zona.
 * Inversa de `zonedParts`: "las 12:00 del 3 de agosto en Lima" -> Date.
 */
export const zonedDateAt = (
  isoDate: string,
  hour: number,
  minute: number,
  timeZone: string = env.TZ,
): Date => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  return new Date(naive.getTime() - offsetMs(naive, timeZone));
};

/** Suma dias sobre la fecha de calendario, no sobre el instante. */
export const addDaysToIsoDate = (isoDate: string, days: number): string => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
