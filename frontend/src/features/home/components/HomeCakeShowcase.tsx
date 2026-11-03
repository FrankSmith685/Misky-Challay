import { CakeSlice, Check, Palette } from 'lucide-react';

/** Original home composition, recovered from the workspace change history. */
export const HomeCakeShowcase = () => (
  <div role="group" aria-label="Diseños de tortas para celebrar" className="relative mx-auto w-full max-w-[620px] pb-6 lg:pb-0">
    <div className="absolute -left-4 -top-4 h-28 w-28 border-l-2 border-t-2 border-brand-500 sm:-left-6 sm:-top-6" />
    <div className="absolute -bottom-2 -right-4 h-28 w-28 border-b-2 border-r-2 border-accent-400 sm:-right-6" />
    <div className="absolute right-2 top-2 z-20 w-24 rotate-6 overflow-hidden rounded-card border-4 border-white bg-white shadow-e4 sm:right-0 sm:-top-8 sm:w-28 lg:-right-8 xl:w-32">
      <img src="/brand/misky-challay-square.jpeg" alt="Misky Challay, pastelería personalizada" width={256} height={256} className="aspect-square w-full object-cover" />
    </div>

    <figure className="relative overflow-hidden rounded-card border border-white/90 bg-white p-2 shadow-e5 sm:p-3">
      <div className="relative overflow-hidden rounded-[3px]">
        <img
          src="/images/cakes/custom.png"
          alt="Torta personalizada de Misky Challay"
          width={960}
          height={720}
          loading="eager"
          decoding="async"
          className="aspect-[1.18/1] size-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink/70 via-ink/15 to-transparent" />
        <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-white sm:p-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-brand-100">Preparada para tu fecha</p>
            <p className="mt-1 text-xl font-black">Tu momento, a tu manera</p>
          </div>
          <span className="hidden items-center gap-1.5 rounded-pill border border-white/30 bg-black/20 px-3 py-2 text-xs font-bold backdrop-blur sm:flex">
            <Check className="size-3.5" /> Precio visible
          </span>
        </figcaption>
      </div>
    </figure>

    <div className="absolute -left-3 top-[42%] hidden w-48 rounded-card border border-line bg-white p-3 shadow-xl sm:block lg:-left-16">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-card bg-accent-400/15 text-accent-500"><Palette className="size-4" /></span>
        <div><p className="text-xs font-black text-ink">Diseño acompañado</p><p className="text-[10px] text-ink-muted">Una idea clara en cada paso</p></div>
      </div>
    </div>

    <div className="absolute -bottom-3 right-5 hidden w-[250px] rounded-card border border-line bg-white p-3 shadow-xl sm:block">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-wider text-brand-800">Tres formas de celebrar</p>
        <CakeSlice className="size-3.5 text-brand-600" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { image: '/images/cakes/vanilla.png', label: 'Clásica' },
          { image: '/images/cakes/custom.png', label: 'A tu gusto' },
          { image: '/images/cakes/special.png', label: 'Especial' },
        ].map((cake) => (
          <div key={cake.label} className="relative overflow-hidden rounded-[3px]">
            <img src={cake.image} alt="" width={120} height={90} loading="eager" className="aspect-[4/3] size-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-1 py-0.5 text-center text-[9px] font-bold text-white">{cake.label}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

