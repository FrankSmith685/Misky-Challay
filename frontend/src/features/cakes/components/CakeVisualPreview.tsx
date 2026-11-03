import { useId, useState } from 'react';
import { Download, Image as ImageIcon, Loader2, RefreshCw, Sparkles } from 'lucide-react';

const palette = (name: string, fallback: string) => {
  const value = name.toLocaleLowerCase('es-PE');
  if (/chocolate|cacao|chocochip|fudge|brownie|ganache|café|cafe/.test(value)) return '#704531';
  if (/red velvet|fresa|frambues|cereza/.test(value)) return '#bb6070';
  if (/zanahoria|naranja|durazno/.test(value)) return '#e8a365';
  if (/arand|aránd|mora/.test(value)) return '#86739b';
  if (/manjar|caramelo|dulce de leche/.test(value)) return '#bd8e58';
  if (/maracuy|limón|limon/.test(value)) return '#ead17d';
  if (/platano|plátano|vainilla|crema/.test(value)) return '#e8d49d';
  return fallback;
};

export interface CakeVisualPreviewProps {
  flavor: string;
  filling: string;
  addons: string;
  description?: string;
  sizeLabel: string;
  referenceDataUrl?: string | null;
  generatedDataUrl?: string | null;
  generating?: boolean;
  canGenerate?: boolean;
  generationError?: string;
  onGenerate?: () => void;
  phase?: 'incomplete' | 'idle' | 'waiting' | 'generating' | 'ready' | 'error' | 'unavailable';
  finishingPrevious?: boolean;
  proposalOutdated?: boolean;
}

export const CakeVisualPreview = ({ flavor, filling, addons, description = '', sizeLabel, referenceDataUrl, generatedDataUrl, generating, canGenerate = true, generationError, onGenerate, phase, finishingPrevious = false, proposalOutdated = false }: CakeVisualPreviewProps) => {
  const id = useId().replace(/:/g, '');
  const [referenceView, setReferenceView] = useState<string | null>(null);
  const comparing = Boolean(referenceDataUrl && referenceView === referenceDataUrl);
  const sponge = palette(flavor, '#f0d7ad');
  const cream = palette(filling, '#f4e9d1');
  const brief = description.trim();
  const requestedColor = description.toLocaleLowerCase('es-PE');
  const icing = /rosa|rosado|fucsia/.test(requestedColor) ? '#f1c8d8' : /azul|celeste/.test(requestedColor) ? '#cfdeef' : /verde/.test(requestedColor) ? '#d6e7cf' : /lila|morado|violeta/.test(requestedColor) ? '#dfd1e9' : /amarillo|dorado/.test(requestedColor) ? '#f4e3b5' : '#fffdf8';
  const status = generationError || (phase === 'unavailable' ? 'La IA no está disponible ahora. La ilustración sigue tus elecciones.' : finishingPrevious ? 'La propuesta anterior sigue en proceso. Puedes seguir eligiendo y actualizarla cuando termine.' : generating ? phase === 'waiting' ? 'Preparando tu propuesta…' : brief ? 'La IA está incorporando tu descripción y tu combinación al diseño…' : referenceDataUrl ? 'La IA está adaptando tu referencia a la combinación…' : 'La IA está creando tu propuesta…' : generatedDataUrl ? brief ? 'Propuesta con IA basada en tus opciones y tu descripción; el acabado se confirma contigo.' : 'Propuesta con IA según tus elecciones; el acabado se confirma contigo.' : !flavor || !filling ? 'Elige bizcocho y relleno. Verás aquí cómo cambia tu combinación.' : proposalOutdated ? 'Cambiaste tus opciones o tu descripción. Pulsa Actualizar propuesta con IA para incluir los cambios.' : brief ? 'La IA usará tu descripción, tu foto y tus opciones al pulsar Generar propuesta con IA.' : 'La ilustración cambia al instante. Genera tu propuesta con IA cuando termines de elegir.');
  return <section className="mt-4 overflow-hidden rounded-xl border border-line bg-white" aria-label="Vista previa de tu torta" data-preview-phase={phase ?? (generatedDataUrl ? 'ready' : 'incomplete')}>
    <div className="flex items-center justify-between gap-2 px-3.5 py-3"><div><h3 className="text-xs font-bold text-ink">Así va tu torta</h3><p className="mt-0.5 text-[10px] text-ink-muted">Tu combinación, paso a paso</p></div><span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-[10px] font-semibold text-brand-700"><Sparkles className="size-3" />{generatedDataUrl ? 'Con IA' : 'Vista en vivo'}</span></div>
    {referenceDataUrl && <div className="flex gap-1 border-t border-line px-3 py-2" aria-label="Comparar propuesta y referencia">{[false, true].map((photo) => <button key={String(photo)} type="button" aria-pressed={comparing === photo} onClick={() => setReferenceView(photo ? referenceDataUrl : null)} className={`min-h-8 rounded-card px-3 text-[11px] font-semibold ${comparing === photo ? 'bg-brand-50 text-brand-800' : 'text-ink-muted hover:bg-surface-muted'}`}>{photo ? 'Tu referencia' : 'Tu propuesta'}</button>)}</div>}
    <div className="relative overflow-hidden bg-[#f7f3ed]">
      {comparing ? <img src={referenceDataUrl!} alt="Foto original que guía el estilo de tu propuesta" className="aspect-[3/2] w-full object-contain p-3" /> : generatedDataUrl ? <img src={generatedDataUrl} alt={`Propuesta con IA: bizcocho de ${flavor}, relleno de ${filling}${addons ? ` y complementos ${addons}` : ''}${brief ? `. Diseño solicitado: ${brief}` : ''}`} className="aspect-[3/2] w-full object-contain" /> : <svg viewBox="0 0 320 225" role="img" aria-label={`Torta ilustrativa de ${flavor || 'sabor por elegir'} con relleno de ${filling || 'relleno por elegir'}${addons ? ` y complementos ${addons}` : ''}`} className="aspect-[3/2] w-full">
        <defs><linearGradient id={`${id}-bg`} x2="0" y2="1"><stop stopColor="#fbf5ec" /><stop offset="1" stopColor="#f0e9e1" /></linearGradient><linearGradient id={`${id}-icing`} x2="1" y2="0"><stop stopColor={icing} /><stop offset="1" stopColor="#e7d8c5" /></linearGradient></defs>
        <rect width="320" height="225" fill={`url(#${id}-bg)`} /><ellipse cx="160" cy="195" rx="120" ry="18" fill="#d7c7b5" opacity=".35" /><ellipse cx="160" cy="185" rx="126" ry="22" fill="#fffdf9" /><ellipse cx="160" cy="183" rx="112" ry="15" fill="none" stroke="#e9ddd0" />
        <path d="M67 105Q160 127 253 105V172Q160 195 67 172Z" fill={sponge} stroke="#d4b996" strokeWidth="2" /><path d="M67 136Q160 157 253 136V152Q160 174 67 152Z" fill={cream} /><path d="M67 160Q160 181 253 160V170Q160 192 67 170Z" fill={sponge} opacity=".7" />
        <ellipse cx="160" cy="104" rx="93" ry="25" fill={`url(#${id}-icing)`} stroke="#e5d5c2" strokeWidth="2" /><path d="M67 105Q72 117 79 105Q88 120 97 107Q106 121 115 108Q124 120 133 108Q142 121 151 108Q160 120 169 108Q178 121 187 108Q196 120 205 108Q214 121 223 107Q232 120 241 105Q249 118 253 105" fill="none" stroke="#fffaf0" strokeWidth="7" strokeLinecap="round" />
        <circle cx="124" cy="91" r="5" fill={sponge} /><circle cx="155" cy="83" r="5" fill={cream} stroke="#d8bb99" /><circle cx="189" cy="91" r="5" fill={sponge} />
        {addons && <g aria-label="Complementos junto a la torta"><ellipse cx="278" cy="181" rx="18" ry="8" fill="#d0b28c" /><ellipse cx="278" cy="177" rx="18" ry="8" fill="#eac99f" stroke="#bd956c" /><circle cx="272" cy="175" r="2" fill="#765039" /><circle cx="283" cy="178" r="2" fill="#765039" /><ellipse cx="42" cy="183" rx="16" ry="9" fill="#e4b8a0" stroke="#c8907e" /><path d="M31 181Q42 170 53 181" fill="none" stroke="#fff4e9" strokeWidth="3" /></g>}
      </svg>}
      <span className="absolute bottom-2 right-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-medium text-ink-muted shadow-sm">{comparing ? 'Referencia original' : generatedDataUrl ? 'Propuesta con IA · ilustrativa' : 'Ilustración de tu combinación'}</span>
    </div>
    <div className="space-y-1 px-3.5 py-3 text-[11px] leading-4 text-ink-muted"><p className="sr-only">Tamaño: {sizeLabel}</p><p><span className="font-semibold text-ink">Bizcocho:</span> {flavor || 'Por elegir'}</p><p><span className="font-semibold text-ink">Relleno:</span> {filling || 'Por elegir'}</p>{addons && <p className="line-clamp-2"><span className="font-semibold text-ink">Complementos aparte:</span> {addons}</p>}{brief && <p className="line-clamp-2"><span className="font-semibold text-ink">Tu diseño:</span> {brief}</p>}{referenceDataUrl && <p className="flex items-center gap-1 pt-1 text-[10px] text-brand-700"><ImageIcon className="size-3 shrink-0" />{brief ? 'Tu descripción personaliza el diseño de la foto.' : 'Tu foto guía la forma y la decoración.'}</p>}</div>
    <div className="border-t border-line bg-surface-muted/40 px-3.5 py-3">
      <p role="status" aria-live="polite" className={`flex items-start gap-2 text-[10px] leading-4 ${generationError ? 'text-amber-800' : 'text-ink-muted'}`}>{(generating || finishingPrevious) && <Loader2 className="mt-0.5 size-3 shrink-0 animate-spin text-brand-700" />}<span>{status}</span></p>
      {onGenerate && <div className="mt-2 flex gap-2"><button type="button" disabled={generating || finishingPrevious || !canGenerate || Boolean(generatedDataUrl)} onClick={onGenerate} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-card border border-brand-200 bg-white px-2 text-[11px] font-semibold text-brand-800 disabled:opacity-50">{generating || finishingPrevious ? <Loader2 className="size-3.5 animate-spin" /> : proposalOutdated || generationError ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}{finishingPrevious ? 'Terminando propuesta anterior…' : generating ? 'Generando propuesta…' : generationError || phase === 'unavailable' ? 'Reintentar con IA' : generatedDataUrl ? 'Propuesta actualizada' : proposalOutdated ? 'Actualizar propuesta con IA' : 'Generar propuesta con IA'}</button>{generatedDataUrl && <a href={generatedDataUrl} download={`mi-torta-propuesta.${generatedDataUrl.startsWith('data:image/jpeg') ? 'jpg' : generatedDataUrl.startsWith('data:image/webp') ? 'webp' : 'png'}`} aria-label="Guardar propuesta como imagen" className="inline-flex min-h-10 items-center justify-center rounded-card border border-line bg-white px-2 text-ink-muted"><Download className="size-3.5" /></a>}</div>}
    </div>
  </section>;
};
