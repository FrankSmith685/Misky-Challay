import { useEffect, useRef, useState } from 'react';
import { Checkbox, FormControlLabel, MenuItem, TextField, LinearProgress } from '@mui/material';
import {
  AudioLines,
  Box,
  Check,
  FileVideo,
  Image as ImageIcon,
  Layers3,
  MapPin,
  Palette,
  QrCode,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import { Alert } from '@components/ui/Alert';
import { FormGrid } from '@components/ui/FormSection';
import { Button } from '@components/ui/Button';
import { getApiErrorMessage } from '@services/api/client';
import {
  experiencesApi,
  type ExperienceLayer,
  type ExperienceScene,
  type ExperienceAsset,
} from './experiences.service';

const demoAppearance: ExperienceScene['appearance'] = {
  preset: 'PASTRY', exposure: 1, ambientIntensity: 1.8, keyIntensity: 2.3,
  roughness: 0.62, metalness: 0, environment: 'ROOM', toneMapping: 'ACES',
};
const demoCamera: ExperienceScene['camera'] = { autoRotate: true, autoRotateSpeed: 0.65, fov: 38, distance: 2.4 };
const demoQr: ExperienceScene['qr'] = { dark: '#003a60', light: '#ffffff', frame: 'LIGHT', label: 'Escanea y descubre', logo: 'BRAND', background: 'SOFT' };

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
  const layers = value.layers ?? [];
  const addLayer = (kind: ExperienceLayer['kind']) => {
    const index = layers.length + 1;
    const layer: ExperienceLayer = {
      id: `layer-${Date.now()}-${index}`.slice(0, 40),
      kind,
      name: kind === 'BUTTON' ? 'Boton ' + index : kind === 'HOTSPOT' ? 'Punto ' + index : 'Texto ' + index,
      text: kind === 'BUTTON' ? 'Ver mi sorpresa' : kind === 'HOTSPOT' ? 'Descubre este detalle' : 'Una sorpresa hecha para celebrar',
      action: kind === 'BUTTON' || kind === 'HOTSPOT' ? 'PLAY_VIDEO' : 'NONE',
      position: { x: 0, y: kind === 'BUTTON' ? -0.95 : 1.25, z: 0 },
      scale: 1,
      visible: true,
    };
    field('layers', [...layers, layer]);
  };
  const updateLayer = (id: string, patch: Partial<ExperienceLayer>) =>
    field(
      'layers',
      layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    );
  const removeLayer = (id: string) => field('layers', layers.filter((layer) => layer.id !== id));
  const upload = async (input: File | File[], kind: ExperienceAsset['kind']) => {
    setError('');
    setBusy('Subiendo archivo...');
    try {
      const files = Array.isArray(input) ? input : [input];
      const file = files[0];
      const limits = { VIDEO: 20, MODEL: 10, AUDIO: 8, IMAGE: 3, TARGET: 5 };
      if (!file || files.some((entry) => entry.size > limits[kind] * 1024 * 1024)) throw new Error(`Maximo ${limits[kind]} MB por archivo.`);
      if (kind === 'IMAGE') {
        if (files.length > 8) throw new Error('Puedes compilar hasta 8 tarjetas por escena.');
        if (files.some((entry) => !['image/png', 'image/jpeg'].includes(entry.type)))
          throw new Error('Las tarjetas deben ser imagenes PNG o JPEG.');
        const urls = files.map((entry) => URL.createObjectURL(entry));
        try {
          const images = await Promise.all(urls.map(async (source) => {
            const image = new Image();
            image.src = source;
            await image.decode();
            if (image.width < 300 || image.height < 300 || image.width > 3000 || image.height > 3000)
              throw new Error('Usa imagenes entre 300 y 3000 pixeles por lado.');
            return image;
          }));
          const { Compiler } = await import('@/vendor/mindar/mindar-image.prod.js');
          const compiler = new Compiler();
          await compiler.compileImageTargets(images, (progress) => setBusy(`Compilando ${files.length} marcadores: ${Math.round(progress)}%`));
          const bytes = compiler.exportData();
          const pictures = await Promise.all(files.map((entry) => experiencesApi.upload(entry, 'IMAGE', undefined, projectId)));
          const target = await experiencesApi.upload(
            new File([new Uint8Array(bytes)], 'tarjetas-multiples.mind', { type: 'application/octet-stream' }),
            'TARGET',
            pictures[0].id,
            projectId,
          );
          const markers = pictures.map((picture, index) => ({
            id: `marker-${picture.id}`,
            name: files[index].name.replace(/\.[^.]+$/, '').slice(0, 100),
            imageAssetId: picture.id,
            targetAssetId: target.id,
            enabled: true,
          }));
          onUploaded([...pictures, target]);
          onChange({ ...value, targetImageAssetId: pictures[0].id, targetAssetId: target.id, markers });
        } finally {
          urls.forEach((source) => URL.revokeObjectURL(source));
        }
      } else {
        const asset = await experiencesApi.upload(file, kind, undefined, projectId);
        onUploaded([asset]);
        const key = kind === 'VIDEO' ? 'videoAssetId' : kind === 'MODEL' ? 'modelAssetId' : 'audioAssetId';
        field(key, asset.id);
      }
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy('');
    }
  };  const sectionHeading = (number: string, title: string, description: string) => (
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
              ['CAKE', 'Torta 3D Misky Challay'],
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
        <TextField
          fullWidth
          sx={{ mt: 2.5 }}
          label="Qué debe enfocar el cliente"
          value={value.recognitionLabel ?? 'la tarjeta'}
          slotProps={{ htmlInput: { maxLength: 80 } }}
          onChange={(e) => field('recognitionLabel', e.target.value)}
          helperText="Ejemplos: la tarjeta, el topper del gallo o la imagen del pastel."
        />
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-field border border-line bg-surface-muted px-4 py-3">
          <Palette size={16} className="text-brand-600" />
          <label
            className="min-w-0 flex-1 text-xs font-semibold text-ink"
            htmlFor={'experience-color-' + (projectId ?? 'template')}
          >
            Color de la escena
            <span className="mt-1 block font-normal text-ink-muted">
              Se aplica a la torta 3D, los acentos y el saludo animado.
            </span>
          </label>
          <input
            id={'experience-color-' + (projectId ?? 'template')}
            aria-label="Color de la escena"
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
                      <Check size={11} className="shrink-0 text-emerald-600" />
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
        {(value.markers ?? []).length > 0 && (
          <div className="mt-4 grid gap-2 rounded-field border border-line bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-ink">Marcadores de la escena</p>
                <p className="mt-1 text-[11px] text-ink-muted">Puedes reconocer varias tarjetas con el mismo contenido.</p>
              </div>
              <span className="rounded-pill bg-brand-50 px-2 py-1 text-[10px] font-bold text-brand-700">{value.markers?.length}/8</span>
            </div>
            <div className="grid gap-2">
              {(value.markers ?? []).map((marker) => (
                <div key={marker.id} className="flex items-center gap-3 rounded-field border border-line bg-surface-muted px-3 py-2">
                  <Checkbox size="small" checked={marker.enabled} onChange={(e) => onChange({ ...value, markers: (value.markers ?? []).map((entry) => entry.id === marker.id ? { ...entry, enabled: e.target.checked } : entry) })} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{marker.name}</span>
                  {canUpload && <Button variant="ghost" size="sm" aria-label={`Eliminar marcador ${marker.name}`} onClick={() => {
                    const markers = (value.markers ?? []).filter((entry) => entry.id !== marker.id);
                    const fallback = markers[0];
                    onChange({ ...value, markers, ...(value.targetImageAssetId === marker.imageAssetId ? { targetImageAssetId: fallback?.imageAssetId ?? null, targetAssetId: fallback?.targetAssetId ?? null } : {}) });
                  }}><Trash2 size={14} /></Button>}
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {canUpload && (
            <Button
              component="label"
              variant="outline"
              size="sm"
              disabled={Boolean(busy)}
              leftIcon={<Upload size={14} />}
            >
                Subir y compilar tarjetas (varias, 3 MB cada una)
              <input
                hidden
                  multiple
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) void upload(files, 'IMAGE');
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
      <section className="exp-editor-section">
        {sectionHeading(
          '04',
          'Capas y acciones premium',
          'Agrega texto sobre la torta o botones para reproducir contenido y compartir la experiencia.',
        )}
        <div className="mb-4 flex flex-wrap gap-2">
          {canUpload && (
            <>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Plus size={14} />}
                onClick={() => addLayer('TEXT')}
              >
                Agregar texto
              </Button>
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Plus size={14} />}
                onClick={() => addLayer('BUTTON')}
              >
                Agregar botón
              </Button>
              <Button variant="outline" size="sm" leftIcon={<MapPin size={14} />} onClick={() => addLayer('HOTSPOT')}>
                Agregar punto
              </Button>
            </>
          )}
        </div>
        {layers.length ? (
          <div className="grid gap-3">
            {layers.map((layer, index) => (
              <div key={layer.id} className="rounded-field border border-line bg-surface-muted p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="exp-icon"><Layers3 size={15} /></span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-ink">{layer.name}</p>
                      <p className="text-[10px] text-ink-muted">
                        {layer.kind === 'BUTTON' ? 'Boton interactivo' : layer.kind === 'HOTSPOT' ? 'Punto de interes' : 'Texto 3D'} · Capa {index + 1}
                      </p>
                    </div>
                  </div>
                  {canUpload && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Eliminar ${layer.name}`}
                      onClick={() => removeLayer(layer.id)}
                    >
                      <Trash2 size={15} />
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    fullWidth
                    label="Nombre de capa"
                    value={layer.name}
                    disabled={!canUpload}
                    onChange={(e) => updateLayer(layer.id, { name: e.target.value })}
                  />
                  <TextField
                    fullWidth
                    label="Texto visible"
                    value={layer.text}
                    disabled={!canUpload}
                    slotProps={{ htmlInput: { maxLength: 240 } }}
                    onChange={(e) => updateLayer(layer.id, { text: e.target.value })}
                  />
                  {(layer.kind === 'BUTTON' || layer.kind === 'HOTSPOT') && (
                    <TextField
                      fullWidth
                      select
                      label="Acción al pulsar"
                      value={layer.action}
                      disabled={!canUpload}
                      onChange={(e) =>
                        updateLayer(layer.id, {
                          action: e.target.value as ExperienceLayer['action'],
                        })
                      }
                    >
                      <MenuItem value="NONE">Sin acción</MenuItem>
                      <MenuItem value="PLAY_VIDEO">Reproducir video</MenuItem>
                      <MenuItem value="PLAY_AUDIO">Reproducir audio</MenuItem>
                      <MenuItem value="SHARE">Compartir experiencia</MenuItem>
                    </TextField>
                  )}
                  <FormGrid minColumnWidth={105}>
                    {(['x', 'y', 'z'] as const).map((axis) => (
                      <TextField
                        key={axis}
                        label={`Posición ${axis.toUpperCase()}`}
                        type="number"
                        value={layer.position[axis]}
                        disabled={!canUpload}
                        slotProps={{ htmlInput: { min: -2, max: 2, step: 0.05 } }}
                        onChange={(e) =>
                          updateLayer(layer.id, {
                            position: { ...layer.position, [axis]: Number(e.target.value) },
                          })
                        }
                      />
                    ))}
                  </FormGrid>
                </div>
                <FormControlLabel
                  className="mt-2"
                  control={
                    <Checkbox
                      checked={layer.visible}
                      disabled={!canUpload}
                      onChange={(e) => updateLayer(layer.id, { visible: e.target.checked })}
                    />
                  }
                  label={<span className="text-xs">Visible en la escena</span>}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-field border border-dashed border-line bg-surface-muted p-4 text-xs leading-relaxed text-ink-muted">
            Aún no hay capas. Agrega un texto para mostrar el nombre del festejado o un botón para
            reproducir el saludo, escuchar el audio o compartir el enlace.
          </div>
        )}
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
          <div className="grid gap-4 rounded-field border border-line bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="exp-icon"><Palette size={16} /></span>
              <div>
                <p className="text-xs font-bold text-ink">Iluminacion y materiales</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">Ajusta el acabado del modelo sin editar el GLB.</p>
              </div>
            </div>
            <FormGrid minColumnWidth={150}>
              <TextField select label="Preset visual" value={value.appearance?.preset ?? 'PASTRY'} onChange={(e) => field('appearance', { ...(value.appearance ?? demoAppearance), preset: e.target.value as ExperienceScene['appearance']['preset'] })}>
                <MenuItem value="PASTRY">Pasteleria calida</MenuItem>
                <MenuItem value="ELEGANT">Elegante</MenuItem>
                <MenuItem value="NATURAL">Natural</MenuItem>
                <MenuItem value="NIGHT">Nocturno</MenuItem>
              </TextField>
              <TextField label="Exposicion" type="number" value={value.appearance?.exposure ?? 1} slotProps={{ htmlInput: { min: 0.4, max: 2, step: 0.05 } }} onChange={(e) => field('appearance', { ...(value.appearance ?? demoAppearance), exposure: Number(e.target.value) })} />
              <TextField label="Luz ambiente" type="number" value={value.appearance?.ambientIntensity ?? 1.8} slotProps={{ htmlInput: { min: 0, max: 5, step: 0.1 } }} onChange={(e) => field('appearance', { ...(value.appearance ?? demoAppearance), ambientIntensity: Number(e.target.value) })} />
              <TextField label="Luz principal" type="number" value={value.appearance?.keyIntensity ?? 2.3} slotProps={{ htmlInput: { min: 0, max: 6, step: 0.1 } }} onChange={(e) => field('appearance', { ...(value.appearance ?? demoAppearance), keyIntensity: Number(e.target.value) })} />
              <TextField label="Rugosidad" type="number" value={value.appearance?.roughness ?? 0.62} slotProps={{ htmlInput: { min: 0, max: 1, step: 0.05 } }} onChange={(e) => field('appearance', { ...(value.appearance ?? demoAppearance), roughness: Number(e.target.value) })} />
              <TextField label="Metalness" type="number" value={value.appearance?.metalness ?? 0} slotProps={{ htmlInput: { min: 0, max: 1, step: 0.05 } }} onChange={(e) => field('appearance', { ...(value.appearance ?? demoAppearance), metalness: Number(e.target.value) })} />
            </FormGrid>
          </div>
          <div className="grid gap-4 rounded-field border border-line bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="exp-icon"><Settings2 size={16} /></span>
              <div>
                <p className="text-xs font-bold text-ink">Camara y movimiento</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">Define como se presenta la escena al abrirla.</p>
              </div>
            </div>
            <FormGrid minColumnWidth={150}>
              <TextField label="Campo de vision" type="number" value={value.camera?.fov ?? 38} slotProps={{ htmlInput: { min: 25, max: 70, step: 1 } }} onChange={(e) => field('camera', { ...(value.camera ?? demoCamera), fov: Number(e.target.value) })} />
              <TextField label="Velocidad de giro" type="number" value={value.camera?.autoRotateSpeed ?? 0.65} slotProps={{ htmlInput: { min: 0, max: 3, step: 0.05 } }} onChange={(e) => field('camera', { ...(value.camera ?? demoCamera), autoRotateSpeed: Number(e.target.value) })} />
              <TextField label="Distancia inicial" type="number" value={value.camera?.distance ?? 2.4} slotProps={{ htmlInput: { min: 1.2, max: 12, step: 0.1 } }} onChange={(e) => field('camera', { ...(value.camera ?? demoCamera), distance: Number(e.target.value) })} />
            </FormGrid>
            <FormControlLabel control={<Checkbox checked={value.camera?.autoRotate ?? true} onChange={(e) => field('camera', { ...(value.camera ?? demoCamera), autoRotate: e.target.checked })} />} label={<span className="text-xs">Giro automatico al abrir</span>} />
          </div>
          <div className="grid gap-4 rounded-field border border-line bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="exp-icon"><QrCode size={16} /></span>
              <div>
                <p className="text-xs font-bold text-ink">Codigo QR</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-muted">Personaliza el QR que acompana esta experiencia.</p>
              </div>
            </div>
            <FormGrid minColumnWidth={150}>
              <TextField label="Color QR" type="color" value={value.qr?.dark ?? '#003a60'} onChange={(e) => field('qr', { ...(value.qr ?? demoQr), dark: e.target.value })} />
              <TextField label="Fondo QR" type="color" value={value.qr?.light ?? '#ffffff'} onChange={(e) => field('qr', { ...(value.qr ?? demoQr), light: e.target.value })} />
              <TextField label="Texto" value={value.qr?.label ?? 'Escanea y descubre'} slotProps={{ htmlInput: { maxLength: 80 } }} onChange={(e) => field('qr', { ...(value.qr ?? demoQr), label: e.target.value })} />
              <TextField select label="Logo central" value={value.qr?.logo ?? 'BRAND'} onChange={(e) => field('qr', { ...(value.qr ?? demoQr), logo: e.target.value as ExperienceScene['qr']['logo'] })}>
                <MenuItem value="BRAND">Marca Misky</MenuItem>
                <MenuItem value="NONE">Sin logo</MenuItem>
              </TextField>
              <TextField select label="Fondo del logo" value={value.qr?.background ?? 'SOFT'} onChange={(e) => field('qr', { ...(value.qr ?? demoQr), background: e.target.value as ExperienceScene['qr']['background'] })}>
                <MenuItem value="SOFT">Suave</MenuItem>
                <MenuItem value="SOLID">Sólido</MenuItem>
              </TextField>
            </FormGrid>
          </div>
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
