import { BookmarkCheck, Sparkles, Trash2 } from 'lucide-react';
import type { BuilderPreset, SavedBowl } from '../types';

interface BuilderStartersProps {
  savedBowls: SavedBowl[];
  presets: BuilderPreset[];
  onApplySaved: (bowl: SavedBowl) => void;
  onDeleteSaved: (bowl: SavedBowl) => void;
  onApplyPreset: (preset: BuilderPreset) => void;
}

/** Atajos reutilizables para comenzar desde favoritos o combinaciones sugeridas. */
export const BuilderStarters = ({
  savedBowls,
  presets,
  onApplySaved,
  onDeleteSaved,
  onApplyPreset,
}: BuilderStartersProps) => {
  if (savedBowls.length === 0 && presets.length === 0) return null;

  return (
    <section className="min-w-0 rounded-card border border-line bg-white p-5 shadow-e2 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">Atajos deliciosos</p>
          <h2 className="mt-1.5 text-xl font-black tracking-tight text-ink sm:text-2xl">Empieza con una buena idea</h2>
          <p className="mt-1 text-sm text-ink-muted">Luego puedes cambiar cada ingrediente.</p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-pill bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 sm:inline-flex">
          <Sparkles className="size-3.5" /> Un toque para aplicar
        </span>
      </div>

      <div className="mt-5 flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {savedBowls.map((bowl) => (
          <article
            key={`saved-${bowl.id}`}
            className="group relative w-56 shrink-0 snap-start overflow-hidden rounded-card border border-brand-200 bg-gradient-to-br from-brand-50 to-white"
          >
            <button type="button" onClick={() => onApplySaved(bowl)} className="w-full p-4 text-left">
              <span className="mb-5 grid size-10 place-items-center rounded-card bg-white text-brand-700 shadow-sm">
                <BookmarkCheck className="size-5" />
              </span>
              <span className="block font-extrabold text-ink">{bowl.name}</span>
              <span className="mt-1.5 block text-xs leading-5 text-ink-muted">
                {bowl.selections.length} ingredientes · tu favorito
              </span>
            </button>
            <button
              type="button"
              aria-label={`Eliminar ${bowl.name}`}
              onClick={() => onDeleteSaved(bowl)}
              className="absolute right-2.5 top-2.5 rounded-field bg-white p-2 text-ink-muted shadow-sm transition hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </article>
        ))}

        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onApplyPreset(preset)}
            className="relative w-56 shrink-0 snap-start overflow-hidden rounded-card border border-line bg-surface-muted text-left transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-e3"
          >
            {preset.imageUrl ? (
              <img src={preset.imageUrl} alt="" width={512} height={208} className="h-28 w-full object-cover" loading="lazy" />
            ) : (
              <div className="grid h-28 place-items-center bg-gradient-to-br from-brand-100 to-brand-50 text-brand-600">
                <Sparkles className="size-7" />
              </div>
            )}
            <span className="block p-4">
              {preset.badge && (
                <span className="mb-2 inline-flex rounded-pill bg-accent-100 px-2.5 py-1 text-[10px] font-extrabold text-accent-700">
                  {preset.badge}
                </span>
              )}
              <span className="block font-extrabold text-ink">{preset.name}</span>
              <span className="mt-1 block line-clamp-2 text-xs leading-5 text-ink-muted">{preset.description}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};
