import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  CheckCircle2,
  HeartHandshake,
  MapPinCheck,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
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
    description: 'Tus tortas favoritas y pedidos guardados.',
  },
];

/** Marco visual compartido para acceso, registro y recuperación de cuenta. */
export const AuthShell = ({
  eyebrow,
  title,
  description,
  children,
  wide = false,
}: AuthShellProps) => (
  <section className="relative isolate min-h-[100svh] overflow-hidden bg-[#eef5fb] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_12%,rgba(0,111,185,.14),transparent_30%),radial-gradient(circle_at_92%_88%,rgba(255,189,22,.16),transparent_28%)]" />
    <div className="pointer-events-none absolute -right-28 top-28 size-72 rounded-full border-[24px] border-white/50" />
    <div className="pointer-events-none absolute -bottom-40 -left-24 size-[30rem] rounded-full border-[32px] border-brand-100/40" />

    <div className="relative mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-7xl flex-col">
      <header className="mb-4 flex items-center justify-between px-1 sm:mb-6 sm:px-2">
        <div className="flex min-w-0 items-center gap-3">
          <Link to={ROUTES.home} aria-label="Ir al inicio de Misky Challay" className="inline-flex shrink-0">
            <img
              src="/brand/misky-challay-wordmark.png"
              alt="Misky Challay"
              width={176}
              height={56}
              className="h-10 w-36 object-contain object-left sm:h-11 sm:w-44"
            />
          </Link>
          <span className="hidden border-l border-line pl-3 text-xs font-bold uppercase tracking-[.14em] text-ink-muted sm:block">
            Mi cuenta
          </span>
        </div>
        <Link
          to={ROUTES.home}
          className="group inline-flex items-center gap-1.5 rounded-pill border border-line bg-white/80 px-3.5 py-2 text-xs font-extrabold text-ink-muted shadow-sm backdrop-blur transition hover:border-brand-200 hover:text-brand-700 sm:px-4 sm:text-sm"
        >
          Volver a la tienda
          <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      </header>

      <div
        className={cn(
          'relative grid flex-1 overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_24px_80px_rgba(23,50,77,.14)]',
          wide
            ? 'lg:grid-cols-[minmax(320px,.86fr)_minmax(0,1.14fr)]'
            : 'lg:grid-cols-[minmax(340px,.9fr)_minmax(0,1.1fr)]',
        )}
      >
        <aside className="relative hidden min-h-[700px] overflow-hidden bg-brand-900 p-8 text-white lg:flex lg:flex-col xl:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_14%,rgba(62,163,224,.32),transparent_28%),linear-gradient(140deg,#0878bd_0%,#005487_48%,#003e65_100%)]" />
          <div className="pointer-events-none absolute -right-24 top-24 size-64 rounded-full border-[26px] border-white/8" />
          <div className="pointer-events-none absolute -bottom-28 -left-16 size-72 rounded-full bg-accent-400/10 blur-2xl" />

          <div className="relative z-10 flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 rounded-pill border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[.12em] text-brand-50">
              <Sparkles className="size-3.5 text-accent-400" />
              Misky Challay
            </span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-brand-50/70">
              <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,.12)]" />
              Cuenta segura
            </span>
          </div>

          <div className="relative z-10 mt-16 max-w-lg xl:mt-20">
            <p className="text-sm font-bold text-brand-100">Tu espacio personal</p>
            <h2 className="mt-3 max-w-[25rem] text-[clamp(2.5rem,4vw,4.25rem)] font-black leading-[.98] tracking-[-.055em] text-white">
              Celebra sin complicarte.
            </h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-brand-50/75">
              Guarda tus preferencias una sola vez y vuelve a disfrutar lo que te gusta en cada pedido.
            </p>
          </div>

          <div className="relative z-10 mt-10 grid gap-2.5">
            {benefits.map(({ icon: Icon, title: benefitTitle, description: benefitDescription }) => (
              <div
                key={benefitTitle}
                className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-3.5 py-3 transition-colors hover:bg-white/12"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-100 ring-1 ring-white/10">
                  <Icon className="size-4.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-white">{benefitTitle}</p>
                  <p className="mt-0.5 text-xs leading-5 text-brand-50/65">{benefitDescription}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="relative z-10 mt-auto flex items-start gap-2.5 border-t border-white/10 pt-6">
            <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-brand-200" />
            <p className="text-xs leading-5 text-brand-50/65">
              Protegemos tu sesión y nunca mostramos tu contraseña al equipo de Misky Challay.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-col justify-center bg-white px-5 py-7 sm:px-9 sm:py-10 md:px-12 lg:px-14 xl:px-16">
          <div className="mb-8 flex items-center justify-between gap-4 border-b border-line pb-5">
            <div className="flex items-center gap-2 text-xs font-extrabold text-ink-muted">
              <span className="grid size-7 place-items-center rounded-full bg-brand-700 text-[11px] text-white">01</span>
              <span>Acceso a tu cuenta</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700">
              <ShieldCheck className="size-3.5" />
              Privado y cifrado
            </span>
          </div>

          <div className="mb-7 sm:mb-8">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">
              <CheckCircle2 className="size-3.5" />
              {eyebrow}
            </span>
            <h1 className="mt-2 text-3xl font-black tracking-[-.045em] text-ink sm:text-[2.65rem] sm:leading-[1.05]">
              {title}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted sm:text-base">
              {description}
            </p>
          </div>

          <div className="grid gap-5">{children}</div>

          <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-[11px] leading-5 text-ink-muted">
            <ShieldCheck className="size-3.5 text-brand-600" />
            Acceso protegido y datos cifrados.
          </p>
        </div>
      </div>
    </div>
  </section>
);
