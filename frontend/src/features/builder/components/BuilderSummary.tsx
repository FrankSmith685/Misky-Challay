import {
  AlertCircle,
  ChevronRight,
  Download,
  Lightbulb,
  Loader2,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  Sparkles,
  WifiOff,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import { PriceBreakdown } from '@components/ui/PriceBreakdown';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import type {
  BuilderGroup,
  BuilderOption,
  BuilderVariant,
  QuoteResult,
} from '../types';
import { BowlPreview } from './BowlPreview';
import { BUILDER_SCROLL_ANCHOR } from './BuilderProgress';

export interface BuilderRecommendation {
  title: string;
  description: string;
  action: 'add' | 'remove';
  group: BuilderGroup;
  option: BuilderOption;
}

interface BuilderSummaryProps {
  productName: string;
  groups: BuilderGroup[];
  variant: BuilderVariant | null;
  selectedOptions: Array<BuilderOption & { quantity: number }>;
  quote: QuoteResult | null;
  recommendation: BuilderRecommendation | null;
  selectedAllergens: string[];
  preferenceConflicts: string[];
  missingGroups: string[];
  validationMessage: string | null;
  isOnline: boolean;
  isComplete: boolean;
  isQuoting: boolean;
  hasBranch: boolean;
  saveLabel: string;
  nextStepLabel: string | null;
  onApplyRecommendation: () => void;
  onRetryQuote: () => void;
  onContinue: () => void;
  onAddToCart: () => void;
  onSave: () => void;
  onReset: () => void;
  onExport: () => void;
}

export const BuilderSummary = ({
  productName,
  groups,
  variant,
  selectedOptions,
  quote,
  recommendation,
  selectedAllergens,
  preferenceConflicts,
  missingGroups,
  validationMessage,
  isOnline,
  isComplete,
  isQuoting,
  hasBranch,
  saveLabel,
  nextStepLabel,
  onApplyRecommendation,
  onRetryQuote,
  onContinue,
  onAddToCart,
  onSave,
  onReset,
  onExport,
}: BuilderSummaryProps) => (
  <aside
    id="builder-summary"
    style={BUILDER_SCROLL_ANCHOR}
    className="min-w-0 xl:sticky xl:top-44 xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto xl:overscroll-contain xl:pr-1 [scrollbar-width:thin]"
  >
    <div className="overflow-hidden rounded-card border border-line bg-white shadow-e4">
      <div className="border-b border-line bg-gradient-to-br from-brand-50 via-white to-accent-400/10 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">Resumen en vivo</p>
            <h2 className="mt-1.5 text-2xl font-black tracking-tight text-ink">Así va tu bowl</h2>
          </div>
          <div className="flex items-center gap-2">
            {selectedOptions.length > 0 && (
              <button
                type="button"
                aria-label="Compartir o descargar mi bowl"
                title="Compartir mi bowl"
                onClick={onExport}
                className="grid size-10 place-items-center rounded-field bg-white text-brand-700 shadow-sm ring-1 ring-line transition hover:-translate-y-0.5"
              >
                <Download className="size-4" />
              </button>
            )}
            <span className="grid size-10 place-items-center rounded-card bg-brand-700 text-white shadow-sm">
              {isQuoting ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-4" />}
            </span>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="mb-5 rounded-card bg-gradient-to-br from-brand-50 to-accent-400/10 p-3 ring-1 ring-brand-100">
          <BowlPreview options={selectedOptions} isUpdating={isQuoting} />
        </div>

        {recommendation && (
          <div className="mb-4 rounded-card border border-brand-200 bg-brand-50/80 p-3.5">
            <p className="flex items-center gap-2 text-xs font-black text-brand-800">
              <Lightbulb className="size-4" /> {recommendation.title}
            </p>
            <p className="mt-1.5 text-xs leading-5 text-ink-muted">{recommendation.description}</p>
            <button
              type="button"
              className="mt-2.5 text-xs font-extrabold text-brand-700 underline underline-offset-2"
              onClick={onApplyRecommendation}
            >
              {recommendation.action === 'remove'
                ? 'Aplicar ahorro'
                : `Agregar ${recommendation.option.name}`}
            </button>
          </div>
        )}

        {quote?.selections.length ? (
          <div className="grid max-h-48 gap-2.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
            {groups.map((group) => {
              const lines = quote.selections.filter((line) => line.groupId === group.id);
              if (!lines.length) return null;
              return (
                <div key={group.id} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-ink-muted">{group.name}</span>
                  <span className="max-w-[220px] text-right font-semibold text-ink">
                    {lines.map((line) => line.optionName).join(', ')}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-line bg-surface-muted/45 px-4 py-5 text-center text-sm leading-6 text-ink-muted">
            Elige ingredientes y aparecerán aquí mientras construyes.
          </div>
        )}

        {preferenceConflicts.length > 0 && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-card border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Revisa antes de continuar:</strong> seleccionaste ingredientes con{' '}
              {preferenceConflicts.join(', ')}, marcados como alérgenos en tu perfil.
            </span>
          </p>
        )}

        {selectedAllergens.length > 0 && (
          <p className="mt-3 flex items-start gap-2 rounded-card bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>Alérgenos declarados:</strong> {selectedAllergens.join(', ')}. Si tienes una
              alergia severa, consulta al local antes de pedir.
            </span>
          </p>
        )}

        <section className="mt-6 overflow-hidden rounded-card border border-line bg-white shadow-e2">
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-muted/65 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-card bg-brand-50 text-brand-700">
                <ReceiptText className="size-4" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-ink">Detalle del precio</h3>
                <p className="text-[10px] leading-4 text-ink-muted">Sin cargos ocultos al finalizar</p>
              </div>
            </div>
            {(quote?.extrasTotal ?? 0) > 0 && (
              <span className="rounded-pill bg-accent-400/15 px-2.5 py-1 text-[10px] font-extrabold text-amber-800">
                {quote?.selections.filter((line) => line.lineExtra > 0).length} extras
              </span>
            )}
          </div>

          <PriceBreakdown
            className="p-4"
            density="relaxed"
            prominentTotal
            lines={[
              {
                label: (
                  <span>
                    <strong className="block font-semibold text-ink">{productName}</strong>
                    <span className="text-[11px]">{variant?.name}</span>
                  </span>
                ),
                value: formatCurrency(quote?.basePrice ?? variant?.basePrice ?? 0),
              },
              ...(quote?.selections.some((line) => line.lineExtra > 0)
                ? quote.selections
                    .filter((line) => line.lineExtra > 0)
                    .map((line) => ({
                      label: (
                        <span className="inline-flex items-start gap-2 pl-1">
                          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-300" />
                          <span>
                            {line.optionName}
                            {line.chargedQuantity > 1 ? ` × ${line.chargedQuantity}` : ''}
                          </span>
                        </span>
                      ),
                      value: `+${formatCurrency(line.lineExtra)}`,
                    }))
                : [
                    {
                      label: (
                        <span className="inline-flex items-center gap-2 text-xs">
                          <span className="size-1.5 rounded-full bg-brand-300" />
                          Sin suplementos adicionales
                        </span>
                      ),
                      value: formatCurrency(0),
                    },
                  ]),
            ]}
            totalLabel="Total del bowl"
            totalValue={formatCurrency(quote?.lineTotal ?? variant?.basePrice ?? 0)}
            note="El precio se actualiza automáticamente con cada selección."
          />
        </section>

        {missingGroups.length > 0 && (
          <div
            aria-live="polite"
            className="mt-4 flex items-center gap-3 rounded-card border border-brand-100 bg-brand-50/80 p-3.5"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-card bg-white text-brand-700 shadow-sm">
              <AlertCircle className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-brand-800">
                Siguiente: {nextStepLabel ?? missingGroups[0]}
              </p>
              <p className="mt-0.5 text-[11px] leading-4 text-ink-muted">
                {missingGroups.length === 1
                  ? 'Solo falta un paso esencial.'
                  : `Quedan ${missingGroups.length} pasos esenciales.`}
              </p>
            </div>
          </div>
        )}

        {validationMessage && missingGroups.length === 0 && (
          <div
            role="alert"
            aria-live="assertive"
            className={cn(
              'mt-4 rounded-card p-3 text-xs',
              isOnline ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800',
            )}
          >
            <p className="flex items-start gap-2">
              {isOnline ? (
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
              ) : (
                <WifiOff className="mt-0.5 size-4 shrink-0" />
              )}
              {validationMessage}
            </p>
            <button
              type="button"
              onClick={onRetryQuote}
              className="mt-2 inline-flex items-center gap-1 font-bold underline underline-offset-2"
            >
              <RefreshCw className="size-3" /> Reintentar cotización
            </button>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3.5 rounded-card border border-line bg-surface-muted/55 p-3">
          <Button
            className="w-full shadow-e2"
            size="lg"
            disabled={!isComplete && !nextStepLabel}
            isLoading={isQuoting && !nextStepLabel}
            onClick={isComplete ? onAddToCart : onContinue}
          >
            {isComplete ? (
              <span className="inline-flex items-center gap-1">
                Agregar al carrito <ChevronRight className="size-4" />
              </span>
            ) : nextStepLabel ? (
              <span className="inline-flex items-center gap-1">
                Continuar con {nextStepLabel} <ChevronRight className="size-4" />
              </span>
            ) : (
              'Validando tu bowl'
            )}
          </Button>
          {isComplete ? (
            <Button
              className="w-full"
              variant="secondary"
              onClick={onSave}
              leftIcon={<Save className="size-4" />}
            >
              {saveLabel}
            </Button>
          ) : (
            <p className="px-3 text-center text-[11px] leading-4 text-ink-muted">
              Al completar los pasos podrás agregar o guardar tu combinación.
            </p>
          )}
          <div className="border-t border-line pt-1">
            <button
              type="button"
              onClick={onReset}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-field py-2 text-xs font-semibold text-ink-muted transition-colors hover:bg-white hover:text-brand-700"
            >
              <RotateCcw className="size-3.5" /> Empezar de nuevo
            </button>
          </div>
        </div>

        {!hasBranch && (
          <p className="mt-4 rounded-card bg-surface-muted p-3 text-xs leading-5 text-ink-muted">
            Elige tu dirección para confirmar disponibilidad y tiempos de preparación.
          </p>
        )}
      </div>
    </div>
  </aside>
);

