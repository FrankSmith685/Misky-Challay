import type { CartItem } from '@/types/domain';
import type { CheckoutInput } from './types';

const KEY = 'dulceflow:checkout-attempt:v1';
export interface CheckoutAttempt {
  key: string;
  userId: number;
  input: CheckoutInput;
  items: CartItem[];
}
let memory: CheckoutAttempt | null = null;
export function readCheckoutAttempt(userId?: number): CheckoutAttempt | null {
  try {
    memory = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    /* Use the current in-memory attempt. */
  }
  return memory?.userId === userId ? memory : null;
}
export function beginCheckoutAttempt(
  userId: number,
  input: CheckoutInput,
  items: CartItem[],
): CheckoutAttempt {
  const attempt = structuredClone({ key: crypto.randomUUID(), userId, input, items });
  // An uncertain purchase must survive a reload before we send it to the server.
  sessionStorage.setItem(KEY, JSON.stringify(attempt));
  memory = attempt;
  return attempt;
}
export function forgetCheckoutAttempt() {
  memory = null;
  sessionStorage.removeItem(KEY);
}
