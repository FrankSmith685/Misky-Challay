/** DNI peruano: ocho dígitos. El backend vuelve a validar antes de guardar. */
export const isValidDni = (value: string): boolean => /^\d{8}$/.test(value.trim());

/** RUC peruano con prefijo permitido y dígito verificador módulo 11. */
export const isValidRuc = (value: string): boolean => {
  const ruc = value.trim();
  if (!/^(10|15|16|17|20)\d{9}$/.test(ruc)) return false;

  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + weight * Number(ruc[index]), 0);
  let check = 11 - (sum % 11);
  if (check === 10) check = 0;
  if (check === 11) check = 1;
  return check === Number(ruc[10]);
};
