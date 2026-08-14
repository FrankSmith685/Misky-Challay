import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  HeartHandshake,
  MapPinCheck,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { AppLogo } from '@components/common/AppLogo';
import { ROUTES } from '@constants/routes';
import { cn } from '@lib/cn';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}

const benefits = [
  {
    icon: MapPinCheck,
    title: 'Tus direcciones listas',
    description: 'Compra más rápido en cada visita.',
  },
  {
    icon: WalletCards,
    title: 'Saldo y beneficios',
    description: 'Todo visible desde tu cuenta.',
  },
  {
    icon: HeartHandshake,
    title: 'Una experiencia personal',
    description: 'Favoritos, bowls y pedidos guardados.',
  },
];

/**
 * Marco compartido para acceso y recuperación. Mantiene una jerarquía estable
 * en las cuatro pantallas y reduce el formulario a una sola columna en móvil.
 */
export const AuthShell = ({
  eyebrow,
  title,
  description,
  children,
  wide = false,
}: AuthShellProps) => (
  <section className="relative isolate overflow-hidden bg-surface-muted px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
    <div className="pointer-events-none absolute -left-28 top-16 size-80 rounded-full bg-brand-200/45 blur-3xl" />
    <div className="pointer-events-none absolute -right-24 bottom-10 size-80 rounded-full bg-accent-400/15 blur-3xl" />

    <div
      className={cn(
        'relative mx-auto grid overflow-hidden rounded-card border border-line bg-white shadow-e3',
        wide
          ? 'max-w-6xl lg:grid-cols-[minmax(340px,.82fr)_minmax(0,1.18fr)]'
          : 'max-w-5xl lg:grid-cols-[minmax(360px,.94fr)_minmax(0,1.06fr)]',
      )}
    >
      <aside className="relative hidden min-h-[650px] overflow-hidden bg-brand-900 p-10 text-white lg:flex lg:flex-col xl:p-12">
        <div className="absolute -right-28 -top-24 size-80 rounded-full bg-white/8" />
        <div className="absolute -bottom-28 -left-24 size-72 rounded-full border-[42px] border-white/5" />

        <div className="relative">
          <AppLogo inverse />

          <span className="mt-12 inline-flex items-center gap-2 rounded-pill border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-brand-50">
            <Sparkles className="size-3.5 text-accent-400" />
            Tu cuenta, todo más simple
          </span>
          <p className="mt-5 max-w-md text-4xl font-black leading-[1.08] tracking-[-.04em]">
            Come bien. Nosotros recordamos el resto.
          </p>
          <p className="mt-4 max-w-md text-sm leading-7 text-brand-50/72">
            Accede a una experiencia pensada para ahorrar pasos: tus pedidos, direcciones,
            beneficios y preferencias siempre disponibles.
          </p>

          <div className="mt-8 grid gap-3">
            {benefits.map(({ icon: Icon, title: benefitTitle, description: benefitDescription }) => (
              <div
                key={benefitTitle}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/8 p-3.5 backdrop-blur-sm"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-100">
                  <Icon className="size-4.5" />
                </span>
                <div>
                  <p className="text-sm font-extrabold">{benefitTitle}</p>
                  <p className="mt-0.5 text-xs leading-5 text-brand-50/65">
                    {benefitDescription}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative mt-8 flex items-start gap-2.5 border-t border-white/10 pt-5">
          <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-brand-200" />
          <p className="text-xs leading-5 text-brand-50/65">
            Protegemos tu sesión y nunca mostramos tu contraseña al equipo de Verde Bowl.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col justify-center p-5 sm:p-8 md:p-10 xl:p-12">
        <div className="mb-6 lg:hidden">
          <Link
            to={ROUTES.home}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-ink-muted transition-colors hover:text-brand-700"
          >
            <ArrowLeft className="size-3.5" />
            Volver al inicio
          </Link>
        </div>

        <div className="mb-7 sm:mb-8">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">
            <CheckCircle2 className="size-3.5" />
            {eyebrow}
          </span>
          <h1 className="mt-2 text-3xl font-black tracking-[-.035em] text-ink sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted sm:text-base">
            {description}
          </p>
        </div>

        <div className="grid gap-5">
          {children}
        </div>

        <p className="mt-7 flex items-center justify-center gap-1.5 text-center text-[11px] leading-5 text-ink-muted">
          <ShieldCheck className="size-3.5 text-brand-600" />
          Acceso protegido y datos cifrados.
        </p>
      </div>
    </div>
  </section>
);
