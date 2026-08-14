import { Stepper } from './Stepper';

/** Etapas del embudo de compra, para orientar al cliente. */
const CHECKOUT_STEPS = [{ label: 'Carrito' }, { label: 'Datos y pago' }, { label: 'Confirmación' }];

/** Indicador de progreso del embudo (0 = carrito, 1 = checkout, 2 = confirmación). */
export const CheckoutStepper = ({ current, className }: { current: 0 | 1 | 2; className?: string }) => (
  <Stepper steps={CHECKOUT_STEPS} current={current} className={className} />
);
