/** Convierte un celular peruano o un número internacional explícito al formato de Meta. */
export const whatsappRecipient = (phone?: string | null): string | null => {
  const value = phone?.trim() ?? '';
  const digits = value.replace(/\D/g, '');
  if (digits === '999999999' || digits === '51999999999') return null;
  if (/^9\d{8}$/.test(digits)) return `51${digits}`;
  if (/^519\d{8}$/.test(digits)) return digits;
  if (value.startsWith('+') && /^[1-9]\d{9,14}$/.test(digits)) return digits;
  return null;
};
