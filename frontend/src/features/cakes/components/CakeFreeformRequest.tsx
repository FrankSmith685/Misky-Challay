import type { DesignRepeat } from '../hooks/useDesignRepeat';
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Box, ChevronDown, ImagePlus, MapPin, MessageSquareText, Palette } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { useAppSelector } from '@app/hooks';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { FormGrid, FormStack } from '@components/ui/FormSection';
import type { ProductDetail } from '@features/catalog/types';
import type { DeliverySlot } from '@features/geo/types';
import { ROUTES } from '@constants/routes';
import { whatsappNumber } from '@lib/whatsapp';
import { getApiErrorMessage } from '@services/api/client';
import { cakesApi } from '../cakes.service';
import { CakeDeliveryFields } from './CakeDeliveryFields';
import { CakeReferenceUpload } from './CakeReferenceUpload';
import type { CakeTheme } from '../cakeThemes.service';
import type { CakePreviewShareInput, CakePreviewSnapshot } from '../cakePreview.service';
import { cakeDesignForNewReference, defaultCakeVisualDesign } from '../utils/cakeVisualDesign';
import { prepareCakeReference } from '../utils/prepareCakeReference';

const Cake3dExperience = lazy(() =>
  import('./Cake3dExperience').then((module) => ({ default: module.Cake3dExperience })),
);

const imageDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });

export const CakeFreeformRequest = ({
  prefill,
  product,
  slots,
  branchId,
  deliveryType,
  deliveryLabel,
  slotsLoading,
  slotsError,
  minLeadHours,
  onChooseBranch,
  authenticated,
  onLogin,
  isOpen,
  onOpenChange,
  initialServings,
  theme,
  alwaysOpen = false,
  dedicated = false,
}: {
  prefill?: DesignRepeat;
  theme?: CakeTheme | null;
  alwaysOpen?: boolean;
  dedicated?: boolean;
  product: ProductDetail;
  slots: DeliverySlot[];
  branchId: number | null;
  deliveryType: 'DELIVERY' | 'PICKUP';
  deliveryLabel?: string;
  slotsLoading: boolean;
  slotsError?: string;
  minLeadHours: number;
  onChooseBranch: () => void;
  authenticated: boolean;
  onLogin: () => void;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialServings?: number;
}) => {
  const navigate = useNavigate();
  const profilePhone = useAppSelector((state) => state.auth.user?.phone);
  const whatsappAvailable = Boolean(whatsappNumber(profilePhone));
  const [servings, setServings] = useState(
    prefill?.request.brief?.servings ? String(prefill.request.brief.servings) : '',
  );
  const [occasion, setOccasion] = useState('Celebración');
  const [description, setDescription] = useState(prefill?.request.description ?? '');
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [flavor, setFlavor] = useState(prefill?.request.brief?.flavor ?? '');
  const [filling, setFilling] = useState(prefill?.request.brief?.filling ?? '');
  const [message, setMessage] = useState(prefill?.request.brief?.message ?? '');
  const [notes, setNotes] = useState(prefill?.request.brief?.notes ?? '');
  const [slotId, setSlotId] = useState<number | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [referenceDataUrl, setReferenceDataUrl] = useState<string | null>(
    prefill?.references[0]?.dataUrl ?? null,
  );
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const [visualDesign, setVisualDesign] = useState(
    () => prefill?.request.brief?.visualDesign ?? defaultCakeVisualDesign(),
  );
  const referenceRequest = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dateError, setDateError] = useState('');
  const [show3d, setShow3d] = useState(false);
  const selectedSlot = slots.find((slot) => slot.id === slotId) ?? null;
  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  };
  const previewServings = Number(servings);
  const validPreviewServings =
    Number.isInteger(previewServings) && previewServings >= 1 && previewServings <= 500
      ? previewServings
      : undefined;
  const previewVariants = [...product.variants].sort(
    (a, b) => (a.servingSize ?? 0) - (b.servingSize ?? 0),
  );
  const referenceVariant =
    previewVariants.find((variant) => (variant.servingSize ?? 0) >= (validPreviewServings ?? 0)) ??
    previewVariants.at(-1);
  const previewConfig: CakePreviewSnapshot | null = referenceVariant
    ? {
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        variantId: referenceVariant.id,
        variantName: referenceVariant.name,
        servings:
          validPreviewServings ??
          (referenceVariant.servingSize ? Number(referenceVariant.servingSize) : null),
        themeName: theme?.name ?? null,
        themeSlug: theme?.slug ?? null,
        options: [
          ...(flavor.trim()
            ? [{ groupName: 'Sabor del bizcocho', optionName: flavor.trim(), quantity: 1 }]
            : []),
          ...(filling.trim()
            ? [{ groupName: 'Relleno', optionName: filling.trim(), quantity: 1 }]
            : []),
        ],
      }
    : null;
  const previewShare: CakePreviewShareInput | undefined =
    referenceVariant &&
    validPreviewServings &&
    flavor.trim().length >= 2 &&
    filling.trim().length >= 2
      ? {
          source: 'FREEFORM',
          productId: product.id,
          variantId: referenceVariant.id,
          requestedServings: validPreviewServings,
          ...(theme ? { themeId: theme.id, themeVersion: theme.version } : {}),
          selections: [],
          visualFlavor: flavor.trim(),
          visualFilling: filling.trim(),
        }
      : undefined;

  useEffect(() => {
    setSlotId(null);
    setDateError('');
  }, [branchId]);

  useEffect(() => {
    if (!prefill && isOpen && initialServings && Number.isSafeInteger(initialServings))
      setServings(String(initialServings));
  }, [initialServings, isOpen, prefill]);
  useEffect(() => {
    setDescription(prefill?.request.description ?? '');
  }, [theme?.id, prefill]);
  useEffect(
    () => () => {
      referenceRequest.current += 1;
    },
    [],
  );
  const selectImage = async (file: File | null) => {
    const request = ++referenceRequest.current;
    setImage(file);
    setReferenceDataUrl(null);
    setReferenceError('');
    setReferenceBusy(Boolean(file));
    if (!file) return;
    try {
      const dataUrl = await prepareCakeReference(file);
      if (request === referenceRequest.current) {
        setVisualDesign(cakeDesignForNewReference);
        setReferenceDataUrl(dataUrl);
      }
    } catch (cause) {
      if (request === referenceRequest.current) {
        setImage(null);
        setReferenceError(getApiErrorMessage(cause));
      }
    } finally {
      if (request === referenceRequest.current) setReferenceBusy(false);
    }
  };
  const change3dReference = (dataUrl: string | null) => {
    referenceRequest.current += 1;
    setImage(null);
    if (dataUrl) setVisualDesign(cakeDesignForNewReference);
    setReferenceDataUrl(dataUrl);
    setReferenceBusy(false);
    setReferenceError('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (referenceBusy) return;
    setError('');
    if (!branchId) {
      onChooseBranch();
      return;
    }
    if (!authenticated) {
      onLogin();
      return;
    }
    const count = Number(servings);
    if (
      !Number.isSafeInteger(count) ||
      count < (theme?.minServings ?? 1) ||
      count > (theme?.maxServings ?? 500)
    ) {
      setError(`Indica entre ${theme?.minServings ?? 1} y ${theme?.maxServings ?? 500} porciones.`);
      return;
    }
    if (occasion.trim().length < 2 || description.trim().length < 10) {
      setError('Completa la ocasión y describe tu idea con al menos 10 caracteres.');
      return;
    }
    if (flavor.trim().length < 2 || filling.trim().length < 2) {
      setError('Indica el sabor del bizcocho y el relleno que deseas.');
      return;
    }
    if (!selectedSlot) {
      setDateError('Selecciona la fecha y hora que deseas solicitar.');
      document.getElementById('freeform-delivery-slot')?.focus();
      return;
    }
    const variants = [...product.variants].sort(
      (a, b) => (a.servingSize ?? 0) - (b.servingSize ?? 0),
    );
    const referenceVariant =
      variants.find((variant) => (variant.servingSize ?? 0) >= count) ?? variants.at(-1);
    if (!referenceVariant) {
      setError('Esta torta aún no tiene una presentación de referencia.');
      return;
    }
    if (
      image &&
      (!['image/jpeg', 'image/png', 'image/webp'].includes(image.type) || image.size > 5_000_000)
    ) {
      setError('La imagen debe ser JPG, PNG o WebP y pesar menos de 5 MB.');
      return;
    }
    setBusy(true);
    try {
      await cakesApi.submitDesign({
        branchId,
        productId: product.id,
        variantId: referenceVariant.id,
        desiredAt: selectedSlot.startsAt,
        referenceDataUrls: prefill?.references.slice(1).map((entry) => entry.dataUrl),
        requestKind: 'FREEFORM',
        selections: [],
        description: description.trim(),
        whatsappOptIn: whatsappOptIn && whatsappAvailable,
        themeId: theme?.id,
        themeVersion: theme?.version,
        brief: {
          occasion: occasion.trim(),
          theme: theme?.name ?? '',
          style: '',
          colors: [],
          servings: count,
          message: message.trim(),
          budget: '',
          notes: notes.trim(),
          flavor: flavor.trim(),
          filling: filling.trim(),
          ...(referenceDataUrl ||
          JSON.stringify(visualDesign) !== JSON.stringify(defaultCakeVisualDesign())
            ? {
                visualDesign: {
                  ...visualDesign,
                  image: {
                    ...visualDesign.image,
                    visible: Boolean(referenceDataUrl) && visualDesign.image.visible,
                  },
                },
              }
            : {}),
        },
        ...(image
          ? { referenceDataUrl: await imageDataUrl(image) }
          : referenceDataUrl
            ? { referenceDataUrl }
            : {}),
      });
      toast.success(
        'Solicitud a medida enviada. Te avisaremos cuando tenga precio y fecha confirmados.',
      );
      navigate(ROUTES.designRequests);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      id="cake-freeform"
      open={alwaysOpen || isOpen}
      onToggle={(event) => {
        if (!alwaysOpen) onOpenChange(event.currentTarget.open);
      }}
      className={`cake-surface group scroll-mt-28 ${dedicated ? 'border-brand-200 shadow-e2' : ''}`}
    >
      <summary
        onClick={alwaysOpen ? (event) => event.preventDefault() : undefined}
        aria-disabled={alwaysOpen || undefined}
        className={`cake-freeform-toggle flex list-none items-center gap-3 p-5 sm:gap-4 sm:p-7 ${alwaysOpen ? 'cursor-default' : 'cursor-pointer'}`}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700">
          <Palette className="size-5" strokeWidth={1.6} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <strong className="block text-base font-semibold leading-6 text-ink">
            {theme ? `Solicitar ${theme.name}` : dedicated ? 'Cuéntanos tu idea' : '¿Necesitas una torta fuera de estas opciones?'}
          </strong>
          <span className="mt-1 block text-sm leading-6 text-ink-muted">
            {theme
              ? 'El modelo seleccionado acompañará tu solicitud. Cuéntanos cómo te gustaría adaptarlo.'
              : dedicated
                ? 'Completa los detalles esenciales y te enviaremos una propuesta de precio y fecha.'
                : 'Otros tamaños, formas o acabados. Cuéntanos tu idea y recibe una cotización personalizada.'}
          </span>
        </span>
        <span className="hidden shrink-0 rounded-full border border-line bg-surface-muted px-3 py-1.5 text-[11px] font-medium text-ink-muted xl:block">
          {dedicated ? 'Solicitud sin compromiso' : 'Por cotización'}
        </span>
        {!alwaysOpen && (
          <ChevronDown
            className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        )}
      </summary>
      {dedicated && (
        <ol className="grid gap-2 border-t border-line bg-surface-muted/45 p-4 sm:grid-cols-3 sm:px-7" aria-label="Pasos para solicitar tu diseño">
          {[
            ['Cuéntanos tu idea', 'freeform-idea-title'],
            ['Coordina entrega', 'freeform-delivery-title'],
            ['Recibe la propuesta', 'freeform-submit'],
          ].map(([label, target], index) => (
            <li key={label}>
              <button type="button" onClick={() => jumpTo(target)} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-line bg-white/80 px-3 py-2.5 text-left text-xs font-semibold text-ink transition hover:border-brand-300 hover:bg-white">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">{index + 1}</span>
              {label}
              </button>
            </li>
          ))}
        </ol>
      )}
      <form
        aria-label="Solicitud de torta a medida"
        onSubmit={(event) => void submit(event)}
        className={`min-w-0 border-t border-line p-5 sm:p-7 ${dedicated ? 'bg-surface-muted/15' : ''}`}
      >
        <section aria-labelledby="freeform-idea-title">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
              <MessageSquareText className="size-4" aria-hidden="true" />
            </span>
            <div>
              <h3 id="freeform-idea-title" className="text-sm font-semibold text-ink">
                Tu idea
              </h3>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                {dedicated ? 'Cuéntanos lo esencial; podrás adjuntar una imagen si quieres.' : 'Define las porciones y los detalles que te gustaría incluir.'}
              </p>
            </div>
          </div>
          {theme && (
            <div className="mb-5 flex items-center gap-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3">
              {theme.imageUrls[0] && (
                <img
                  src={theme.imageUrls[0]}
                  alt="Modelo de referencia"
                  className="size-20 shrink-0 rounded-lg object-cover"
                />
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  Modelo elegido
                </p>
                <p className="font-semibold text-ink">{theme.name}</p>
                <p className="mt-1 text-xs text-ink-muted">{theme.description}</p>
              </div>
            </div>
          )}
          <FormStack>
            <FormGrid minColumnWidth={220}>
              <Input
                id="freeform-servings"
                label="Número de porciones"
                type="number"
                min={theme?.minServings ?? 1}
                max={theme?.maxServings ?? 500}
                step="1"
                required
                value={servings}
                onChange={(event) => setServings(event.target.value)}
                placeholder="Ej. 70"
                disabled={busy}
                hint={`Indica entre ${theme?.minServings ?? 1} y ${theme?.maxServings ?? 500} porciones.`}
              />
              <Input
                id="freeform-occasion"
                label="Ocasión"
                required
                minLength={2}
                maxLength={80}
                value={occasion}
                onChange={(event) => setOccasion(event.target.value)}
                disabled={busy}
                placeholder="Ej. Cumpleaños, aniversario…"
              />
            </FormGrid>
            <FormGrid minColumnWidth={220}>
              <Input
                id="freeform-flavor"
                label="Sabor del bizcocho"
                required
                minLength={2}
                maxLength={80}
                value={flavor}
                onChange={(event) => setFlavor(event.target.value)}
                disabled={busy}
                placeholder="Ej. vainilla"
              />
              <Input
                id="freeform-filling"
                label="Relleno"
                required
                minLength={2}
                maxLength={80}
                value={filling}
                onChange={(event) => setFilling(event.target.value)}
                disabled={busy}
                placeholder="Ej. fudge casero"
              />
            </FormGrid>
            <Textarea
              id="freeform-description"
              label={theme ? 'Cómo quieres este diseño' : 'Cuéntanos qué quieres'}
              required
              minLength={10}
              maxLength={4000}
              rows={4}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setError('');
              }}
              placeholder={
                theme
                  ? 'Indica si lo quieres igual al modelo o qué cambiarías: colores, flores, forma y acabados…'
                  : 'Describe la forma, los colores, la decoración y los acabados…'
              }
              disabled={busy}
              hint="Describe el resultado esperado con al menos 10 caracteres."
            />
            <FormGrid minColumnWidth={220}>
              <Input
                id="freeform-message"
                label="Texto en la torta (opcional)"
                maxLength={160}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                disabled={busy}
                placeholder="Ej. Feliz cumpleaños, Ana"
              />
              <Input
                id="freeform-notes"
                label="Otros detalles (opcional)"
                maxLength={1200}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                disabled={busy}
                placeholder="Restricciones o indicaciones"
              />
            </FormGrid>
          </FormStack>
          {!dedicated && previewConfig && (
            <div className="mt-5 rounded-xl border border-brand-200 bg-white p-3">
              <button
                type="button"
                aria-expanded={show3d}
                onClick={() => setShow3d((current) => !current)}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-brand-50 px-3 text-xs font-semibold text-brand-800"
              >
                <Box className="size-4" />
                {show3d ? 'Ocultar vista 3D' : 'Ver idea en 3D'}
              </button>
              {show3d && (
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
                      referenceDataUrl={referenceDataUrl}
                      onReferenceChange={change3dReference}
                    />
                  </Suspense>
                </div>
              )}
              <p className="mt-2 text-[11px] leading-4 text-ink-muted">
                La vista 3D es una referencia visual opcional. El diseño final, el precio y la fecha
                se confirman después de revisar tu solicitud.
              </p>
            </div>
          )}
        </section>

        <div className="mt-7 border-t border-line pt-7">
          <FormGrid minColumnWidth={300}>
            <section aria-labelledby="freeform-delivery-title" className="min-w-0">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <MapPin className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 id="freeform-delivery-title" className="text-sm font-semibold text-ink">
                    Lugar y fecha
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    La fecha se confirmará en la propuesta.
                  </p>
                </div>
              </div>
              <CakeDeliveryFields
                id="freeform-delivery-slot"
                branchId={branchId}
                deliveryType={deliveryType}
                deliveryLabel={deliveryLabel}
                onChooseBranch={onChooseBranch}
                slots={slots}
                slotId={slotId}
                onSlotChange={(id) => {
                  setSlotId(id);
                  setDateError('');
                }}
                slotsLoading={slotsLoading}
                slotsError={slotsError}
                minLeadHours={minLeadHours}
                dateLabel="Fecha y hora solicitadas"
                dateError={dateError}
                disabled={busy}
              />
            </section>
            <section aria-labelledby="freeform-reference-title" className="min-w-0">
              <div className="mb-5 flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                  <ImagePlus className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 id="freeform-reference-title" className="text-sm font-semibold text-ink">
                    Imagen de referencia{' '}
                    <span className="font-normal text-ink-muted">(opcional)</span>
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    Una foto nos ayuda a entender el estilo que buscas.
                  </p>
                </div>
              </div>
              <CakeReferenceUpload
                file={image}
                existingDataUrl={referenceDataUrl}
                onChange={(file) => void selectImage(file)}
                disabled={busy || referenceBusy}
              />
              {referenceBusy && (
                <p role="status" className="mt-2 text-xs text-ink-muted">
                  {dedicated ? 'Preparando imagen…' : 'Preparando imagen para 3D…'}
                </p>
              )}
              {referenceError && (
                <p role="alert" className="mt-2 text-xs text-red-700">
                  {referenceError}
                </p>
              )}
            </section>
          </FormGrid>
        </div>

        <div id="freeform-submit" className="mt-7 border-t border-line pt-5 scroll-mt-28">
          <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={whatsappOptIn && whatsappAvailable}
              disabled={!whatsappAvailable}
              onChange={(event) => setWhatsappOptIn(event.target.checked)}
              className="mt-1"
            />
            <span>
              Acepto recibir por WhatsApp de Misky Challay la {dedicated ? 'propuesta' : 'cotización'} de esta solicitud. Es
              opcional y se enviará al celular de mi cuenta.
            </span>
          </label>
          {authenticated && !whatsappAvailable && (
            <p className="mb-4 text-xs text-ink-muted">
              Para activar estos avisos,{' '}
              <Link to={ROUTES.accountProfile} className="font-semibold text-brand-700 underline">
                agrega tu celular en Mi perfil
              </Link>
              .
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-800"
            >
              {error}
            </p>
          )}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 max-w-md">
              <p className="text-sm font-semibold text-ink">{dedicated ? 'Solicitud sin compromiso' : 'Cotización sin costo'}</p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                {dedicated ? 'Revisaremos tu idea y te enviaremos precio, fecha y condiciones antes de cualquier pago.' : 'Recibirás una propuesta con precio y fecha. Tú decides si la aceptas.'}
              </p>
            </div>
            {authenticated ? (
              <Button
                type="submit"
                isLoading={busy}
                disabled={busy || slotsLoading}
                className="w-full shrink-0 sm:w-auto"
              >
                {dedicated ? 'Enviar solicitud' : 'Solicitar cotización'}
              </Button>
            ) : (
              <Button type="button" onClick={onLogin} className="w-full shrink-0 sm:w-auto">
                Ingresar para enviar mi idea
              </Button>
            )}
          </div>
        </div>
      </form>
    </details>
  );
};
