import { useEffect, useRef, useState } from 'react';
import { Checkbox, FormControlLabel, MenuItem, TextField, LinearProgress } from '@mui/material';
import {
  AudioLines,
  Box,
  Check,
  FileVideo,
  Image as ImageIcon,
  Palette,
  Settings2,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react';
import { Alert } from '@components/ui/Alert';
import { FormGrid } from '@components/ui/FormSection';
import { Button } from '@components/ui/Button';
import { getApiErrorMessage } from '@services/api/client';
import { experiencesApi, type ExperienceScene, type ExperienceAsset } from './experiences.service';

export function SceneEditor({
  value,
  onChange,
  assets,
  onUploaded,
  canUpload = true,
  projectId,
  onBusyChange,
}: {
  value: ExperienceScene;
  onChange: (value: ExperienceScene) => void;
  assets: ExperienceAsset[];
  onUploaded: (assets: ExperienceAsset[]) => void;
  canUpload?: boolean;
  projectId?: number;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState('');
  useEffect(() => {
    onBusyChange?.(Boolean(busy));
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const [error, setError] = useState('');
  const generation = useRef<AbortController | null>(null);
  useEffect(() => () => generation.current?.abort(), []);
  const generateVideo = async () => {
    setBusy('Preparando el saludo…');
    setError('');
    const controller = new AbortController();
    generation.current = controller;
    try {
      const { createGreetingVideo } = await import('./createGreetingVideo');
      const file = await createGreetingVideo(
        value,
        (progress) => setBusy(`Creando video: ${progress}%`),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const asset = await experiencesApi.upload(file, 'VIDEO', undefined, projectId);
      onUploaded([asset]);
      onChange({ ...value, videoAssetId: asset.id });
    } catch (e) {
      if (!controller.signal.aborted) setError(getApiErrorMessage(e));
    } finally {
      setBusy('');
      generation.current = null;
    }
  };
  const field = <K extends keyof ExperienceScene>(key: K, next: ExperienceScene[K]) =>
    onChange({ ...value, [key]: next });
  const upload = async (file: File, kind: ExperienceAsset['kind']) => {
    setError('');
    setBusy('Subiendo archivo…');
    try {
      const limits = { VIDEO: 20, MODEL: 10, AUDIO: 8, IMAGE: 3, TARGET: 5 };
      if (file.size > limits[kind] * 1024 * 1024) throw new Error(`Máximo ${limits[kind]} MB.`);
      if (kind === 'IMAGE') {
        const url = URL.createObjectURL(file);
        try {
          const image = new Image();
          image.src = url;
          await image.decode();
          if (image.width < 300 || image.height < 300 || image.width > 3000 || image.height > 3000)
            throw new Error('Usa una imagen entre 300 y 3000 píxeles por lado.');
          const { Compiler } = await import('@/vendor/mindar/mindar-image.prod.js');
          const compiler = new Compiler();
          await compiler.compileImageTargets([image], (progress) =>
            setBusy(`Compilando tarjeta: ${Math.round(progress)}%`),
          );
          const bytes = compiler.exportData();
          const picture = await experiencesApi.upload(file, 'IMAGE', undefined, projectId);
          const target = await experiencesApi.upload(
            new File([new Uint8Array(bytes)], 'tarjeta.mind', { type: 'application/octet-stream' }),
            'TARGET',
            picture.id,
            projectId,
          );
          onUploaded([picture, target]);
          onChange({ ...value, targetImageAssetId: picture.id, targetAssetId: target.id });
        } finally {
          URL.revokeObjectURL(url);
        }
      } else {
        const asset = await experiencesApi.upload(file, kind, undefined, projectId);
        onUploaded([asset]);
        const key =
          kind === 'VIDEO' ? 'videoAssetId' : kind === 'MODEL' ? 'modelAssetId' : 'audioAssetId';
        field(key, asset.id);
      }
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy('');
    }
  };
  const sectionHeading = (number: string, title: string, description: string) => (
    <div className="exp-editor-section__title">
      <span className="exp-icon text-xs font-extrabold">{number}</span>
      <div>
        <h4 className="text-sm font-bold text-ink">{title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</p>
      </div>
    </div>
  );
  return (
    <div className="min-w-0">
      <section className="exp-editor-section">
        {sectionHeading(
          '01',
          'El mensaje de la celebración',
          'Define el estilo y lo que quieres contar.',
        )}
        <FormGrid>
          <TextField
            select
            label="Contenido de la escena"
            value={value.content}
            onChange={(e) => field('content', e.target.value as ExperienceScene['content'])}
          >
            {[
              ['ALIEN', 'Alien animado original'],
              ['MODEL', 'Modelo 3D (GLB)'],
              ['VIDEO', 'Video'],
              ['COMBINED', 'Modelo 3D y video'],
            ].map(([id, label]) => (
              <MenuItem key={id} value={id}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Título"
            value={value.title}
            slotProps={{ htmlInput: { maxLength: 100 } }}
            onChange={(e) => field('title', e.target.value)}
          />
        </FormGrid>
        <TextField
          fullWidth
          sx={{ mt: 2.5 }}
          label="Dedicatoria"
          multiline
          minRows={3}
          value={value.message}
          slotProps={{ htmlInput: { maxLength: 400 } }}
          onChange={(e) => field('message', e.target.value)}
          helperText={
            value.message.length +
            '/400 caracteres · El cliente verá este mensaje junto a su experiencia.'
          }
        />
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-field border border-line bg-surface-muted px-4 py-3">
          <Palette size={16} className="text-brand-600" />
          <label
            className="min-w-0 flex-1 text-xs font-semibold text-ink"
            htmlFor={'experience-color-' + (projectId ?? 'template')}
          >
            Color del alien
            <span className="mt-1 block font-normal text-ink-muted">
              Se aplica a la escena original y al saludo animado.
            </span>
          </label>
          <input
            id={'experience-color-' + (projectId ?? 'template')}
            aria-label="Color del alien"
            type="color"
            value={value.color}
            onChange={(e) => field('color', e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-field border border-line bg-white p-1"
          />
        </div>
      </section>
      <section className="exp-editor-section">
        {sectionHeading(
          '02',
          'Contenido de la experiencia',
          'Elige archivos de la biblioteca o incorpora los de este trabajo.',
        )}
        {canUpload && (
          <div className="mb-5 flex flex-col items-start justify-between gap-4 rounded-field border border-brand-100 bg-brand-50 p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <span className="exp-icon bg-white">
                <Sparkles size={17} />
              </span>
              <div>
                <p className="text-xs font-bold text-brand-800">Un saludo listo en segundos</p>
                <p className="mt-1 max-w-md text-xs leading-relaxed text-ink-muted">
                  Crea un video de 8 segundos con el título, la dedicatoria y el color elegidos. Sin
                  audio.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(busy) || !value.title.trim()}
              onClick={() => void generateVideo()}
              leftIcon={<Video size={15} />}
            >
              Crear video personalizado
            </Button>
          </div>
        )}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {(
            [
              ['MODEL', 'modelAssetId', 'Modelo GLB', Box, '.glb', '10 MB'],
              [
                'VIDEO',
                'videoAssetId',
                'Video MP4 / WebM',
                FileVideo,
                'video/mp4,video/webm',
                '20 MB',
              ],
              [
                'AUDIO',
                'audioAssetId',
                'Audio MP3 / M4A',
                AudioLines,
                'audio/mpeg,audio/mp4,.m4a',
                '8 MB',
              ],
            ] as const
          ).map(([kind, key, label, Icon, accept, limit]) => {
            const selected = assets.find((asset) => asset.id === value[key]);
            return (
              <div key={kind} className="exp-resource">
                <div className="mb-4 flex items-center justify-between gap-2">
                  <span className="exp-icon">
                    <Icon size={17} />
                  </span>
                  <span className="text-[10px] text-ink-muted">Máx. {limit}</span>
                </div>
                <TextField
                  fullWidth
                  select
                  label={label}
                  value={value[key] ?? ''}
                  onChange={(e) => field(key, e.target.value ? Number(e.target.value) : null)}
                >
                  <MenuItem value="">Sin archivo</MenuItem>
                  {assets
                    .filter((asset) => asset.kind === kind)
                    .map((asset) => (
                      <MenuItem key={asset.id} value={asset.id}>
                        {asset.name}
                      </MenuItem>
                    ))}
                  {value[key] && !selected && (
                    <MenuItem value={value[key]!}>Archivo seleccionado</MenuItem>
                  )}
                </TextField>
                <p className="my-3 flex min-h-4 items-center gap-1.5 truncate text-[10px] text-ink-muted">
                  {value[key] ? (
                    <>
                      <Check size={11} className="shrink-0 text-[#527363]" />
                      {selected?.size
                        ? (selected.size / 1024 / 1024).toFixed(1) + ' MB · Archivo vinculado'
                        : 'Archivo vinculado a la escena'}
                    </>
                  ) : kind === 'AUDIO' ? (
                    'Opcional · Dedicatoria para escuchar'
                  ) : kind === 'MODEL' ? (
                    'Necesario al usar un modelo propio'
                  ) : (
                    'Necesario para completar el servicio'
                  )}
                </p>
                {canUpload && (
                  <Button
                    fullWidth
                    component="label"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(busy)}
                    leftIcon={<Upload size={14} />}
                  >
                    Subir{' '}
                    {kind === 'MODEL'
                      ? 'GLB (10 MB)'
                      : kind === 'VIDEO'
                        ? 'video (20 MB)'
                        : 'audio (8 MB)'}
                    <input
                      hidden
                      type="file"
                      accept={accept}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(file, kind);
                        e.target.value = '';
                      }}
                    />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {busy && (
          <div
            className="mt-4 rounded-field border border-brand-100 bg-brand-50 p-4"
            role="status"
            aria-live="polite"
          >
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-brand-800">
              <Sparkles size={13} />
              {busy}
            </p>
            <LinearProgress color="primary" />
            <p className="mt-2 text-[10px] text-ink-muted">
              Mantén abierta la vista mientras se prepara el archivo.
            </p>
          </div>
        )}
      </section>
      <section className="exp-editor-section">
        {sectionHeading(
          '03',
          'La tarjeta que cobra vida',
          'Esta imagen permitirá reconocer la tarjeta al activar la cámara.',
        )}
        <div className="flex flex-col items-start gap-4 rounded-field border border-line bg-surface-muted p-4 sm:flex-row">
          <div className="grid h-20 w-28 shrink-0 place-items-center overflow-hidden rounded-field border border-line bg-white">
            {value.targetImageAssetId ? (
              <ImageIcon size={28} className="text-brand-400" />
            ) : (
              <img
                src="/images/brand/patisserie-chocolate-v1.jpg"
                alt="Fotografía de reconocimiento de la tarjeta de demostración"
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-ink">
              {value.targetImageAssetId
                ? 'Tarjeta personalizada vinculada'
                : 'Tarjeta de demostración de Misky Challay'}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              {value.targetImageAssetId
                ? 'Su imagen y archivo de reconocimiento están vinculados a esta escena.'
                : 'Ya está preparada para probar la experiencia. Puedes reemplazarla por tu propia fotografía.'}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
              Usa una imagen con detalles y buen contraste. El QR se imprime fuera de la fotografía.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {canUpload && (
            <Button
              component="label"
              variant="outline"
              size="sm"
              disabled={Boolean(busy)}
              leftIcon={<Upload size={14} />}
            >
              Subir y compilar tarjeta (3 MB)
              <input
                hidden
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file, 'IMAGE');
                  e.target.value = '';
                }}
              />
            </Button>
          )}
          {value.targetImageAssetId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange({ ...value, targetImageAssetId: null, targetAssetId: null })}
            >
              Usar tarjeta de demostración
            </Button>
          )}
        </div>
      </section>
      <details className="exp-settings mt-6">
        <summary>
          <Settings2 size={16} />
          Ajustes de la escena 3D
        </summary>
        <div className="grid gap-5 pt-5">
          <p className="text-xs leading-relaxed text-ink-muted">
            Ajusta cómo se presenta el contenido sobre la tarjeta. Revisa la vista previa antes de
            solicitar la aprobación.
          </p>
          <FormGrid minColumnWidth={165}>
            <TextField
              label="Escala"
              type="number"
              value={value.scale}
              slotProps={{ htmlInput: { min: 0.1, max: 3, step: 0.1 } }}
              onChange={(e) => field('scale', Number(e.target.value))}
            />
            <TextField
              label="Rotación (grados)"
              type="number"
              value={value.rotation}
              slotProps={{ htmlInput: { min: -180, max: 180 } }}
              onChange={(e) => field('rotation', Number(e.target.value))}
            />
          </FormGrid>
          <FormGrid minColumnWidth={145}>
            {(['x', 'y', 'z'] as const).map((axis) => (
              <TextField
                key={axis}
                label={'Posición ' + axis.toUpperCase()}
                type="number"
                value={value.position[axis]}
                slotProps={{ htmlInput: { min: -2, max: 2, step: 0.05 } }}
                onChange={(e) =>
                  field('position', { ...value.position, [axis]: Number(e.target.value) })
                }
              />
            ))}
          </FormGrid>
          <TextField
            label="Índice de animación del GLB"
            type="number"
            value={value.animationIndex}
            slotProps={{ htmlInput: { min: 0, max: 100 } }}
            onChange={(e) => field('animationIndex', Number(e.target.value))}
            helperText="La primera animación del archivo corresponde al índice 0."
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={value.videoOnTarget}
                onChange={(e) => field('videoOnTarget', e.target.checked)}
              />
            }
            label={
              <span className="text-xs">
                Mostrar el video sobre la tarjeta AR (sin audio automático)
              </span>
            }
          />
        </div>
      </details>
      {error && (
        <div className="mt-4">
          <Alert variant="danger" title="No se pudo preparar el archivo">
            {error}
          </Alert>
        </div>
      )}
    </div>
  );
}
