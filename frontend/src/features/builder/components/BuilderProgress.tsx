import { useEffect, useRef, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@lib/cn';
import type { BuilderGroup } from '../types';

/** Alto del header pegajoso. Alimenta el `top` de esta barra. */
const HEADER_VAR = '--builder-header-h';
/** Franja pegajosa total (header + esta barra) + aire. Alimenta los anclajes. */
const OFFSET_VAR = '--builder-anchor-offset';

/**
 * Margen de scroll único de los anclajes del constructor. El respaldo es 176px
 * porque era el único de los tres valores escritos a mano que cubría la franja
 * real; la medición en vivo lo ajusta al header (64px hasta el md de MUI, 72px
 * a partir de 900px) y al alto que tome la barra cuando los pasos saltan de línea.
 */
export const BUILDER_SCROLL_ANCHOR: CSSProperties = {
  scrollMarginTop: `var(${OFFSET_VAR}, 176px)`,
};

interface BuilderProgressProps {
  groups: BuilderGroup[];
  completedGroups: number;
  requiredGroups: number;
  progress: number;
  unitsInGroup: (group: BuilderGroup) => number;
  activeGroupId: number | null;
  onStepSelect: (group: BuilderGroup) => void;
}

/** Navegación persistente por pasos con progreso accesible. */
export const BuilderProgress = ({
  groups,
  completedGroups,
  requiredGroups,
  progress,
  unitsInGroup,
  activeGroupId,
  onStepSelect,
}: BuilderProgressProps) => {
  const barRef = useRef<HTMLDivElement>(null);

  // El header crece en el breakpoint de MUI (900px) y esta barra en el de
  // Tailwind: cualquier valor fijo se desfasa en algún ancho, así que se miden.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return undefined;
    const header = document.querySelector<HTMLElement>('header.MuiAppBar-root');
    const root = document.documentElement;

    const sync = () => {
      const headerHeight = header?.offsetHeight || 64;
      root.style.setProperty(HEADER_VAR, `${headerHeight}px`);
      // +12px para que el título del paso no quede pegado al borde de la barra.
      root.style.setProperty(OFFSET_VAR, `${headerHeight + bar.offsetHeight + 12}px`);
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(bar);
    if (header) observer.observe(header);

    return () => {
      observer.disconnect();
      root.style.removeProperty(HEADER_VAR);
      root.style.removeProperty(OFFSET_VAR);
    };
  }, []);

  return (
    <div
      ref={barRef}
      style={{ top: `var(${HEADER_VAR}, 64px)` }}
      className="sticky z-20 border-b border-line bg-white/95 shadow-e3 backdrop-blur"
    >
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center justify-between gap-4 text-xs">
              <span className="font-extrabold text-ink">Tu progreso</span>
              <span className="shrink-0 font-semibold text-ink-muted">
                {completedGroups}/{requiredGroups} esenciales
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-pill bg-surface-muted"
              role="progressbar"
              aria-label="Progreso del bowl"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div
                className="h-full rounded-pill bg-gradient-to-r from-brand-500 to-brand-700 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <span className="hidden rounded-pill bg-brand-50 px-3 py-1.5 text-xs font-black text-brand-700 sm:block">
            {Math.round(progress)}%
          </span>
        </div>

        <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]" aria-label="Pasos del constructor">
          {groups.map((group, index) => {
            const done =
              group.minSelection === 0
                ? unitsInGroup(group) > 0
                : unitsInGroup(group) >= group.minSelection;
            const active = activeGroupId === group.id;
            return (
              <button
                key={group.id}
                type="button"
                aria-current={active ? 'step' : undefined}
                onClick={() => {
                  onStepSelect(group);
                  requestAnimationFrame(() =>
                    document
                      .getElementById(`builder-group-${group.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                  );
                }}
                className={cn(
                  'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill border px-3.5 py-2 text-xs font-bold transition-all',
                  active
                    ? 'border-brand-700 bg-brand-700 text-white shadow-e1'
                    : done
                    ? 'border-brand-200 bg-brand-50 text-brand-800'
                    : 'border-line bg-white text-ink-muted hover:border-brand-200 hover:text-ink',
                )}
              >
                <span
                  className={cn(
                    'grid size-5 place-items-center rounded-pill text-[10px]',
                    active
                      ? 'bg-white/20 text-white'
                      : done
                        ? 'bg-brand-600 text-white'
                        : 'bg-surface-muted text-ink-muted',
                  )}
                >
                  {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                </span>
                {group.name}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};
