/** Admite celulares peruanos y números internacionales explícitos. */
export const whatsappNumber = (phone?: string | null): string | null => {
  const value = phone?.trim() ?? '';
  const digits = value.replace(/\D/g, '');
  if (digits === '999999999' || digits === '51999999999') return null;
  if (/^9\d{8}$/.test(digits)) return `51${digits}`;
  if (/^519\d{8}$/.test(digits)) return digits;
  if (value.startsWith('+') && /^[1-9]\d{9,14}$/.test(digits)) return digits;
  return null;
};

export const whatsappLink = (phone: string | null | undefined, message: string): string | null => {
  const number = whatsappNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
};
