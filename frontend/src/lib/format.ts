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
