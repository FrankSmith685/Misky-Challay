/**
 * Un telefono identifica a una persona, no a la forma en que lo escribio.
 *
 * `users.phone` tiene indice UNICO, pero se guardaba el texto tal cual llegaba:
 * para MySQL "926 749 330" y "926749330" son valores distintos, asi que el indice
 * NO impedia que la misma linea se registrara dos veces. Se normaliza a digitos
 * —conservando el prefijo internacional si lo trae— antes de comparar y guardar.
 *
 * No valida el numero: de eso se encarga el esquema de entrada. Aqui solo se
 * decide como se almacena, para que comparar dos telefonos sea comparar dos
 * cadenas iguales.
 */
export const normalizePhone = (value?: string | null): string | null => {
  if (value == null) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const isInternational = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  return isInternational ? `+${digits}` : digits;
};
