/**
 * VALIDACION DE DOCUMENTOS PERUANOS
 * ---------------------------------------------------------------------------
 * Un RUC no es "11 digitos cualquiera": empieza por 10/15/16/17/20 y su ultimo
 * digito es un verificador (modulo 11). Aceptar un RUC estructuralmente imposible
 * (99999999999, 12345678901) hace que la factura se guarde y luego el OSE la
 * rechace, sin forma de recuperar el dato real. Validarlo al capturar lo evita.
 */

/** DNI: 8 digitos. */
export const isValidDni = (value: string): boolean => /^\d{8}$/.test(value.trim());

/** RUC: 11 digitos, prefijo valido y digito verificador correcto (modulo 11). */
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
