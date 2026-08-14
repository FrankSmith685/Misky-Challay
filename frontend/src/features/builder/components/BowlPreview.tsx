import { ImageOff, Sparkles } from 'lucide-react';
import { cn } from '@lib/cn';
import type { BuilderOption } from '../types';

interface BowlPreviewProps {
  options: Array<BuilderOption & { quantity: number }>;
  isUpdating?: boolean;
}

/** Vista viva del bowl basada en las imágenes locales configuradas por ingrediente. */
export const BowlPreview = ({ options, isUpdating = false }: BowlPreviewProps) => {
  const visible = options.flatMap((option) =>
    Array.from({ length: Math.min(option.quantity, 2) }, (_, index) => ({ ...option, visualKey: `${option.id}-${index}` })),
  ).slice(0, 9);

  return (
    <figure aria-label={options.length ? `Vista del bowl con ${options.map((option) => option.name).join(', ')}` : 'Vista previa del bowl vacío'}>
      <div className="relative mx-auto aspect-square w-full max-w-[285px]">
        <div className="absolute inset-[5%] rounded-full bg-[radial-gradient(circle_at_50%_42%,#fff_0%,#f5efe5_64%,#d9cab8_65%,#f8f4ed_74%,#c9b59f_76%,#8c7663_100%)] shadow-[0_26px_45px_rgba(76,55,37,.2)]" />
        <div className="absolute inset-[16%] grid grid-cols-3 grid-rows-3 overflow-hidden rounded-full bg-[#efe7d8] p-1 shadow-inner">
          {visible.length ? visible.map((option, index) => (
            <div
              key={option.visualKey}
              className={cn(
                'relative min-h-0 overflow-hidden rounded-[42%] bg-brand-50 shadow-sm transition-all duration-500 motion-reduce:transition-none',
                isUpdating ? 'scale-95 opacity-75' : 'scale-100 opacity-100',
              )}
              style={{ transform: `rotate(${((index % 3) - 1) * 5}deg)` }}
              title={option.name}
            >
              {option.imageUrl ? (
                <img src={option.imageUrl} alt="" aria-hidden="true" className="size-full object-cover" style={{ objectPosition: option.imagePosition }} />
              ) : (
                <span className="grid size-full place-items-center text-[10px] font-black text-brand-800">{option.name.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
          )) : (
            <div className="col-span-3 row-span-3 grid place-items-center text-center text-ink-muted">
              <span><ImageOff className="mx-auto size-6 opacity-50" /><small className="mt-2 block max-w-28">Elige ingredientes para ver tu bowl</small></span>
            </div>
          )}
        </div>
        {options.length > 0 && (
          <span className="absolute right-[7%] top-[9%] grid size-9 place-items-center rounded-full bg-white text-brand-700 shadow-lg">
            <Sparkles className="size-4" />
          </span>
        )}
      </div>
      {options.length > 0 && (
        <figcaption className="mt-2 flex flex-wrap justify-center gap-1.5">
          {options.slice(0, 5).map((option) => (
            <span key={option.id} className="rounded-pill bg-white px-2 py-1 text-[10px] font-semibold text-ink-muted ring-1 ring-line">
              {option.name}{option.quantity > 1 ? ` ×${option.quantity}` : ''}
            </span>
          ))}
          {options.length > 5 && <span className="px-1 py-1 text-[10px] font-semibold text-brand-700">+{options.length - 5} más</span>}
        </figcaption>
      )}
    </figure>
  );
};
