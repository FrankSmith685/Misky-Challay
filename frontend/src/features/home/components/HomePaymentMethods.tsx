import { Banknote, CreditCard, ShieldCheck, Smartphone } from 'lucide-react';
import { MarketingSection } from '@components/marketing';
import { AppLogo } from '@components/common/AppLogo';
import { useCodSettings, useLocalPaymentSettings, useOnlinePaymentSettings } from '@services/businessInfo';

type PaymentMethod = {
  label: string;
  Icon: typeof CreditCard;
};

export const HomePaymentMethods = () => {
  const online = useOnlinePaymentSettings();
  const local = useLocalPaymentSettings();
  const cod = useCodSettings();
  const methods: Array<PaymentMethod | null> = [
    online.onlineEnabled ? { label: online.onlineProvider === 'mercadopago' ? 'Mercado Pago' : 'Tarjetas', Icon: CreditCard } : null,
    local.yapeEnabled ? { label: 'Yape', Icon: Smartphone } : null,
    local.plinEnabled ? { label: 'Plin', Icon: Smartphone } : null,
    cod.enabled ? { label: 'Contra entrega', Icon: Banknote } : null,
  ];
  const enabledMethods = methods.filter((method): method is PaymentMethod => method !== null);
  const visibleMethods = enabledMethods.length ? enabledMethods : [{ label: 'Pago seguro', Icon: ShieldCheck }];

  return (
    <MarketingSection tone="soft" contentClassName="py-8 sm:py-10 lg:py-12">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-brand-100 bg-white p-4 shadow-e2 sm:p-6 lg:p-7">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-accent-500 to-tertiary-500" />
        <div className="grid items-center gap-5 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-8">
          <div className="flex justify-center lg:justify-start">
            <div className="rounded-2xl border border-brand-100 bg-surface-muted p-2">
              <AppLogo inverse className="[&>span]:h-11 [&>span]:w-36 sm:[&>span]:h-12 sm:[&>span]:w-40" />
            </div>
          </div>

          <div className="min-w-0 text-center lg:text-left">
            <p className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Compra segura
            </p>
            <h2 className="mt-2 text-xl font-black tracking-tight text-ink sm:text-2xl">Paga como prefieras</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-ink-muted">
              Elige un método disponible al confirmar tu pedido y sigue cada paso con claridad.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 lg:max-w-sm lg:justify-end" aria-label="Métodos de pago disponibles">
            {visibleMethods.map(({ label, Icon }) => (
              <span key={label} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3.5 text-xs font-extrabold text-brand-900 shadow-sm">
                <Icon className="size-4 text-brand-700" aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </MarketingSection>
  );
};
