import { addDaysToIsoDate, zonedDateAt, zonedParts } from '@shared/utils/datetime';

/** Base nacional, contrastada con https://www.gob.pe/feriados. Las excepciones se gestionan en el panel. */
export const nationalComplaintHolidays = (year: number): Array<{ holidayDate: string; label: string; isActive: boolean }> => {
  const fixed: Array<[string, string]> = [
    ['01-01', 'Año Nuevo'], ['05-01', 'Día del Trabajo'], ['06-07', 'Batalla de Arica y Día de la Bandera'],
    ['06-29', 'San Pedro y San Pablo'], ['07-23', 'Día de la Fuerza Aérea del Perú'],
    ['07-28', 'Fiestas Patrias'], ['07-29', 'Fiestas Patrias'], ['08-06', 'Batalla de Junín'],
    ['08-30', 'Santa Rosa de Lima'], ['10-08', 'Combate de Angamos'], ['11-01', 'Todos los Santos'],
    ['12-08', 'Inmaculada Concepción'], ['12-09', 'Batalla de Ayacucho'], ['12-25', 'Navidad'],
  ];
  // Computus gregoriano para los dos feriados movibles de Semana Santa.
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return [
    ...fixed.map(([date, label]) => ({ holidayDate: `${year}-${date}`, label, isActive: true })),
    { holidayDate: addDaysToIsoDate(easter, -3), label: 'Jueves Santo', isActive: true },
    { holidayDate: addDaysToIsoDate(easter, -2), label: 'Viernes Santo', isActive: true },
  ].sort((left, right) => left.holidayDate.localeCompare(right.holidayDate));
};

export const computeComplaintDueDate = (from: Date, businessDays: number, holidays: ReadonlySet<string>): Date => {
  let iso = zonedParts(from).isoDate;
  let added = 0;
  while (added < businessDays) {
    iso = addDaysToIsoDate(iso, 1);
    const weekday = zonedParts(zonedDateAt(iso, 12, 0)).weekday;
    if (weekday !== 0 && weekday !== 6 && !holidays.has(iso)) added += 1;
  }
  return new Date(zonedDateAt(iso, 23, 59).getTime() + 59_999);
};
