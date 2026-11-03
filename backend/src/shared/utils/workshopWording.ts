import replacements from './workshopWording.json';

/** Convert customer-facing wording without touching identifiers or contact data. */
export const workshopWording = (value: string): string => {
  const protectedStores: string[] = [];
  const source = value.replace(
    /(?:(?:la|una|tu|esta|otra|qué) )?tiendas? de (?:aplicaciones|apps|Google Play|Apple)\b/gi,
    (match) => {
      protectedStores.push(match);
      return `__APP_STORE_REFERENCE_${protectedStores.length - 1}__`;
    },
  );
  const result = replacements.reduce(
    (text, [before, after]) => text.split(before).join(after),
    source,
  );
  return result.replace(
    /__APP_STORE_REFERENCE_(\d+)__/g,
    (_match, index: string) => protectedStores[Number(index)],
  );
};

export const workshopContent = (value: unknown): unknown => {
  if (typeof value === 'string') return workshopWording(value);
  if (Array.isArray(value)) return value.map(workshopContent);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, workshopContent(item)]),
    );
  return value;
};
