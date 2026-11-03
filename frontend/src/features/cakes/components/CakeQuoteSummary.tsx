import { ArrowLeft, Check, MessageSquareText } from 'lucide-react';
import { Button } from '@components/ui/Button';

/** La solicitud a medida tiene una propuesta propia; su precio aún no está calculado. */
export const CakeQuoteSummary = ({ productName, productImage, onReturn }: { productName: string; productImage: string | null; onReturn: () => void }) => (
  <aside aria-label="Sobre la cotización" className="hidden min-w-0 self-start lg:sticky lg:top-24 lg:block">
    <div className="cake-surface overflow-hidden">
      <div className="relative h-40 overflow-hidden bg-surface-muted"><img src={productImage ?? '/images/cakes/custom.svg'} alt={productName} className="size-full object-cover" /><span className="absolute bottom-3 right-3 rounded-md bg-white/95 px-2 py-1 text-[9px] text-ink-muted">Imagen referencial</span></div>
      <div className="p-6">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-2.5 py-1 text-[11px] font-medium text-accent-700"><MessageSquareText className="size-3.5" aria-hidden="true" /> Diseño a medida</span>
        <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">Tu idea, nuestra propuesta</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">El precio se define después de revisar tu diseño, las porciones y la fecha solicitada.</p>
        <ol className="mt-6 space-y-5">
          {[
            ['Cuéntanos tu idea', 'Comparte los detalles y, si quieres, una imagen.'],
            ['Revisamos tu solicitud', 'Confirmamos el trabajo y la disponibilidad.'],
            ['Tú decides', 'Recibirás precio y fecha antes de aceptar.'],
          ].map(([title, description], index) => <li key={title} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700">{index + 1}</span><div><p className="text-sm font-medium text-ink">{title}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p></div></li>)}
        </ol>
        <p className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-xs leading-5 text-ink-muted"><Check className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" /> Enviar la solicitud es gratis y no confirma una compra.</p>
        <Button type="button" variant="outline" className="mt-5 w-full" size="sm" leftIcon={<ArrowLeft className="size-3.5" />} onClick={onReturn}>Volver al personalizador</Button>
      </div>
    </div>
  </aside>
);
