import type { DesignRepeat } from '../hooks/useDesignRepeat';
import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Palette,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import { useAppSelector } from '@app/hooks';
import { ROUTES } from '@constants/routes';
import { formatCurrency, formatDate } from '@lib/format';
import { whatsappNumber } from '@lib/whatsapp';
import { getApiErrorMessage } from '@services/api/client';
import type { ProductDetail } from '@features/catalog/types';
import type { DeliverySlot } from '@features/geo/types';
import type { CakeProfile, DesignBrief } from '../cakes.service';
import type { CakeBuilderState } from '../hooks/useCakeBuilder';
import type { CakePreviewShareInput, CakePreviewSnapshot } from '../cakePreview.service';
import { CakeOptionCard } from './CakeOptionCard';
import { cakeDesignForNewReference, defaultCakeVisualDesign } from '../utils/cakeVisualDesign';
import { prepareCakeReference } from '../utils/prepareCakeReference';

const Cake3dExperience = lazy(() =>
  import('./Cake3dExperience').then((module) => ({ default: module.Cake3dExperience })),
);

interface CakeDesignWizardProps {
  prefill?: DesignRepeat;
  product: ProductDetail;
  profile: CakeProfile;
  builder: CakeBuilderState;
  slots: DeliverySlot[];
  slotId: number | null;
  onSlotChange: (value: number) => void;
  branchId: number | null;
  onChooseBranch: () => void;
  authenticated: boolean;
  onLogin: () => void;
  onSubmit: (input: {
    description: string;
    brief: DesignBrief;
    referenceDataUrl: string;
    referenceDataUrls: string[];
    whatsappOptIn: boolean;
  }) => Promise<void>;
  busy: boolean;
  error: string;
}

const OCCASIONS = [
  'Cumpleaños',
  'Bautizo',
  'Baby shower',
  'Aniversario',
  'Matrimonio',
  'Graduación',
  'Corporativo',
  'Otro',
];
const STYLES = [
  'Elegante',
  'Minimalista',
  'Infantil',
  'Divertido',
  'Floral',
  'Temático',
  'Moderno',
  'Aún no lo sé',
];
const COLORS = [
  'Rosa',
  'Celeste',
  'Lila',
  'Dorado',
  'Plateado',
  'Rojo',
  'Azul',
  'Verde',
  'Blanco',
  'Multicolor',
];
const BUDGETS = [
  'Hasta S/ 250',
  'S/ 250 – S/ 400',
  'S/ 400 – S/ 600',
  'Más de S/ 600',
  'Quiero una recomendación',
];

const readImage = async (file: File): Promise<string> => {
  if (file.size > 4_000_000 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Cada referencia debe ser JPG, PNG o WebP y pesar hasta 4 MB.');
  }
  return prepareCakeReference(file);
};

const CakeDesignWizard = ({
  prefill,
  product,
  profile,
  builder,
  slots,
  slotId,
  onSlotChange,
  branchId,
  onChooseBranch,
  authenticated,
  onLogin,
  onSubmit,
  busy,
  error,
}: CakeDesignWizardProps) => {
  const profilePhone = useAppSelector((state) => state.auth.user?.phone);
  const whatsappAvailable = Boolean(whatsappNumber(profilePhone));
  const [step, setStep] = useState(0);
  const [occasion, setOccasion] = useState(prefill?.request.brief?.occasion ?? '');
  const [theme, setTheme] = useState(prefill?.request.brief?.theme ?? '');
  const [style, setStyle] = useState(prefill?.request.brief?.style ?? '');
  const [colors, setColors] = useState<string[]>(prefill?.request.brief?.colors ?? []);
  const [servings, setServings] = useState(
    prefill?.request.brief?.servings ? String(prefill.request.brief.servings) : '',
  );
  const [message, setMessage] = useState(prefill?.request.brief?.message ?? '');
  const [budget, setBudget] = useState(prefill?.request.brief?.budget ?? '');
  const [notes, setNotes] = useState(prefill?.request.brief?.notes ?? '');
  const [description, setDescription] = useState(prefill?.request.description ?? '');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [references, setReferences] = useState<Array<{ name: string; dataUrl: string }>>(
    prefill?.references ?? [],
  );
  const [localError, setLocalError] = useState('');
  const [show3d, setShow3d] = useState(false);
  const [visualDesign, setVisualDesign] = useState(
    () => prefill?.request.brief?.visualDesign ?? defaultCakeVisualDesign(),
  );
  const selectedSlot = slots.find((slot) => slot.id === slotId) ?? null;
  const selectedIds = builder.selections.map((entry) => entry.optionId);
  const selectedNames = useMemo(
    () =>
      Object.fromEntries(
        (builder.config?.groups ?? []).flatMap((group) =>
          group.options.map((option) => [option.id, option.name]),
        ),
      ),
    [builder.config],
  );
  const canMoveFromBase = Boolean(builder.variantId) && builder.missingGroups.length === 0;
  const brief: DesignBrief = {
    occasion,
    theme,
    style,
    colors,
    servings: servings ? Number(servings) : null,
    message,
    budget,
    notes,
    ...(references.length ||
    JSON.stringify(visualDesign) !== JSON.stringify(defaultCakeVisualDesign())
      ? { visualDesign }
      : {}),
  };
  const previewOptions = (builder.config?.groups ?? []).flatMap((group) =>
    group.options.flatMap((option) => {
      const quantity = builder.getQuantity(option.id);
      return quantity ? [{ groupName: group.name, optionName: option.name, quantity }] : [];
    }),
  );
  const previewServings = Number(servings);
  const validPreviewServings =
    Number.isInteger(previewServings) && previewServings >= 1 && previewServings <= 500
      ? previewServings
      : undefined;
  const visualStyle = [
    'Elegante',
    'Minimalista',
    'Infantil',
    'Divertido',
    'Floral',
    'Temático',
    'Moderno',
  ].includes(style)
    ? (style as CakePreviewShareInput['visualStyle'])
    : undefined;
  const previewConfig: CakePreviewSnapshot | null = builder.variant
    ? {
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        variantId: builder.variant.id,
        variantName: builder.variant.name,
        servings:
          validPreviewServings ??
          (builder.variant.servingSize ? Number(builder.variant.servingSize) : null),
        themeName: null,
        themeSlug: null,
        options: [
          ...previewOptions,
          ...colors.map((color) => ({
            groupName: 'Color de cobertura',
            optionName: color,
            quantity: 1,
          })),
          ...(visualStyle
            ? [{ groupName: 'Decoración', optionName: visualStyle, quantity: 1 }]
            : []),
        ],
      }
    : null;
  const previewShare: CakePreviewShareInput | undefined = builder.variant
    ? {
        source: 'DESIGN',
        productId: product.id,
        variantId: builder.variant.id,
        selections: builder.selections,
        ...(validPreviewServings ? { requestedServings: validPreviewServings } : {}),
        visualColors: colors as CakePreviewShareInput['visualColors'],
        ...(visualStyle ? { visualStyle } : {}),
      }
    : undefined;

  const toggleColor = (color: string) =>
    setColors((current) =>
      current.includes(color)
        ? current.filter((entry) => entry !== color)
        : current.length >= 4
          ? current
          : [...current, color],
    );
  const addReferences = async (files: FileList | null) => {
    if (!files) return;
    setLocalError('');
    try {
      const remaining = Math.max(0, 3 - references.length);
      const next = await Promise.all(
        Array.from(files)
          .slice(0, remaining)
          .map(async (file) => ({ name: file.name, dataUrl: await readImage(file) })),
      );
      setReferences((current) => [...current, ...next].slice(0, 3));
      if (next.length && !references.length) setVisualDesign(cakeDesignForNewReference);
    } catch (cause) {
      setLocalError(getApiErrorMessage(cause));
    }
  };
  const continueStep = () => {
    setLocalError('');
    if (step === 0 && !canMoveFromBase) {
      setLocalError(
        builder.missingGroups.length
          ? `Completa: ${builder.missingGroups.join(', ')}`
          : 'Elige una presentación para continuar.',
      );
      return;
    }
    if (step === 1 && !occasion) {
      setLocalError('Cuéntanos para qué ocasión estás imaginando la torta.');
      return;
    }
    if (step === 1 && description.trim().length < 10) {
      setLocalError(
        'Describe tu idea con al menos 10 caracteres para que el equipo pueda cotizarla.',
      );
      return;
    }
    setStep((current) => Math.min(2, current + 1));
  };
  const submit = async () => {
    setLocalError('');
    if (!authenticated) {
      onLogin();
      return;
    }
    if (!branchId) {
      onChooseBranch();
      return;
    }
    if (!selectedSlot) {
      setLocalError('Selecciona una fecha y hora de entrega.');
      return;
    }
    if (!references.length) {
      setLocalError('Adjunta al menos una imagen de referencia para que diseño entienda tu idea.');
      return;
    }
    await onSubmit({
      description: description.trim(),
      brief,
      referenceDataUrl: references[0].dataUrl,
      referenceDataUrls: references.slice(1).map((reference) => reference.dataUrl),
      whatsappOptIn: whatsappOptIn && whatsappAvailable,
    });
  };

  return (
    <section className="mt-6 overflow-hidden rounded-3xl border border-brand-200 bg-white shadow-e2">
      <header className="bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wider text-brand-100">
              <Palette className="size-3.5" /> Crea tu torta
            </span>
            <h2 className="mt-3 text-2xl font-black sm:text-3xl">
              Convierte tu idea en una torta única
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-brand-100">
              Cuéntanos lo que imaginas. Nuestro equipo revisará los detalles, calculará el trabajo
              y te enviará una propuesta antes de cobrarte.
            </p>
          </div>
          <Sparkles className="size-8 text-accent-300" />
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          {['Base y presentación', 'Brief creativo', 'Fecha y referencias'].map((label, index) => (
            <button
              type="button"
              key={label}
              onClick={() =>
                index < step || (index === 1 && canMoveFromBase) ? setStep(index) : undefined
              }
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${index === step ? 'border-white/40 bg-white/15 text-white' : index < step ? 'border-brand-300/40 bg-brand-400/10 text-brand-100' : 'border-white/10 text-brand-200/70'}`}
            >
              <span className="grid size-6 place-items-center rounded-full bg-white/15">
                {index < step ? <Check className="size-3.5" /> : index + 1}
              </span>
              {label}
            </button>
          ))}
        </div>
      </header>
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_330px]">
        <div className="min-w-0">
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-brand-700">
                  Paso 1
                </p>
                <h3 className="mt-1 text-2xl font-black text-ink">Elige la base de tu idea</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  Selecciona el tamaño y las combinaciones que ya tienes claras. Puedes dejar
                  detalles abiertos para que el diseñador te recomiende.
                </p>
              </div>
              <div>
                <p className="mb-3 text-sm font-black text-ink">Presentación</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {product.variants.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      onClick={() => builder.setVariantId(entry.id)}
                      className={`rounded-2xl border p-4 text-left transition ${builder.variantId === entry.id ? 'border-brand-700 bg-brand-50 ring-1 ring-brand-700' : 'border-line hover:border-brand-300'}`}
                    >
                      <span className="block font-black text-ink">{entry.name}</span>
                      <span className="mt-1 block text-sm font-bold text-brand-800">
                        Desde {formatCurrency(entry.basePrice)}
                      </span>
                      <span className="mt-1 block text-xs text-ink-muted">
                        {entry.servingSize
                          ? `${entry.servingSize} ${entry.servingUnit ?? 'porciones'} · `
                          : ''}
                        Ideal para compartir y decorar.
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              {builder.config?.groups.map((group) => (
                <div key={group.id}>
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <h4 className="font-black text-ink">{group.name}</h4>
                      {group.description && (
                        <p className="mt-1 text-xs text-ink-muted">{group.description}</p>
                      )}
                    </div>
                    <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-ink-muted">
                      {group.minSelection
                        ? `Elige ${group.minSelection} a ${group.maxSelection}`
                        : 'Opcional'}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.options.map((option) => (
                      <CakeOptionCard
                        key={option.id}
                        group={group}
                        option={option}
                        quantity={builder.getQuantity(option.id)}
                        used={builder.unitsInGroup(group)}
                        selectedIds={selectedIds}
                        selectedOptionNames={selectedNames}
                        onToggle={() => builder.toggleOption(group, option.id)}
                        onQuantityChange={(delta) =>
                          builder.changeQuantity(group, option.id, delta)
                        }
                        onResolveConflict={() => builder.resolveConflict(group, option.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-brand-700">
                  Paso 2
                </p>
                <h3 className="mt-1 text-2xl font-black text-ink">Dale personalidad a tu diseño</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  Estos datos orientan la propuesta. El diseñador podrá escribirte si necesita
                  confirmar algo.
                </p>
              </div>
              <div>
                <p className="mb-2 text-sm font-black text-ink">¿Para qué ocasión es?</p>
                <div className="flex flex-wrap gap-2">
                  {OCCASIONS.map((entry) => (
                    <button
                      type="button"
                      key={entry}
                      onClick={() => setOccasion(entry)}
                      className={`rounded-full border px-3.5 py-2 text-sm font-bold transition ${occasion === entry ? 'border-brand-700 bg-brand-100 text-brand-900' : 'border-line hover:border-brand-300'}`}
                    >
                      {entry}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block text-sm font-bold">
                Tema o personaje
                <input
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                  maxLength={120}
                  className="mt-2 w-full rounded-xl border border-line p-3 font-normal"
                  placeholder="Ej. arcoíris, flores, dinosaurios, fútbol"
                />
              </label>
              <div>
                <p className="mb-2 text-sm font-black text-ink">Estilo que te gusta</p>
                <div className="flex flex-wrap gap-2">
                  {STYLES.map((entry) => (
                    <button
                      type="button"
                      key={entry}
                      onClick={() => setStyle(entry)}
                      className={`rounded-full border px-3.5 py-2 text-sm font-bold transition ${style === entry ? 'border-brand-700 bg-brand-100 text-brand-900' : 'border-line hover:border-brand-300'}`}
                    >
                      {entry}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-black text-ink">
                  Colores principales <span className="font-normal text-ink-muted">(hasta 4)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((entry) => (
                    <button
                      type="button"
                      key={entry}
                      onClick={() => toggleColor(entry)}
                      className={`rounded-full border px-3.5 py-2 text-sm font-bold transition ${colors.includes(entry) ? 'border-brand-700 bg-brand-100 text-brand-900' : 'border-line hover:border-brand-300'}`}
                    >
                      {colors.includes(entry) && <Check className="mr-1 inline size-3.5" />}
                      {entry}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-bold">
                  Personas aproximadas
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={servings}
                    onChange={(event) => setServings(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-line p-3 font-normal"
                    placeholder="Ej. 30"
                  />
                </label>
                <label className="block text-sm font-bold">
                  Presupuesto orientativo
                  <select
                    value={budget}
                    onChange={(event) => setBudget(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-line bg-white p-3 font-normal"
                  >
                    <option value="">Selecciona una opción</option>
                    {BUDGETS.map((entry) => (
                      <option key={entry}>{entry}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-bold">
                Texto que llevará la torta
                <input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={160}
                  className="mt-2 w-full rounded-xl border border-line p-3 font-normal"
                  placeholder="Ej. Feliz cumple, Sofía"
                />
              </label>
              <label className="block text-sm font-bold">
                Describe tu idea
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={4000}
                  rows={6}
                  className="mt-2 w-full rounded-xl border border-line p-3 font-normal"
                  placeholder="Cuéntanos la escena, decoración, textura, acabado y cualquier detalle importante"
                />
              </label>
              <label className="block text-sm font-bold">
                Notas para el diseñador
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={1200}
                  rows={3}
                  className="mt-2 w-full rounded-xl border border-line p-3 font-normal"
                  placeholder="Restricciones, alergias, colores que debemos evitar, etc."
                />
              </label>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-brand-700">
                  Paso 3
                </p>
                <h3 className="mt-1 text-2xl font-black text-ink">Fecha y referencias</h3>
                <p className="mt-1 text-sm text-ink-muted">
                  La fecha es una solicitud inicial. El equipo la confirmará en la cotización según
                  capacidad de producción.
                </p>
              </div>
              <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 size-5 shrink-0 text-brand-700" />
                  <div className="flex-1">
                    <p className="font-black text-brand-900">Fecha de entrega solicitada</p>
                    {!branchId ? (
                      <Button className="mt-3" size="sm" variant="outline" onClick={onChooseBranch}>
                        Elegir sucursal o dirección
                      </Button>
                    ) : (
                      <select
                        value={slotId ?? ''}
                        onChange={(event) => onSlotChange(Number(event.target.value))}
                        className="mt-3 w-full rounded-xl border border-brand-200 bg-white p-3 text-sm"
                      >
                        <option value="">Selecciona una fecha y hora</option>
                        {slots.map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {formatDate(slot.startsAt)} · {slot.available} cupos
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-ink">Referencias visuales</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Puedes subir hasta 3 imágenes, JPG, PNG o WebP.
                    </p>
                  </div>
                  <ImagePlus className="size-6 text-brand-700" />
                </div>
                <label className="mt-3 flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/50 p-4 text-center transition hover:border-brand-500">
                  <Upload className="size-6 text-brand-700" />
                  <span className="mt-2 text-sm font-black text-brand-900">Subir referencias</span>
                  <span className="mt-1 text-xs text-brand-700">Elige una o varias imágenes</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      void addReferences(event.target.files);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                {references.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {references.map((reference, index) => (
                      <div
                        key={`${reference.name}-${index}`}
                        className="relative overflow-hidden rounded-xl border border-line bg-white"
                      >
                        <img
                          src={reference.dataUrl}
                          alt={reference.name}
                          className="aspect-square w-full object-cover"
                        />
                        <button
                          type="button"
                          aria-label={`Quitar ${reference.name}`}
                          onClick={() =>
                            setReferences((current) =>
                              current.filter((_, currentIndex) => currentIndex !== index),
                            )
                          }
                          className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/70 text-white"
                        >
                          <X className="size-4" />
                        </button>
                        <p className="truncate px-2 py-1 text-[10px] font-semibold text-ink-muted">
                          {reference.name}
                        </p>
                        <button
                          type="button"
                          aria-pressed={index === 0}
                          onClick={() => {
                            setReferences((current) => [
                              current[index],
                              ...current.filter((_, currentIndex) => currentIndex !== index),
                            ]);
                            setVisualDesign(cakeDesignForNewReference);
                            setShow3d(true);
                          }}
                          className="min-h-9 w-full border-t border-line bg-brand-50 px-1 text-[11px] font-semibold text-brand-800"
                        >
                          {index === 0 ? 'En el modelo 3D' : 'Usar en 3D'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
                <p className="font-black">Así trabajaremos tu solicitud</p>
                <ol className="mt-2 grid gap-2 text-xs leading-5">
                  <li>1. Diseño revisa tu brief y referencias.</li>
                  <li>2. Recibes precio, fecha, alcance y condiciones.</li>
                  <li>3. Aceptas la propuesta y pagas el anticipo.</li>
                </ol>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={whatsappOptIn && whatsappAvailable}
                  disabled={!whatsappAvailable}
                  onChange={(event) => setWhatsappOptIn(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  Acepto recibir por WhatsApp de Misky Challay la cotización de esta solicitud. Es
                  opcional y se enviará al celular de mi cuenta.
                </span>
              </label>
              {authenticated && !whatsappAvailable && (
                <p className="mt-2 text-xs text-ink-muted">
                  Para activar estos avisos,{' '}
                  <Link
                    to={ROUTES.accountProfile}
                    className="font-semibold text-brand-700 underline"
                  >
                    agrega tu celular en Mi perfil
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
          {(localError || error) && (
            <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
              {localError || error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            <Button
              variant="outline"
              disabled={step === 0 || busy}
              leftIcon={<ChevronLeft className="size-4" />}
              onClick={() => setStep((current) => Math.max(0, current - 1))}
            >
              Atrás
            </Button>
            {step < 2 ? (
              <Button disabled={busy} onClick={continueStep}>
                Continuar <ChevronRight className="ml-1 size-4" />
              </Button>
            ) : (
              <Button
                disabled={busy}
                isLoading={busy}
                leftIcon={<Upload className="size-4" />}
                onClick={() => void submit()}
              >
                {authenticated ? 'Enviar solicitud a diseño' : 'Ingresar y enviar solicitud'}
              </Button>
            )}
          </div>
        </div>
        <aside className="h-fit rounded-2xl border border-line bg-surface-muted/45 p-4 lg:sticky lg:top-28">
          <p className="text-xs font-black uppercase tracking-widest text-brand-700">
            Tu idea hasta ahora
          </p>
          <div className="mt-4 rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <img
                src={product.imageUrl ?? '/images/cakes/custom.svg'}
                alt=""
                className="size-14 rounded-xl object-cover"
              />
              <div className="min-w-0">
                <p className="truncate font-black text-ink">{product.name}</p>
                <p className="text-xs text-ink-muted">
                  {builder.variant?.name ?? 'Presentación por elegir'}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              {occasion && (
                <p>
                  <span className="font-bold">Ocasión:</span> {occasion}
                </p>
              )}
              {theme && (
                <p>
                  <span className="font-bold">Tema:</span> {theme}
                </p>
              )}
              {style && (
                <p>
                  <span className="font-bold">Estilo:</span> {style}
                </p>
              )}
              {colors.length > 0 && (
                <p>
                  <span className="font-bold">Colores:</span> {colors.join(', ')}
                </p>
              )}
              {servings && (
                <p>
                  <span className="font-bold">Personas:</span> {servings}
                </p>
              )}
              {budget && (
                <p>
                  <span className="font-bold">Presupuesto:</span> {budget}
                </p>
              )}
              {selectedSlot && (
                <p>
                  <span className="font-bold">Fecha:</span> {formatDate(selectedSlot.startsAt)}
                </p>
              )}
              {!occasion && !theme && !style && !selectedSlot && (
                <p className="text-ink-muted">
                  Completa los pasos y aquí aparecerá el resumen de tu diseño.
                </p>
              )}
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-3">
            <p className="text-xs font-black text-brand-900">Cotización personalizada</p>
            <p className="mt-1 text-xs leading-5 text-brand-900">
              El precio depende del tamaño, materiales, horas de decoración y fecha disponible. Te
              enviaremos una propuesta antes del pago.
            </p>
          </div>
          {profile.minLeadHours > 0 && (
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              Anticipación mínima sugerida: {profile.minLeadHours} horas.
            </p>
          )}
          <div className="mt-4 rounded-xl border border-brand-200 bg-white p-3">
            <button
              type="button"
              disabled={!previewConfig}
              aria-expanded={show3d}
              onClick={() => setShow3d((current) => !current)}
              className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-50 px-3 text-xs font-semibold text-brand-800 disabled:opacity-50"
            >
              <Box className="size-4" />
              {show3d ? 'Ocultar vista 3D' : 'Ver idea en 3D'}
            </button>
            {show3d && previewConfig && (
              <div className="mt-3">
                <Suspense
                  fallback={
                    <p role="status" className="text-xs text-ink-muted">
                      Preparando visor 3D…
                    </p>
                  }
                >
                  <Cake3dExperience
                    config={previewConfig}
                    shareInput={previewShare}
                    visualDesign={visualDesign}
                    onDesignChange={setVisualDesign}
                    referenceDataUrl={references[0]?.dataUrl ?? null}
                    onReferenceChange={(dataUrl) => {
                      if (dataUrl) setVisualDesign(cakeDesignForNewReference);
                      setReferences((current) =>
                        dataUrl
                          ? [{ name: 'Referencia del diseño 3D', dataUrl }, ...current.slice(1)]
                          : current.slice(1),
                      );
                    }}
                  />
                </Suspense>
              </div>
            )}
            <p className="mt-2 text-[11px] leading-4 text-ink-muted">
              La vista 3D es una referencia visual opcional. El tema escrito y las notas se envían
              de forma privada junto con tu solicitud.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
};

export default CakeDesignWizard;
