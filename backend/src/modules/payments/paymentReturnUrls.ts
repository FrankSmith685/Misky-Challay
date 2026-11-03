/** Rutas de retorno propias: nunca se aceptan URLs arbitrarias desde el cliente. */
export type PaymentClient = 'WEB' | 'MOBILE';

export const buildOrderReturnUrls = (
  orderNumber: string,
  client: PaymentClient,
  frontendBaseUrl: string,
  mobileReturnBaseUrl?: string,
) => {
  const isMobile = client === 'MOBILE';
  const baseUrl = isMobile ? (mobileReturnBaseUrl ?? frontendBaseUrl) : frontendBaseUrl;
  const path = isMobile ? '/checkout/movil' : '/checkout/confirmacion';
  // URL resuelve la ruta desde el origen aunque la variable de entorno termine
  // en '/'. Concatenar cadenas producía '//checkout/confirmacion' y un 404.
  const success = new URL(path, baseUrl);
  success.searchParams.set('pedido', orderNumber);
  if (isMobile) success.searchParams.set('resultado', 'aprobado');

  const cancel = new URL(path, baseUrl);
  cancel.searchParams.set('pedido', orderNumber);
  if (isMobile) cancel.searchParams.set('resultado', 'cancelado');
  else cancel.searchParams.set('pago', 'cancelado');

  return { successUrl: success.toString(), cancelUrl: cancel.toString() };
};
