export type DirectPaymentState =
  | 'AWAITING_PAYMENT'
  | 'REVIEW'
  | 'OBSERVED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export interface DirectPaymentSnapshot {
  phone: string;
  recipient: string;
  qrImageUrl: string;
  instructions: string;
  expiresAt: string;
  reviewAlertMinutes: number;
}

export const isDirectProvider = (provider: string): provider is 'yape' | 'plin' =>
  provider === 'yape' || provider === 'plin';

export const directState = (
  paymentStatus: string,
  claimStatus: string | null,
  orderStatus: string,
  expired: boolean,
  remaining: number,
  refundRequired = false,
): DirectPaymentState => {
  if (paymentStatus === 'REFUNDED') return 'REFUNDED';
  if (paymentStatus === 'SUCCEEDED')
    return (refundRequired || ['CANCELLED', 'REFUNDED'].includes(orderStatus)) && remaining > 0
      ? 'REFUND_PENDING'
      : 'CONFIRMED';
  // A report is a claim, never proof of receipt. It stays visible even after cancellation.
  if (claimStatus === 'PENDING') return 'REVIEW';
  if (claimStatus === 'OBSERVED') return 'OBSERVED';
  if (claimStatus === 'REJECTED') return 'REJECTED';
  if (paymentStatus === 'FAILED' || ['CANCELLED', 'REFUNDED'].includes(orderStatus) || expired)
    return 'EXPIRED';
  return 'AWAITING_PAYMENT';
};

export const holdsDirectReview = (claimStatus: string | null | undefined): boolean =>
  claimStatus === 'PENDING' || claimStatus === 'OBSERVED';

export const decodeDirectEvidence = (value?: string): { mime: string; bytes: Buffer } | null => {
  if (!value) return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new Error('Adjunta una imagen JPG, PNG o WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  const valid =
    match[1] === 'image/png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid || bytes.length > 512 * 1024 || bytes.length < 12)
    throw new Error('La constancia debe ser una imagen válida de hasta 512 KB.');
  return { mime: match[1], bytes };
};
