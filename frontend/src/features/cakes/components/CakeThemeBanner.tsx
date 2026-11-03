import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Palette } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';
import type { CakeTheme, ThemeSnapshot } from '../cakeThemes.service';

export const CakeThemeReference = ({ theme }: { theme: ThemeSnapshot }) => <div className="my-4 flex min-w-0 items-center gap-3 rounded-xl border border-line bg-surface-muted/50 p-3">{theme.imageUrl && <a href={theme.imageUrl} target="_blank" rel="noreferrer" aria-label={`Ver imagen del modelo ${theme.name}`} className="shrink-0 rounded-lg focus-visible:outline-2 focus-visible:outline-brand-700"><img src={theme.imageUrl} alt={theme.name} className="size-16 rounded-lg object-cover" /></a>}<div className="min-w-0"><p className="text-xs text-ink-muted">Modelo elegido</p><p className="mt-1 text-sm font-semibold text-ink">{theme.name}</p></div></div>;

export const CakeThemeBanner = ({ theme, onAdapt }: { theme: CakeTheme; onAdapt: () => void }) => {
  const [index, setIndex] = useState(0);
  return <section className="cake-surface overflow-hidden" aria-label="Diseño seleccionado">
    <div className="grid min-w-0 gap-5 p-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:p-7">
      <div className="min-w-0"><img src={theme.imageUrls[index] ?? theme.imageUrls[0]} alt={theme.name} className="aspect-[4/3] w-full rounded-xl bg-surface-muted object-cover" />{theme.imageUrls.length > 1 && <div className="mt-2 flex gap-2">{theme.imageUrls.map((url, i) => <button key={url} type="button" aria-label={`Ver referencia ${i + 1}`} aria-pressed={i === index} onClick={() => setIndex(i)} className={`overflow-hidden rounded-lg border-2 ${i === index ? 'border-brand-700' : 'border-transparent'}`}><img src={url} alt="" className="size-10 object-cover" /></button>)}</div>}</div>
      <div className="min-w-0"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-700"><Palette className="size-4" />{theme.theme}</p><h2 className="mt-2 text-xl font-semibold">{theme.name}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{theme.description}</p><p className="mt-2 text-xs leading-5 text-ink-muted">{theme.saleMode === 'QUOTE' ? 'La imagen es una referencia. Confirmaremos el acabado, el precio y la fecha en la propuesta.' : 'Las fotos orientan el acabado. Personaliza las opciones disponibles o solicita una adaptación.'}</p><div className="mt-4 flex flex-wrap items-center gap-3">{theme.saleMode === 'CONFIGURED' && <Button variant="outline" size="sm" onClick={onAdapt}>Solicitar cambios especiales</Button>}<Link to={ROUTES.business} className="min-h-10 py-2 text-xs font-semibold text-brand-700 underline underline-offset-4">Ver otros diseños</Link></div></div>
    </div>
  </section>;
};
