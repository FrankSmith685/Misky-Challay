export const whatsappNumber = (phone: string | null | undefined): string | null => {
  const value = phone?.trim() ?? '';
  const digits = value.replace(/\D/g, '');
  const number = /^9\d{8}$/.test(digits) ? `51${digits}` : digits;
  if (!(/^519\d{8}$/.test(number) || (value.startsWith('+') && /^[1-9]\d{9,14}$/.test(number))) || number === '51999999999') return null;
  return number;
};

/** Abre una conversación con el negocio; el cliente revisa y envía el texto. */
export const whatsappLink = (phone: string | null | undefined, message: string): string | null => {
  const number = whatsappNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
};
