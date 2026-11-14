import { lazy, Suspense, useState } from 'react';
import { Box, CalendarDays, Check, ChevronRight, ClipboardList, Loader2, Pencil, RotateCcw, ShoppingBag } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Modal } from '@components/ui/Modal';
import { formatCurrency, formatDate } from '@lib/format';
import type { QuoteResult } from '@features/builder/types';
import { CakeVisualPreview, type CakeVisualPreviewProps } from './CakeVisualPreview';
import type { CakePreviewShareInput, CakePreviewSnapshot } from '../cakePreview.service';
import { compactCakeReference } from '../utils/prepareCakeReference';
import { defaultCakeVisualDesign } from '../utils/cakeVisualDesign';
import type { CakePricePreview } from '../utils/cakePricePreview';

const Cake3dExperience = lazy(() => import('./Cake3dExperience').then((module) => ({ default: module.Cake3dExperience })));

export interface CakeSummaryGroup { id: number; name: string; label: string; complete: boolean; optional?: boolean }

interface CakeBuilderSummaryProps {
  isCake?: boolean;
  quantity?: number;
  servingUnit?: string;
  hasSinglePresentation?: boolean;
  productName: string;
  productImage: string | null;
  sizeLabel: string;
  servings: number | null;
  groups: CakeSummaryGroup[];
  quote: QuoteResult | null;
  pricePreview: CakePricePreview | null;
  isQuoting: boolean;
  validationMessage: string | null;
  selectedSlot?: { startsAt: string } | null;
  readyToAdd: boolean;
  finalStep: boolean;
  personalizing?: boolean;
  continueLabel: string;
  continueDisabled: boolean;
  mobileExpanded: boolean;
  deliveryType: 'DELIVERY' | 'PICKUP';
  onToggleMobile: () => void;
  onAddToCart: () => void;
  onReset: () => void;
  onContinue: () => void;
  onEditSize: () => void;
  onEditGroup: (id: number) => void;
  visual?: Omit<CakeVisualPreviewProps, 'sizeLabel'>;
  threeD?: { config: CakePreviewSnapshot; shareInput?: CakePreviewShareInput; visualDesign: import('../utils/cakeVisualDesign').CakeVisualDesign; onDesignChange: (design: import('../utils/cakeVisualDesign').CakeVisualDesign) => void; referenceDataUrl: string | null; onReferenceChange: (dataUrl: string | null) => void };
  threeDOpen?: boolean;
  onThreeDOpenChange?: (open: boolean) => void;
}

export const CakeBuilderSummary = ({ isCake = true, quantity = 1, servingUnit = 'porciones', hasSinglePresentation = false, productName, productImage, sizeLabel, servings, groups, quote, pricePreview, isQuoting, validationMessage, selectedSlot, readyToAdd, finalStep, personalizing = false, continueLabel, continueDisabled, mobileExpanded, deliveryType, onToggleMobile, onAddToCart, onReset, onContinue, onEditSize, onEditGroup, visual, threeD, threeDOpen, onThreeDOpenChange }: CakeBuilderSummaryProps) => {
  const total = quote?.lineTotal ?? pricePreview?.lineTotal ?? null;
  const basePrice = quote?.basePrice ?? pricePreview?.basePrice ?? null;
  const priceTheme = quote?.theme ?? pricePreview?.theme ?? null;
  const optionsTotal = quote ? Math.round((quote.extrasTotal - (quote.theme?.priceDelta ?? 0)) * 100) / 100 : pricePreview?.optionsTotal ?? 0;
  const priceLabel = quote ? 'Total de productos' : 'Precio actual';
  const requiredGroups = groups.filter((group) => !group.optional);
  const completed = requiredGroups.filter((group) => group.complete).length;
  const missingGroup = requiredGroups.find((group) => !group.complete);
  const servingUnitLabel = servings === 1
    ? servingUnit === 'porciones' ? 'porción' : servingUnit === 'unidades' ? 'unidad' : servingUnit
    : servingUnit;
  const presentationLabel = `${sizeLabel}${servings ? ` · ${servings} ${servingUnitLabel}` : ''}`;
  const [threeDRequested, setThreeDRequested] = useState(false);
  const [localThreeDOpen, setLocalThreeDOpen] = useState(false);
  const [modelSource, setModelSource] = useState<{ candidate: string | null; source: string | null; generated: boolean } | null>(null);
  const [modelDesign, setModelDesign] = useState(defaultCakeVisualDesign);
  const [modelBusy, setModelBusy] = useState(false);
  const [modelError, setModelError] = useState('');
  const modelOpen = threeDOpen ?? localThreeDOpen;
  const changeModelOpen = (open: boolean) => { setLocalThreeDOpen(open); onThreeDOpenChange?.(open); };
  const openThreeD = async () => {
    if (!threeD || modelBusy) return;
    setModelBusy(true); setModelError('');
    try {
      const candidate = visual?.generatedDataUrl ?? threeD.referenceDataUrl;
      if (!modelSource || modelSource.candidate !== candidate) {
        const generated = Boolean(visual?.generatedDataUrl);
        setModelSource({ candidate, source: generated && candidate ? await compactCakeReference(candidate) : candidate, generated });
        setModelDesign(defaultCakeVisualDesign());
      }
      setThreeDRequested(true); changeModelOpen(true);
    } catch { setModelError('No se pudo preparar esta imagen para el visor. Puedes seguir con tu pedido.'); }
    finally { setModelBusy(false); }
  };

  return <><aside id="cake-summary" aria-label={isCake ? 'Resumen de tu torta' : 'Resumen de tu pedido'} className="order-last min-w-0 scroll-mt-24 self-start lg:sticky lg:top-24">
    <div className="cake-surface overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-brand-700">{isCake ? 'Tu creación' : 'Tu pedido'}</p>
            <h2 className="mt-1 text-lg font-bold leading-6 text-ink">{productName}</h2>
          </div>
          <button type="button" onClick={onReset} aria-label="Volver a empezar" title="Volver a empezar" className="grid size-9 shrink-0 place-items-center rounded-card border border-line text-ink-muted transition-colors hover:bg-brand-50 hover:text-brand-700"><RotateCcw className="size-3.5" /></button>
        </div>
        {hasSinglePresentation
          ? <p className="mt-2 text-[11px] font-medium leading-5 text-ink-muted">{presentationLabel}</p>
          : <button type="button" onClick={onEditSize} aria-label={isCake ? 'Cambiar el tamaño de la torta' : 'Cambiar presentación'} className="mt-2 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-card px-1 text-left text-[11px] font-medium leading-5 text-ink-muted hover:text-brand-700"><Pencil className="size-3 shrink-0" aria-hidden="true" /><span>{presentationLabel}</span></button>}

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-line pt-3" aria-live="polite" aria-atomic="true">
          <div className="min-w-0"><span className="block text-[11px] font-semibold text-brand-900">{priceLabel}</span><span className="mt-1 block text-[10px] text-ink-muted">{quantity} {quantity === 1 ? 'presentación' : 'presentaciones'}</span></div>
          <div className="flex items-center gap-2"><p className="cake-price text-[26px] font-bold leading-tight text-ink">{total !== null ? formatCurrency(total) : 'Por calcular'}</p>{isQuoting && <Loader2 className="size-4 animate-spin text-brand-700" aria-label="Actualizando precio" />}</div>
          {!quote && pricePreview && groups.length > 0 && <p className="col-span-2 text-[11px] leading-5 text-ink-muted">{personalizing && missingGroup ? `Falta elegir ${missingGroup.name.toLocaleLowerCase('es')}.` : 'Incluye tus opciones elegidas.'}</p>}
        </div>
        {total !== null && <button type="button" onClick={onToggleMobile} aria-haspopup="dialog" className="mt-2 flex min-h-8 items-center gap-1 text-[11px] font-medium text-brand-700">Ver desglose del precio<ChevronRight className="size-3" /></button>}

        {validationMessage && <p role="alert" className="mt-3 rounded-card bg-red-50 p-3 text-xs leading-5 text-red-800">{validationMessage}</p>}
        {personalizing && groups.length > 0 && <section aria-label="Progreso de tu personalización" className="mt-3 border-t border-line pt-3">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-1 text-[11px]"><h3 className="font-semibold text-ink">Tu combinación</h3><p role="status" className="text-brand-700">{completed} de {requiredGroups.length} obligatorios</p></div>
          <ul>{groups.map((group) => <li key={group.id}><button type="button" onClick={() => onEditGroup(group.id)} aria-label={`Editar ${group.name}: ${group.complete ? group.label : group.optional ? 'opcional' : 'por elegir'}`} className="flex min-h-11 w-full items-center gap-2 rounded-card px-1 text-left transition-colors hover:bg-brand-50">
            {group.complete ? <Check className="size-3.5 shrink-0 text-brand-700" aria-hidden="true" /> : <span className={`size-3.5 shrink-0 rounded-full border ${group.optional ? 'border-line' : 'border-brand-300'}`} aria-hidden="true" />}
            <span className="min-w-0 flex-1 text-xs font-medium text-ink">{group.name}</span><span className={`max-w-[50%] truncate text-[11px] ${group.complete || group.optional ? 'text-ink-muted' : 'font-semibold text-brand-700'}`}>{group.complete ? group.label : group.optional ? 'Opcional' : 'Por elegir'}</span><ChevronRight className="size-3 shrink-0 text-ink-muted" aria-hidden="true" />
          </button></li>)}</ul>
        </section>}
        {(!hasSinglePresentation || finalStep) && <div className="mt-3 hidden lg:block">
          {finalStep && readyToAdd ? <Button className="w-full" leftIcon={<ShoppingBag className="size-4" />} disabled={isQuoting} onClick={onAddToCart}>Agregar al carrito</Button> : <Button className="w-full" sx={{ whiteSpace: 'normal' }} disabled={continueDisabled || isQuoting} onClick={onContinue}>{continueLabel}<ChevronRight className="ml-2 size-4 shrink-0" /></Button>}
          <p className="mt-2 text-center text-[10px] leading-4 text-ink-muted">{deliveryType === 'PICKUP' ? 'Preparada para recojo en taller.' : 'El envío se calcula al finalizar la compra.'}</p>
        </div>}
      </div>

      {visual ? <div className="border-t border-line px-4 pb-4 sm:px-5"><CakeVisualPreview {...visual} sizeLabel={sizeLabel} /></div> : <figure className="border-t border-line bg-surface-muted"><img src={productImage ?? '/images/cakes/custom.svg'} alt={productName} className={`${hasSinglePresentation ? 'h-40 object-cover object-[center_60%]' : 'aspect-[4/3] object-contain'} w-full`} /><figcaption className="px-4 py-2 text-[10px] text-ink-muted">Imagen referencial</figcaption></figure>}
      {threeD && <section id="cake-3d-preview" className="border-t border-line px-4 py-3 sm:px-5" aria-label="Vista 3D opcional">
        <button type="button" disabled={modelBusy} onClick={() => void openThreeD()} className="flex min-h-10 w-full items-center justify-between gap-2 rounded-card border border-line bg-white px-3 text-xs font-semibold text-ink transition-colors hover:bg-brand-50 disabled:opacity-60"><span className="flex items-center gap-2">{modelBusy ? <Loader2 className="size-4 animate-spin text-brand-700" /> : <Box className="size-4 text-brand-700" />}{modelBusy ? 'Preparando vista…' : 'Explorar en 3D'}</span><span className="text-[10px] font-medium text-ink-muted">Opcional</span></button>
        {modelError && <p role="alert" className="mt-2 text-xs text-red-700">{modelError}</p>}
        {threeDRequested && <Suspense fallback={<p role="status" className="mt-2 text-xs text-ink-muted">Abriendo visor 3D…</p>}>
          <Cake3dExperience key={`${threeD.config.productId}:${modelSource?.generated ? modelSource.candidate?.slice(-80) : 'reference'}`} modalOnly compact config={threeD.config} shareInput={threeD.shareInput} visualDesign={modelSource?.generated ? modelDesign : threeD.visualDesign} onDesignChange={modelSource?.generated ? setModelDesign : threeD.onDesignChange} referenceDataUrl={modelSource?.source ?? null} viewerOpen={modelOpen} onViewerOpenChange={changeModelOpen} allowShare={false} />
        </Suspense>}
      </section>}

      <button type="button" onClick={onToggleMobile} aria-haspopup="dialog" aria-expanded={mobileExpanded} aria-controls={mobileExpanded ? 'cake-summary-details' : undefined} className="flex min-h-12 w-full items-center justify-between gap-2 border-t border-line px-4 text-left text-xs font-semibold text-ink transition-colors hover:bg-brand-50 sm:px-5"><span>{groups.length ? 'Tu combinación y detalles' : 'Detalles del pedido'}</span>{requiredGroups.length > 0 && <span className="ml-auto text-[10px] font-medium text-brand-700">{completed}/{requiredGroups.length} obligatorios</span>}<ChevronRight className="size-3.5 shrink-0 text-ink-muted" /></button>
    </div>
  </aside>
  <Modal isOpen={mobileExpanded} onClose={onToggleMobile} title={isCake ? 'Tu torta en detalle' : 'Tu pedido en detalle'} description={productName} icon={ClipboardList} maxWidth="sm" actions={<Button variant="outline" onClick={onToggleMobile}>{isCake ? 'Volver a mi torta' : 'Volver a mi pedido'}</Button>}>
    <div id="cake-summary-details" className="space-y-5">
      <section aria-label="Precio de tu pedido" className="rounded-card border border-line bg-surface-muted p-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-ink">{priceLabel}</p><p className="mt-1 text-[11px] text-ink-muted">{quantity} {quantity === 1 ? 'presentación' : 'presentaciones'}</p></div><p className="text-2xl font-bold text-ink">{total !== null ? formatCurrency(total) : 'Por calcular'}</p></div>
        {basePrice !== null ? <dl className="mt-3 space-y-2 border-t border-line pt-3 text-xs text-ink-muted"><div className="flex justify-between gap-3"><dt>Base por presentación</dt><dd>{formatCurrency(basePrice)}</dd></div><div className="flex justify-between gap-3"><dt>Opciones por presentación</dt><dd>{optionsTotal ? `+ ${formatCurrency(optionsTotal)}` : 'Incluidas'}</dd></div>{priceTheme && <div className="flex justify-between gap-3"><dt>Diseño {priceTheme.name}</dt><dd>+ {formatCurrency(priceTheme.priceDelta)}</dd></div>}</dl> : <p className="mt-3 text-[11px] leading-5 text-ink-muted">Elige una presentación y una cantidad válida para calcular el precio.</p>}
      </section>
      {groups.length > 0 && <section aria-label="Tu combinación">
        <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-ink">Tu combinación</h3>{requiredGroups.length > 0 && <span className="text-[11px] font-semibold text-brand-700">{completed} de {requiredGroups.length} obligatorios</span>}</div>
        <div className="space-y-2">{groups.map((group) => <button key={group.id} type="button" onClick={() => { onToggleMobile(); onEditGroup(group.id); }} aria-label={`Editar ${group.name}: ${group.label || 'por elegir'}`} className={`flex min-h-16 w-full items-center gap-3 rounded-card border p-3 text-left transition-colors hover:border-brand-300 ${group.complete ? 'border-brand-200 bg-brand-50/40' : 'border-line bg-white'}`}>
          {group.complete ? <Check className="size-4 shrink-0 text-brand-700" aria-hidden="true" /> : <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />}
          <span className="min-w-0 flex-1"><span className="block text-[11px] text-ink-muted">{group.name}</span><span className={`mt-1 block break-words text-sm leading-5 ${group.complete ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{group.label || 'Por elegir'}</span></span><Pencil className="size-3.5 shrink-0 text-brand-700" aria-hidden="true" />
        </button>)}</div>
      </section>}
      {selectedSlot && <div className="flex items-start gap-2 rounded-card bg-surface-muted p-3 text-xs leading-5 text-ink-muted"><CalendarDays className="mt-0.5 size-4 shrink-0 text-brand-700" /><div><p className="font-semibold text-ink">{deliveryType === 'PICKUP' ? 'Recojo programado' : 'Entrega programada'}</p><p>{formatDate(selectedSlot.startsAt)}</p></div></div>}
    </div>
  </Modal></>;
};
