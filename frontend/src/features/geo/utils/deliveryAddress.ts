import type { SelectedAddress } from '@context/AppStateContext';

export const DELIVERY_REFERENCE_MAX_LENGTH = 200;

export const getDeliveryReferenceError = (address: SelectedAddress): string | undefined => {
  const reference = address.reference?.trim() ?? '';
  if (reference.length > DELIVERY_REFERENCE_MAX_LENGTH) return 'La referencia admite hasta 200 caracteres.';
  return undefined;
};
