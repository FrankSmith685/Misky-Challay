/** Confirmation remains useful while preparation advances; terminal states suppress it. */
export const orderCommunicationIsRelevant = (event: string, status: string): boolean => {
  if (event === 'ORDER_RECEIVED') return status === 'PENDING_PAYMENT';
  if (event === 'ORDER_CONFIRMED') return ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'].includes(status);
  return event === `ORDER_${status}`;
};

export const orderWhatsappText = (orderNumber: string, status: string, url: string): string => {
  const body: Record<string, string> = {
    PENDING_PAYMENT: 'Recibimos tu pedido. El pago está pendiente de confirmación. Puedes responder para coordinar el diseño, las referencias y la entrega o el recojo; la preparación se confirma después del pago.',
    CONFIRMED: 'Tu pedido está confirmado. Puedes responder para coordinar el diseño, las imágenes de referencia y la entrega o el recojo con nuestro equipo.',
    PREPARING: 'Estamos preparando tu pedido. Seguimos atentos a tus consultas.',
    READY: 'Tu pedido está listo. Revisa el seguimiento para la entrega o el recojo.',
    OUT_FOR_DELIVERY: 'Tu pedido salió a reparto. Mantente disponible para recibirlo.',
    DELIVERED: 'Tu pedido fue entregado. Gracias por confiar en Misky Challay. Esperamos que disfrutes tu celebración. Si necesitas ayuda, contáctanos.',
    CANCELLED: 'Tu pedido fue cancelado. Consulta el detalle y contacta al taller si necesitas ayuda.',
  };
  return `Hola, somos Misky Challay. Pedido ${orderNumber}. ${body[status] ?? ''}\n${url}`;
};
