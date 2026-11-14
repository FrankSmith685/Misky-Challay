import { useEffect, useState } from 'react';
import { Checkbox, FormControlLabel, TextField } from '@mui/material';
import { FileImage, Save, Upload } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { FormGrid } from '@components/ui/FormSection';
import { Alert } from '@components/ui/Alert';
import { getApiErrorMessage } from '@services/api/client';
import {
  experiencesApi,
  type ExperienceArtifactConfig,
  type ExperienceAsset,
} from './experiences.service';

export function ArtifactTemplateEditor({
  value,
  onChange,
  onUploaded,
  onBusyChange,
}: {
  value: ExperienceArtifactConfig;
  onChange: (value: ExperienceArtifactConfig) => void;
  onUploaded: (assets: ExperienceAsset[]) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    onBusyChange?.(Boolean(busy));
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);

  const update = <K extends keyof ExperienceArtifactConfig>(key: K, next: ExperienceArtifactConfig[K]) =>
    onChange({ ...value, [key]: next });
  const updateSection = <K extends keyof ExperienceArtifactConfig['hero']>(
    section: 'hero',
    key: K,
    next: ExperienceArtifactConfig['hero'][K],
  ) => onChange({ ...value, [section]: { ...value[section], [key]: next } });
  const updateDedication = <K extends keyof ExperienceArtifactConfig['dedication']>(
    key: K,
    next: ExperienceArtifactConfig['dedication'][K],
  ) => onChange({ ...value, dedication: { ...value.dedication, [key]: next } });
  const updateCard = <K extends keyof ExperienceArtifactConfig['card']>(
    key: K,
    next: ExperienceArtifactConfig['card'][K],
  ) => onChange({ ...value, card: { ...value.card, [key]: next } });

  const uploadSceneImage = async (sceneId: number, field: 'ghibliAssetId' | 'realAssetId', file?: File) => {
    if (!file) return;
    setError('');
    setBusy('Subiendo imagen…');
    try {
      const asset = await experiencesApi.upload(file, 'IMAGE');
      onUploaded([asset]);
      update('scenes', value.scenes.map((scene) => scene.id === sceneId ? { ...scene, [field]: asset.id } : scene));
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy('');
    }
  };

  return (
    <fieldset disabled={Boolean(busy)} className="grid gap-6">
      <div className="rounded-field border border-brand-100 bg-brand-50 p-4 text-sm leading-6 text-brand-900">
        Esta plantilla controla la experiencia pública del video, la tarjeta que abre el QR y las imágenes de cada escena. Los cambios se aplican cuando la plantilla está publicada.
      </div>

      <section className="exp-editor-section">
        <h4 className="mb-4 text-sm font-bold">Identidad y duración</h4>
        <FormGrid>
          <TextField label="Persona homenajeada" value={value.recipient} onChange={(e) => update('recipient', e.target.value)} />
          <TextField label="Duración (segundos)" type="number" value={value.duration} onChange={(e) => update('duration', Number(e.target.value))} />
        </FormGrid>
      </section>

      <section className="exp-editor-section">
        <h4 className="mb-4 text-sm font-bold">Encabezado de la experiencia</h4>
        <div className="grid gap-4">
          <TextField label="Eyebrow" value={value.hero.eyebrow} onChange={(e) => updateSection('hero', 'eyebrow', e.target.value)} />
          <TextField label="Título principal" value={value.hero.headline} onChange={(e) => updateSection('hero', 'headline', e.target.value)} />
          <TextField label="Saludo" value={value.hero.greeting} onChange={(e) => updateSection('hero', 'greeting', e.target.value)} />
          <TextField multiline minRows={3} label="Descripción" value={value.hero.description} onChange={(e) => updateSection('hero', 'description', e.target.value)} />
        </div>
      </section>

      <section className="exp-editor-section">
        <h4 className="mb-4 text-sm font-bold">Dedicatoria visible</h4>
        <div className="grid gap-4">
          <TextField label="Eyebrow" value={value.dedication.eyebrow} onChange={(e) => updateDedication('eyebrow', e.target.value)} />
          <TextField multiline minRows={2} label="Frase principal" value={value.dedication.headline} onChange={(e) => updateDedication('headline', e.target.value)} />
          <TextField multiline minRows={3} label="Texto" value={value.dedication.body} onChange={(e) => updateDedication('body', e.target.value)} />
        </div>
      </section>

      <section className="exp-editor-section">
        <h4 className="mb-4 text-sm font-bold">Tarjeta que abre el QR</h4>
        <div className="grid gap-4">
          <TextField label="Frase central" value={value.card.headline} onChange={(e) => updateCard('headline', e.target.value)} />
          <TextField multiline minRows={5} label="Mensaje" value={value.card.message} onChange={(e) => updateCard('message', e.target.value)} />
          <TextField label="Firma" value={value.card.signature} onChange={(e) => updateCard('signature', e.target.value)} />
        </div>
      </section>

      <section className="exp-editor-section">
        <h4 className="mb-4 text-sm font-bold">Escenas e imágenes</h4>
        <div className="grid gap-4">
          {value.scenes.map((scene) => (
            <div key={scene.id} className="rounded-field border border-line bg-surface-muted p-4">
              <div className="mb-4 flex items-center gap-2">
                <span className="exp-icon"><FileImage size={16} /></span>
                <div>
                  <p className="text-xs font-bold text-ink">Escena {scene.id}</p>
                  <p className="text-[11px] text-ink-muted">{scene.startTime}s – {scene.endTime}s</p>
                </div>
              </div>
              <div className="grid gap-4">
                <FormGrid>
                  <TextField label="Título" value={scene.title} onChange={(e) => update('scenes', value.scenes.map((item) => item.id === scene.id ? { ...item, title: e.target.value } : item))} />
                  <TextField label="Subtítulo" value={scene.subtitle} onChange={(e) => update('scenes', value.scenes.map((item) => item.id === scene.id ? { ...item, subtitle: e.target.value } : item))} />
                </FormGrid>
                <TextField multiline minRows={2} label="Descripción" value={scene.description} onChange={(e) => update('scenes', value.scenes.map((item) => item.id === scene.id ? { ...item, description: e.target.value } : item))} />
                <TextField multiline minRows={2} label="Frase de la escena" value={scene.quote} onChange={(e) => update('scenes', value.scenes.map((item) => item.id === scene.id ? { ...item, quote: e.target.value } : item))} />
                <div className="flex flex-wrap gap-2">
                  <Button component="label" variant="outline" size="sm" leftIcon={<Upload size={14} />}>
                    {scene.ghibliAssetId ? 'Reemplazar acuarela' : 'Subir acuarela'}
                    <input hidden type="file" accept="image/png,image/jpeg" onChange={(e) => { void uploadSceneImage(scene.id, 'ghibliAssetId', e.target.files?.[0]); e.target.value = ''; }} />
                  </Button>
                  <Button component="label" variant="outline" size="sm" leftIcon={<Upload size={14} />}>
                    {scene.realAssetId ? 'Reemplazar foto' : 'Subir foto original'}
                    <input hidden type="file" accept="image/png,image/jpeg" onChange={(e) => { void uploadSceneImage(scene.id, 'realAssetId', e.target.files?.[0]); e.target.value = ''; }} />
                  </Button>
                </div>
                <p className="text-[11px] text-ink-muted">Las imágenes se guardan en la biblioteca global y se sirven desde el enlace público de la plantilla.</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="exp-editor-section">
        <h4 className="mb-3 text-sm font-bold">Comportamiento público</h4>
        <div className="grid gap-1 sm:grid-cols-2">
          <FormControlLabel control={<Checkbox checked={value.features.directCardOnQr} onChange={(e) => update('features', { ...value.features, directCardOnQr: e.target.checked })} />} label="El QR abre la tarjeta directamente" />
          <FormControlLabel control={<Checkbox checked={value.features.showInternalHeader} onChange={(e) => update('features', { ...value.features, showInternalHeader: e.target.checked })} />} label="Mostrar barra interna" />
          <FormControlLabel control={<Checkbox checked={value.features.showSharing} onChange={(e) => update('features', { ...value.features, showSharing: e.target.checked })} />} label="Mostrar compartir" />
          <FormControlLabel control={<Checkbox checked={value.features.showDownloads} onChange={(e) => update('features', { ...value.features, showDownloads: e.target.checked })} />} label="Mostrar descargas" />
          <FormControlLabel control={<Checkbox checked={value.features.showDedicationActions} onChange={(e) => update('features', { ...value.features, showDedicationActions: e.target.checked })} />} label="Mostrar acciones de dedicatoria" />
        </div>
      </section>

      {busy && <p role="status" className="text-xs font-semibold text-brand-700">{busy}</p>}
      {error && <Alert variant="danger" title="No se pudo subir la imagen">{error}</Alert>}
      <div className="flex items-center gap-2 text-xs text-ink-muted"><Save size={14} /> Guarda la plantilla desde el botón inferior para publicar los cambios.</div>
    </fieldset>
  );
}
