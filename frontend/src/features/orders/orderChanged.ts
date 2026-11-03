import type { OrderDetail } from '@features/checkout/types';

export const ORDER_CHANGED_EVENT = 'dulceflow:order-changed';

/** Avisa a las vistas persistentes cuando el backend devuelve un estado nuevo. */
export const announceOrderChanged = (order?: OrderDetail): void => {
  window.dispatchEvent(new CustomEvent<OrderDetail | undefined>(ORDER_CHANGED_EVENT, { detail: order }));
};
