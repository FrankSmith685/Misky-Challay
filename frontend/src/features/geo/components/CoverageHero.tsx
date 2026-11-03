import { ArrowDown, Bike, Clock3, MapPinCheck, ShieldCheck } from 'lucide-react';
import { Button } from '@components/ui/Button';

interface CoverageHeroProps {
  branchCount: number;
}

const signals = [
  { icon: MapPinCheck, label: 'Validación por ubicación exacta' },
  { icon: Clock3, label: 'Tiempo estimado antes de pedir' },
  { icon: ShieldCheck, label: 'Costo de delivery transparente' },
];

/** Encabezado comercial de cobertura con una explicación breve del flujo. */
export const CoverageHero = ({ branchCount }: CoverageHeroProps) => (
  <section className="relative isolate overflow-hidden bg-brand-900 text-white" aria-labelledby="coverage-hero-title">
    <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:42px_42px]" />
    <div className="absolute -left-28 top-12 size-80 rounded-full bg-brand-500/20 blur-3xl" />

    <div className="relative mx-auto grid max-w-8xl gap-9 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:gap-14 lg:px-8 lg:py-14">
      <div className="grid content-start gap-5">
        <div className="w-fit overflow-hidden rounded-2xl border-2 border-white/80 bg-white shadow-lg">
          <img src="/brand/misky-challay-square.jpeg" alt="Misky Challay, Pastelería Personalizada" width={160} height={160} className="size-28 object-cover sm:size-40" />
        </div>
        <span className="inline-flex items-center gap-2 rounded-pill border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-brand-50">
          <Bike className="size-3.5 text-brand-200" />
          Zonas y tiempos de entrega
        </span>

        <h1 id="coverage-hero-title" className="max-w-3xl text-4xl font-black leading-[1.02] tracking-[-.04em] sm:text-5xl lg:text-[3.45rem]">
          Tus momentos dulces, <span className="text-brand-200">hasta tu puerta.</span>
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-brand-50/80 sm:text-base sm:leading-7">
          Confirma tu dirección antes de elegir tus tortas y postres. Te mostraremos qué local
          puede atenderte, cuánto cuesta el envío y el tiempo estimado de llegada.
        </p>

        <ul className="flex flex-col gap-3 text-xs font-semibold text-brand-50/85 sm:flex-row sm:flex-wrap sm:gap-x-5">
          {signals.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-2">
              <Icon className="size-4 text-brand-200" />
              {label}
            </li>
          ))}
        </ul>

        <Button
          component="a"
          href="#verificar-cobertura"
          size="lg"
          variant="secondary"
          className="w-fit"
          leftIcon={<ArrowDown className="size-4" />}
        >
          Revisar mi dirección
        </Button>
      </div>

      <div className="rounded-card border border-white/15 bg-white/10 p-3 shadow-e5 backdrop-blur-sm sm:p-4">
        <div className="rounded-[3px] bg-white p-5 text-ink sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[.18em] text-brand-700">
                Antes de pedir
              </p>
              <h2 className="mt-1 text-xl font-black tracking-[-.02em]">Todo claro en 3 pasos</h2>
            </div>
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700">
              <MapPinCheck className="size-5" />
            </span>
          </div>

          <ol className="mt-5 space-y-3">
            {[
              ['01', 'Elige tu zona', 'Departamento, provincia y distrito de todo el Perú.'],
              ['02', 'Marca la entrada', 'Ajusta el pin en la puerta correcta.'],
              ['03', 'Confirma el resultado', 'Guarda la dirección y empieza a pedir.'],
            ].map(([number, title, description]) => (
              <li key={number} className="flex items-center gap-3 rounded-card bg-surface-muted px-3.5 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-card bg-brand-700 text-xs font-black text-white">
                  {number}
                </span>
                <span className="min-w-0">
                  <strong className="block text-sm text-ink">{title}</strong>
                  <span className="block text-xs leading-5 text-ink-muted">{description}</span>
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-4 text-center text-xs text-ink-muted">
            {branchCount > 0
              ? `${branchCount} ${branchCount === 1 ? 'local disponible' : 'locales disponibles'} para atenderte`
              : 'Estamos consultando nuestros locales'}
          </p>
        </div>
      </div>
    </div>
  </section>
);
