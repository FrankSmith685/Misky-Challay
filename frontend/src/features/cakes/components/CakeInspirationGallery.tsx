import { CakeSlice, Sparkles } from 'lucide-react';
import type { BuilderPreset } from '@features/builder/types';

interface CakeInspirationGalleryProps {
  presets: BuilderPreset[];
  onApply: (preset: BuilderPreset) => void;
}

/** Ejemplos aprobados por el negocio: la foto orienta, las opciones seleccionadas son las que se cotizan. */
export const CakeInspirationGallery = ({ presets, onApply }: CakeInspirationGalleryProps) => {
  if (presets.length === 0) return null;

  return <section className="mt-6 rounded-2xl border border-brand-100 bg-white p-5 shadow-e1 sm:p-7" aria-labelledby="cake-inspiration-title">
    <div className="flex items-start gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Sparkles className="size-5" /></span>
      <div>
        <h2 id="cake-inspiration-title" className="text-xl font-black text-ink">Ideas para empezar tu torta</h2>
        <p className="mt-1 text-sm leading-6 text-ink-muted">Elige una combinación preparada por la pastelería y luego cambia las opciones que prefieras. La foto es una referencia visual; el acabado final puede variar.</p>
      </div>
    </div>
    <div className="mt-5 flex snap-x gap-4 overflow-x-auto pb-2" role="list">
      {presets.map((preset) => <div key={preset.id} role="listitem" className="w-56 shrink-0 snap-start overflow-hidden rounded-2xl border border-line bg-white">
        {preset.imageUrl ? <img src={preset.imageUrl} alt="" loading="lazy" className="h-32 w-full object-cover" /> : <div className="grid h-32 place-items-center bg-brand-50 text-brand-700"><CakeSlice className="size-8" /></div>}
        <div className="p-4">
          {preset.badge && <span className="mb-2 inline-block rounded-full bg-accent-100 px-2.5 py-1 text-[10px] font-bold text-accent-700">{preset.badge}</span>}
          <h3 className="font-extrabold text-ink">{preset.name}</h3>
          {preset.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-muted">{preset.description}</p>}
          <button type="button" onClick={() => onApply(preset)} className="mt-4 w-full rounded-lg bg-brand-700 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">Usar esta idea</button>
        </div>
      </div>)}
    </div>
  </section>;
};
