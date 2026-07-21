/**
 * VALIDACION DE DOCUMENTOS PERUANOS (espejo del backend)
 * ---------------------------------------------------------------------------
 * Misma logica que backend/src/shared/utils/peruDocs.ts. El backend es la
 * autoridad; esto solo adelanta el error al usuario para no enviar una factura
 * con un RUC imposible y que el checkout falle al final. Si cambia una regla,
 * cambia en ambos lados.
 */

/** DNI: 8 digitos. */
export const isValidDni = (value: string): boolean => /^\d{8}$/.test(value.trim());

/** RUC: 11 digitos, prefijo valido (10/15/16/17/20) y digito verificador (modulo 11). */
export const isValidRuc = (value: string): boolean => {
  const ruc = value.trim();
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, weight, index) => acc + weight * Number(ruc[index]), 0);
  let check = 11 - (sum % 11);
  if (check === 10) check = 0;
  if (check === 11) check = 1;

  return check === Number(ruc[10]);
};
