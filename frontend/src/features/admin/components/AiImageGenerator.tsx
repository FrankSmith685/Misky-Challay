import { useEffect, useState } from 'react';
import { Check, ImagePlus, Sparkles } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { getApiErrorMessage } from '@services/api/client';
import { mediaAdminApi, type GeneratedMediaImage, type SavedMediaImage } from '../services/mediaAdmin.service';

interface AiImageGeneratorProps {
  category: string;
  contextCategory?: string;
  purpose?: ImagePurpose;
  subjectName?: string;
  subjectDescription?: string;
  onSaved: (asset: SavedMediaImage) => void;
  saveLabel?: string;
}

export type ImagePurpose = 'category' | 'ingredient' | 'cake' | 'product' | 'option' | 'preset' | 'marketing';

type ImageCandidate = GeneratedMediaImage & { id: string; prompt: string };

const purposeNames: Record<ImagePurpose, string> = {
  category: 'una categoría de tortas',
  ingredient: 'un insumo de pastelería',
  cake: 'una torta',
  product: 'un producto de pastelería',
  option: 'una opción de personalización',
  preset: 'una recomendación de torta',
  marketing: 'contenido promocional',
};

const defaultPurpose = (category: string): ImagePurpose => {
  if (category === 'categories') return 'category';
  if (category === 'ingredients') return 'ingredient';
  if (category === 'builder-presets') return 'preset';
  if (category === 'products') return 'product';
  return 'marketing';
};

const imageSuggestions = (purpose: ImagePurpose, subjectName: string, subjectDescription: string) => {
  const name = subjectName.replace(/\s+/g, ' ').trim().slice(0, 120);
  const details = subjectDescription.replace(/\s+/g, ' ').trim().slice(0, 240);
  const detailSentence = details ? `Datos de la ficha: ${details}. ` : '';
  const subject = name || ({
    category: 'tortas artesanales',
    ingredient: 'un ingrediente de pastelería',
    cake: 'una torta artesanal',
    product: 'un postre artesanal',
    option: 'una decoración para torta',
    preset: 'una torta personalizada',
    marketing: 'tortas de pastelería',
  } satisfies Record<ImagePurpose, string>)[purpose];

  const base = ({
    category: `Una selección de tortas que represente la categoría «${subject}». ${detailSentence}Mostrar varios ejemplos coherentes con esta categoría.`,
    ingredient: `El insumo de pastelería «${subject}». ${detailSentence}Mostrar el ingrediente con claridad, sin incluir una torta terminada.`,
    cake: `Una torta «${subject}». ${detailSentence}Mostrar una torta que corresponda a los datos indicados.`,
    product: `El producto de pastelería «${subject}». ${detailSentence}Mostrar un solo producto que corresponda a los datos indicados.`,
    option: `La opción «${subject}» para personalizar una torta. ${detailSentence}Mostrar cómo luce esta opción, sin inventar otros ingredientes.`,
    preset: `Una torta terminada que ilustre la recomendación «${subject}». ${detailSentence}Mostrar una combinación coherente con los datos indicados.`,
    marketing: `Una escena de pastelería sobre «${subject}». ${detailSentence}Mostrar únicamente elementos relacionados con la idea.`,
  } satisfies Record<ImagePurpose, string>)[purpose];

  return [
    { label: 'Foto de catálogo', prompt: `${base} Fotografía realista de producto, composición centrada, fondo claro, luz suave, sin texto ni logotipos.` },
    { label: 'Primer plano', prompt: `${base} Primer plano de textura y detalles, iluminación natural, fondo sencillo, sin texto ni logotipos.` },
    { label: 'Escena de pastelería', prompt: `${base} Presentación sobre una mesa limpia de pastelería, luz natural, ambiente cálido, sin personas, texto ni logotipos.` },
  ];
};

/** Genera una vista previa; solo al confirmarla crea un recurso en la biblioteca. */
export const AiImageGenerator = ({ category, contextCategory, purpose, subjectName = '', subjectDescription = '', onSaved, saveLabel = 'Guardar en biblioteca' }: AiImageGeneratorProps) => {
  const imagePurpose = purpose ?? defaultPurpose(contextCategory ?? category);
  const suggestions = imageSuggestions(imagePurpose, subjectName, subjectDescription);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(0);
  const suggestedPrompt = selectedSuggestion === null ? null : suggestions[selectedSuggestion].prompt;
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState('');
  const [prompt, setPrompt] = useState(suggestions[0].prompt);
  const [customPrompt, setCustomPrompt] = useState('');
  const [altText, setAltText] = useState('');
  const [candidates, setCandidates] = useState<ImageCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const selectedImage = candidates.find((candidate) => candidate.id === selectedId);

  useEffect(() => {
    if (suggestedPrompt !== null) setPrompt(suggestedPrompt);
  }, [suggestedPrompt]);

  useEffect(() => {
    let active = true;
    void mediaAdminApi.generationStatus()
      .then(({ configured: enabled }) => { if (active) setConfigured(enabled); })
      .catch((requestError) => { if (active) setStatusError(getApiErrorMessage(requestError)); });
    return () => { active = false; };
  }, []);

  const generate = async () => {
    if (prompt.trim().length < 10) {
      setError('Describe la imagen con al menos 10 caracteres.');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const requestedPrompt = prompt.trim();
      const image = await mediaAdminApi.generateImage(requestedPrompt);
      const candidate = { ...image, id: crypto.randomUUID(), prompt: requestedPrompt };
      setCandidates((current) => [candidate, ...current].slice(0, 3));
      setSelectedId(candidate.id);
      setAltText('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!selectedImage) return;
    if (!altText.trim()) {
      setError('Describe lo que se ve en la imagen para el texto alternativo.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const extension = selectedImage.mimeType === 'image/jpeg' ? 'jpg' : selectedImage.mimeType.split('/')[1];
      const asset = await mediaAdminApi.upload({
        dataUrl: selectedImage.dataUrl,
        mimeType: selectedImage.mimeType,
        fileName: `flux-${Date.now()}.${extension}`,
        altText: altText.trim(),
        category,
      });
      onSaved(asset);
      toast.success('Imagen generada y guardada en la biblioteca');
      setCandidates([]);
      setSelectedId(null);
      setPrompt(suggestedPrompt ?? '');
      setCustomPrompt('');
      setAltText('');
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="grid gap-5">
      <div>
        <p className="flex items-center gap-2 text-sm font-bold text-ink"><Sparkles className="size-4 text-brand-700" /> Generar con IA · FLUX.1 Schnell</p>
        <p className="mt-1 text-xs leading-5 text-ink-muted">Cada clic genera una propuesta. Puedes comparar las últimas tres y elegir cuál guardar.</p>
      </div>

      {statusError ? <p role="alert" className="text-xs text-red-600">{statusError}</p> : configured === null ? (
        <p role="status" className="text-xs text-ink-muted">Comprobando configuración…</p>
      ) : !configured ? (
        <p role="status" className="rounded-field border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          La generación aún no está configurada. Un administrador del servidor debe añadir el Account ID y el token de Cloudflare Workers AI en backend/.env y reiniciar el backend.
        </p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="grid min-w-0 gap-4">
            <div className="rounded-field border border-brand-200 bg-brand-50/60 p-3 text-xs leading-5 text-ink">
              <p className="font-bold">Imagen para {purposeNames[imagePurpose]}{subjectName.trim() ? `: ${subjectName.trim()}` : '.'}</p>
              {subjectDescription.trim() && <p className="mt-1 text-ink-muted">La descripción de la ficha sirve de referencia.</p>}
              {!subjectName.trim() && <p className="mt-1 text-amber-800">{contextCategory ? 'Escribe primero el nombre en la ficha, o ajusta la descripción antes de generar.' : 'Escribe el producto o la idea concreta antes de generar.'}</p>}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold text-ink">Estilo opcional: elige uno o escribe tu propia idea</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, index) => <button
                  key={suggestion.label}
                  type="button"
                  aria-pressed={selectedSuggestion === index}
                  disabled={generating || saving}
                  onClick={() => { setSelectedSuggestion(index); setPrompt(suggestion.prompt); setError(''); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selectedSuggestion === index ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-200 bg-white text-brand-800 hover:border-brand-500'}`}
                >{suggestion.label}</button>)}
                <button
                  type="button"
                  aria-pressed={selectedSuggestion === null}
                  disabled={generating || saving}
                  onClick={() => { setSelectedSuggestion(null); setPrompt(customPrompt); setError(''); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selectedSuggestion === null ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-200 bg-white text-brand-800 hover:border-brand-500'}`}
                >Mi propia idea</button>
              </div>
            </div>
            <Textarea
              label={selectedSuggestion === null ? 'Escribe la imagen que quieres generar' : 'Descripción sugerida para la IA'}
              rows={6}
              maxLength={1500}
              value={prompt}
              onChange={(event) => { setPrompt(event.target.value); setCustomPrompt(event.target.value); setSelectedSuggestion(null); setError(''); }}
              placeholder="Describe el producto, colores, fondo y estilo de la foto."
              hint={selectedSuggestion === null
                ? 'La IA usará el texto que escribas aquí. Incluye el objeto, sus detalles y lo que no debe aparecer.'
                : 'Puedes modificar el texto; al hacerlo pasarás a Mi propia idea. Comprueba que represente lo que ofreces.'}
              disabled={generating || saving}
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              leftIcon={<Sparkles className="size-4" />}
              disabled={prompt.trim().length < 10 || saving}
              isLoading={generating}
              onClick={() => void generate()}
            >{candidates.length ? 'Generar otra propuesta' : 'Generar vista previa'}</Button>
            <p className="text-xs leading-5 text-ink-muted">Las propuestas que no guardes se descartan al salir del generador. Cada generación consume una solicitud del servicio.</p>
          </div>

          <div className="min-w-0 rounded-card border border-line bg-surface-muted/30 p-4">
            <p className="text-sm font-bold text-ink">Elegir resultado</p>
            {candidates.length ? (
              <div className="mt-3 grid gap-4">
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Propuestas generadas">
                  {candidates.map((candidate, index) => (
                    <button
                      key={candidate.id}
                      type="button"
                      disabled={generating || saving}
                      aria-pressed={candidate.id === selectedId}
                      aria-label={`Elegir propuesta ${index + 1}`}
                      title={candidate.prompt}
                      onClick={() => { setSelectedId(candidate.id); setAltText(''); setError(''); }}
                      className={`relative overflow-hidden rounded-field border-2 bg-white transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${candidate.id === selectedId ? 'border-brand-700' : 'border-line hover:border-brand-400'}`}
                    >
                      <img src={candidate.dataUrl} alt="" className="aspect-square w-full object-cover" />
                      {candidate.id === selectedId && <span className="absolute right-1 top-1 rounded-full bg-brand-700 p-1 text-white"><Check className="size-3" /></span>}
                    </button>
                  ))}
                </div>
                {selectedImage && (
                  <div className="grid gap-3">
                    <img src={selectedImage.dataUrl} alt="Vista previa de la propuesta elegida" className="mx-auto aspect-square w-full max-w-90 rounded-field object-cover" />
                    <p className="text-xs leading-5 text-ink-muted">Revisa la imagen elegida. La IA puede mostrar detalles distintos del producto real.</p>
                    <Input
                      label="Texto alternativo de la elegida"
                      value={altText}
                      maxLength={180}
                      onChange={(event) => { setAltText(event.target.value); setError(''); }}
                      placeholder="Describe lo que realmente aparece"
                      hint="Se guarda con esta imagen para accesibilidad."
                      disabled={saving}
                    />
                    <Button
                      type="button"
                      className="w-full"
                      leftIcon={<ImagePlus className="size-4" />}
                      disabled={!altText.trim() || generating}
                      isLoading={saving}
                      onClick={() => void save()}
                    >{saveLabel}</Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 grid min-h-55 place-content-center rounded-field border border-dashed border-line bg-white p-6 text-center">
                <Sparkles className="mx-auto mb-3 size-7 text-brand-400" />
                <p className="text-sm font-semibold text-ink">Aquí aparecerán tus propuestas</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">Escribe tu idea o usa un estilo opcional y genera una vista previa.</p>
              </div>
            )}
          </div>
          {error && <p role="alert" className="text-xs font-semibold leading-5 text-red-600 lg:col-span-2">{error}</p>}
        </div>
      )}
    </section>
  );
};
