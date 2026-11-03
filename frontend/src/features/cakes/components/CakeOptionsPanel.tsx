import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { Input } from '@components/ui/Input';
import { Button } from '@components/ui/Button';
import type { CakeBuilderState } from '../hooks/useCakeBuilder';
import { CakeOptionCard } from './CakeOptionCard';

const searchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');

export const CakeOptionsPanel = ({
  builder,
  activeGroupId,
  onGroupChange,
  priceScale,
}: {
  builder: CakeBuilderState;
  activeGroupId: number | null;
  onGroupChange: (id: number | null) => void;
  priceScale: number;
}) => {
  const [queries, setQueries] = useState<Record<number, string>>({});
  const groups = builder.config?.groups ?? [];
  const selectedIds = builder.selections.map((selection) => selection.optionId);
  const selectedNames = Object.fromEntries(
    groups.flatMap((group) => group.options.map((option) => [option.id, option.name])),
  );

  return (
    <div className="space-y-3">
      {groups.map((group, index) => {
        const expanded = (activeGroupId ?? groups[0]?.id) === group.id;
        const used = builder.unitsInGroup(group);
        const complete = used >= group.minSelection && used <= group.maxSelection;
        const chosen = group.options
          .filter((option) => builder.getQuantity(option.id) > 0)
          .map((option) => option.name);
        const nextGroup =
          groups[index + 1] ??
          groups.find(
            (entry) => builder.missingGroups.includes(entry.name) && entry.id !== group.id,
          );
        const nextLabel = nextGroup
          ? `${nextGroup.minSelection > 0 ? 'Elegir' : 'Ver'} ${nextGroup.name.toLocaleLowerCase('es')}`
          : '';
        const next = () => {
          if (nextGroup) onGroupChange(nextGroup.id);
        };
        const query = queries[group.id] ?? '';
        const visibleOptions = group.options.filter((option) =>
          searchText(`${option.name} ${option.description ?? ''}`).includes(
            searchText(query.trim()),
          ),
        );
        return (
          <section
            key={group.id}
            data-cake-group-id={group.id}
            data-cake-group-name={group.name}
            className={`scroll-mt-28 overflow-hidden rounded-xl border ${expanded ? 'border-brand-200' : 'border-line'}`}
          >
            <h3>
              <button
                type="button"
                data-cake-group-toggle
                aria-expanded={expanded}
                aria-controls={`cake-group-${group.id}`}
                onClick={() => onGroupChange(expanded ? -1 : group.id)}
                className={`flex w-full items-center gap-3 p-4 text-left sm:px-5 ${expanded ? 'bg-brand-50/50' : 'bg-white hover:bg-surface-muted'}`}
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold ${complete && chosen.length ? 'bg-brand-700 text-white' : 'bg-surface-muted text-ink-muted'}`}
                >
                  {complete && chosen.length ? <Check className="size-4" /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold text-ink">
                    {group.name}
                    <span className="rounded-card bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted">
                      {group.minSelection > 0 ? 'Obligatorio' : 'Opcional'}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-muted">
                    {chosen.length
                      ? chosen.join(', ')
                      : group.minSelection > 1
                        ? `Elige al menos ${group.minSelection} opciones`
                        : group.minSelection > 0
                          ? 'Elige una opción para continuar'
                          : 'Puedes continuar sin agregar extras'}
                  </span>
                </span>
                <ChevronDown
                  className={`size-4 shrink-0 text-ink-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
            </h3>
            {expanded && (
              <div id={`cake-group-${group.id}`} className="border-t border-line p-4 sm:p-5">
                {complete && chosen.length > 0 && nextGroup && (
                  <div className="mb-4 flex flex-col gap-3 rounded-card border border-brand-100 bg-brand-50/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div
                      role="status"
                      className="flex min-w-0 items-start gap-2 text-xs text-brand-900"
                    >
                      <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="font-semibold">Selección lista</p>
                        <p className="mt-0.5 break-words text-ink-muted">{chosen.join(', ')}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={nextGroup?.minSelection === 0 ? 'outline' : 'primary'}
                      onClick={next}
                      sx={{ whiteSpace: 'normal', flexShrink: 0 }}
                    >
                      {nextLabel}
                      <ChevronRight className="ml-1 size-4 shrink-0" aria-hidden="true" />
                    </Button>
                  </div>
                )}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <p className="max-w-lg text-xs leading-5 text-ink-muted">
                    {group.description || 'Elige la opción que más te guste.'}
                  </p>
                  <span className="text-[11px] font-semibold text-brand-700">
                    {group.selectionType === 'SINGLE'
                      ? 'Una elección'
                      : `Hasta ${group.maxSelection} opciones`}
                  </span>
                </div>
                {group.options.length >= 8 && (
                  <div className="mb-4">
                    <Input
                      id={`cake-option-search-${group.id}`}
                      label="Buscar una opción"
                      value={query}
                      onChange={(event) =>
                        setQueries((current) => ({ ...current, [group.id]: event.target.value }))
                      }
                      startAdornment={<Search className="size-4 text-ink-muted" />}
                      endAdornment={
                        query ? (
                          <button
                            type="button"
                            aria-label="Limpiar búsqueda"
                            onClick={() =>
                              setQueries((current) => ({ ...current, [group.id]: '' }))
                            }
                            className="grid size-8 place-items-center rounded-lg text-ink-muted hover:bg-surface-muted"
                          >
                            <X className="size-4" />
                          </button>
                        ) : undefined
                      }
                    />
                    <p role="status" className="mt-2 text-[11px] text-ink-muted">
                      {query
                        ? `${visibleOptions.length} de ${group.options.length} opciones`
                        : `${group.options.length} opciones para elegir`}
                    </p>
                  </div>
                )}
                <div className="grid items-start gap-3 sm:grid-cols-2">
                  {visibleOptions.map((option) => (
                    <CakeOptionCard
                      key={option.id}
                      group={group}
                      option={option}
                      priceMultiplier={option.cakeScaleWithServings ? priceScale : 1}
                      quantity={builder.getQuantity(option.id)}
                      used={used}
                      selectedIds={selectedIds}
                      selectedOptionNames={selectedNames}
                      onToggle={() => builder.toggleOption(group, option.id)}
                      onQuantityChange={(delta) => builder.changeQuantity(group, option.id, delta)}
                      onResolveConflict={() => builder.resolveConflict(group, option.id)}
                    />
                  ))}
                </div>
                {!visibleOptions.length && (
                  <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
                    <Search className="mx-auto size-5 text-ink-muted" />
                    <p className="mt-3 text-sm font-medium text-ink">No encontramos esa opción</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Prueba otro nombre o limpia la búsqueda para ver todas.
                    </p>
                  </div>
                )}
                {complete && nextGroup && (
                  <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs leading-5 text-ink-muted">
                      {nextGroup?.minSelection === 0
                        ? 'Los adicionales son opcionales. Puedes continuar a detalles.'
                        : `Siguiente paso: ${nextGroup.name.toLocaleLowerCase('es')}.`}
                    </p>
                    <Button
                      variant={nextGroup?.minSelection === 0 ? 'outline' : 'primary'}
                      onClick={next}
                      sx={{ whiteSpace: 'normal', flexShrink: 0 }}
                    >
                      {nextLabel}
                      <ChevronRight className="ml-1 size-4 shrink-0" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
