import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { Alert, Button, Card, CardContent, Chip, MenuItem, Slider, TextField, Typography } from '@mui/material';
import { Download, Save, Undo2, Upload } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { useThemeSettings } from '@/theme/ThemeSettingsProvider';
import { RADIUS_RANGE, type ThemeTokens } from '@/theme/tokens';
import { contrastRatio, isHex, readableText } from '@/theme/colorUtils';
import { getApiErrorMessage } from '@services/api/client';
import { PERM } from '@constants/permissions';
import { usePermissions } from '@hooks/usePermissions';
import { settingsAdminApi, type SettingRevision, type ThemeAdminState } from '../services/settingsAdmin.service';

const COLOR_FIELDS: Array<{ key: 'primary' | 'secondary' | 'tertiary'; label: string; help: string }> = [
  { key: 'primary', label: 'Azul brillante', help: 'Acciones principales, enlaces y navegación.' },
  { key: 'secondary', label: 'Amarillo sol', help: 'Destacados, precios y llamadas secundarias.' },
  { key: 'tertiary', label: 'Coral cálido', help: 'Detalles expresivos y llamados destacados.' },
];

const normalizeTokens = (value: unknown): ThemeTokens | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ThemeTokens>;
  if (![candidate.primary, candidate.secondary, candidate.tertiary].every((color) => typeof color === 'string' && isHex(color))) return null;
  if (typeof candidate.radius !== 'number' || candidate.radius < 0 || candidate.radius > 5) return null;
  if (candidate.fontFamily !== 'inter' && candidate.fontFamily !== 'system' && candidate.fontFamily !== 'serif') return null;
  if (typeof candidate.baseFontSize !== 'number' || candidate.baseFontSize < 14 || candidate.baseFontSize > 18) return null;
  if (candidate.density !== 'comfortable' && candidate.density !== 'compact') return null;
  if (typeof candidate.shadowStrength !== 'number' || candidate.shadowStrength < 0 || candidate.shadowStrength > 150) return null;
  return { primary: candidate.primary!, secondary: candidate.secondary!, tertiary: candidate.tertiary!, radius: candidate.radius, fontFamily: candidate.fontFamily, baseFontSize: candidate.baseFontSize, density: candidate.density, shadowStrength: candidate.shadowStrength };
};

const ColorControl: FC<{ label: string; help: string; value: string; onChange: (hex: string) => void; disabled?: boolean }> = ({ label, help, value, onChange, disabled }) => {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = (raw: string) => { setText(raw); if (isHex(raw)) onChange(raw.startsWith('#') ? raw : `#${raw}`); };
  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
      <label className={`relative size-11 shrink-0 overflow-hidden rounded-field border border-line ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}><span className="block size-full" style={{ backgroundColor: value }} /><input disabled={disabled} type="color" value={value} onChange={(event) => { setText(event.target.value); onChange(event.target.value); }} className="absolute inset-0 size-full cursor-pointer opacity-0" aria-label={`Elegir ${label}`} /></label>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-ink">{label}</p><p className="truncate text-xs text-ink-muted">{help}</p></div>
      <TextField disabled={disabled} value={text} onChange={(event) => commit(event.target.value)} onBlur={() => setText(value)} size="small" sx={{ width: 108, '& input': { fontFamily: 'monospace', textTransform: 'uppercase' } }} />
    </div>
  );
};

export const ThemeEditor: FC = () => {
  const { tokens, setToken, replaceTokens, loadPublishedTheme } = useThemeSettings();
  const { canAny } = usePermissions();
  const canEdit = canAny(PERM.SETTINGS_MANAGE, PERM.SETTINGS_DESIGN_MANAGE, PERM.SETTINGS_DESIGN_PUBLISH);
  const canPublish = canAny(PERM.SETTINGS_MANAGE, PERM.SETTINGS_DESIGN_PUBLISH);
  const [admin, setAdmin] = useState<ThemeAdminState | null>(null);
  const [revisions, setRevisions] = useState<SettingRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const restoreTimer = useRef<number | null>(null);

  useEffect(() => {
    if (restoreTimer.current !== null) window.clearTimeout(restoreTimer.current);
    let active = true;
    void Promise.all([settingsAdminApi.getThemeAdmin(), settingsAdminApi.themeRevisions()])
      .then(([state, history]) => { if (active) { setAdmin(state); setRevisions(history); replaceTokens(state.draft); } })
      .catch((reason) => { if (active) setError(getApiErrorMessage(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      restoreTimer.current = window.setTimeout(() => { void loadPublishedTheme(); }, 0);
    };
  }, [loadPublishedTheme, replaceTokens]);

  const dirty = Boolean(admin && JSON.stringify(tokens) !== JSON.stringify(admin.draft));
  const contrastIssues = useMemo(() => COLOR_FIELDS.map(({ key, label }) => ({ key, label, ratio: contrastRatio(tokens[key], readableText(tokens[key])) })).filter((item) => item.ratio < 4.5), [tokens]);

  const refresh = async () => {
    const [state, history] = await Promise.all([settingsAdminApi.getThemeAdmin(), settingsAdminApi.themeRevisions()]);
    setAdmin(state); setRevisions(history); replaceTokens(state.draft);
  };

  const saveDraft = async (): Promise<ThemeAdminState | null> => {
    if (contrastIssues.length) { toast.error('Corrige el contraste antes de guardar el borrador'); return null; }
    setBusy(true);
    try { const state = await settingsAdminApi.saveThemeDraft(tokens, admin?.draftVersion || undefined); setAdmin(state); replaceTokens(state.draft); toast.success('Borrador guardado'); return state; }
    catch (reason) { toast.error(getApiErrorMessage(reason)); return null; }
    finally { setBusy(false); }
  };

  const publish = async () => {
    const saved = dirty ? await saveDraft() : admin;
    if (!saved) return;
    setBusy(true);
    try { const state = await settingsAdminApi.publishTheme(saved.draftVersion); setAdmin(state); replaceTokens(state.published); toast.success('Tema publicado para toda la aplicación'); }
    catch (reason) { toast.error(getApiErrorMessage(reason)); }
    finally { setBusy(false); }
  };

  const resetDraft = async () => {
    if (!window.confirm('¿Restablecer el borrador a la identidad original? El tema publicado no cambiará hasta publicar.')) return;
    setBusy(true);
    try { const state = await settingsAdminApi.resetTheme(admin?.draftVersion || undefined); setAdmin(state); replaceTokens(state.draft); toast.success('Borrador restablecido'); }
    catch (reason) { toast.error(getApiErrorMessage(reason)); }
    finally { setBusy(false); }
  };

  const rollback = async (revision: SettingRevision) => {
    if (!admin || !window.confirm(`¿Restaurar la versión ${revision.version} como borrador?`)) return;
    setBusy(true);
    try { const state = await settingsAdminApi.rollbackTheme(revision.id, admin.draftVersion); setAdmin(state); replaceTokens(state.draft); toast.success('Versión restaurada como borrador'); }
    catch (reason) { toast.error(getApiErrorMessage(reason)); }
    finally { setBusy(false); }
  };

  const exportTheme = () => {
    const file = new Blob([JSON.stringify(tokens, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file); const link = document.createElement('a'); link.href = url; link.download = 'misky-challay-theme.json'; link.click(); URL.revokeObjectURL(url);
  };

  const importTheme = async (file: File) => {
    try { const parsed = normalizeTokens(JSON.parse(await file.text())); if (!parsed) throw new Error('El archivo no contiene un tema válido.'); replaceTokens(parsed); toast.success('Tema cargado como borrador local; guárdalo para persistirlo'); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : 'No pudimos leer el tema'); }
  };

  if (loading) return <Alert severity="info">Cargando el tema publicado y el borrador del superadmin…</Alert>;
  if (error || !admin) return <Alert severity="error">{error || 'No pudimos cargar la configuración del tema.'}<Button size="small" onClick={() => void refresh()}>Reintentar</Button></Alert>;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-muted p-4">
        <div><p className="text-sm font-extrabold text-ink">{dirty ? 'Borrador con cambios' : 'Borrador sincronizado'}</p><p className="mt-1 text-xs text-ink-muted">Publicado v{admin.publishedVersion} · Borrador v{admin.draftVersion} · Solo publicar cambia la apariencia de toda la aplicación.</p></div>
        <div className="flex flex-wrap gap-2"><Button disabled={!canEdit} size="small" variant="outlined" startIcon={<Upload className="size-3.5" />} component="label">Importar<input hidden type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importTheme(file); event.currentTarget.value = ''; }} /></Button><Button size="small" variant="outlined" startIcon={<Download className="size-3.5" />} onClick={exportTheme}>Exportar</Button><Button size="small" variant="outlined" startIcon={<Undo2 className="size-3.5" />} onClick={() => void resetDraft()} disabled={busy || !canEdit}>Restablecer</Button></div>
      </div>

      {!canEdit && <Alert severity="info">Tienes acceso de lectura. Solicita el permiso de edición para guardar borradores.</Alert>}
      <div className="grid gap-3">{COLOR_FIELDS.map((field) => <ColorControl disabled={!canEdit} key={field.key} label={field.label} help={field.help} value={tokens[field.key]} onChange={(hex) => setToken(field.key, hex)} />)}</div>

      <div className="grid gap-4 rounded-card border border-line bg-surface p-4"><div><p className="text-sm font-semibold text-ink">Radio, densidad y elevación</p><p className="text-xs text-ink-muted">Controla el ritmo de espacios, el tamaño de controles y la profundidad de las superficies.</p></div><Slider disabled={!canEdit} value={tokens.radius} min={RADIUS_RANGE.min} max={RADIUS_RANGE.max} step={1} valueLabelDisplay="auto" onChange={(_, value) => setToken('radius', value as number)} /><div className="grid gap-3 sm:grid-cols-2"><TextField disabled={!canEdit} select label="Familia tipográfica" value={tokens.fontFamily} onChange={(event) => setToken('fontFamily', event.target.value as ThemeTokens['fontFamily'])}><MenuItem value="inter">Inter</MenuItem><MenuItem value="system">Sistema</MenuItem><MenuItem value="serif">Serif editorial</MenuItem></TextField><TextField disabled={!canEdit} label="Tamaño base" type="number" slotProps={{ htmlInput: { min: 14, max: 18, step: 1 } }} value={tokens.baseFontSize} onChange={(event) => setToken('baseFontSize', Math.min(18, Math.max(14, Number(event.target.value))))} /><TextField disabled={!canEdit} select label="Densidad" value={tokens.density} onChange={(event) => setToken('density', event.target.value as ThemeTokens['density'])}><MenuItem value="comfortable">Cómoda</MenuItem><MenuItem value="compact">Compacta</MenuItem></TextField><TextField disabled={!canEdit} label="Fuerza de sombras (%)" type="number" slotProps={{ htmlInput: { min: 0, max: 150, step: 5 } }} value={tokens.shadowStrength} onChange={(event) => setToken('shadowStrength', Math.min(150, Math.max(0, Number(event.target.value))))} /></div></div>

      {contrastIssues.length > 0 ? <Alert severity="warning">{contrastIssues.map((item) => `${item.label}: ${item.ratio.toFixed(2)}:1`).join(' · ')}. Usa colores más oscuros o claros antes de guardar.</Alert> : <Alert severity="success">Los colores de marca superan el contraste AA para el texto que el sistema calcula automáticamente.</Alert>}
      <div className="flex flex-wrap justify-end gap-2"><Button variant="outlined" startIcon={<Save className="size-4" />} disabled={!dirty || busy || !canEdit} onClick={() => void saveDraft()}>Guardar borrador</Button><Button variant="contained" startIcon={<Save className="size-4" />} disabled={contrastIssues.length > 0 || busy || !canPublish} onClick={() => void publish()}>Guardar y publicar</Button></div>

      <div className="grid gap-3"><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Versiones recientes</p>{revisions.length === 0 ? <p className="text-sm text-ink-muted">Aún no hay versiones del tema.</p> : revisions.slice(0, 8).map((revision) => <div key={revision.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-white p-3 text-sm"><span><strong>v{revision.version}</strong> · {new Date(revision.createdAt).toLocaleString('es-PE')} · {revision.reason}</span><Button size="small" variant="outlined" disabled={busy || !canEdit} onClick={() => void rollback(revision)}>Restaurar borrador</Button></div>)}</div>

      <Card variant="outlined"><CardContent className="grid gap-4"><Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>Vista previa en vivo</Typography><div className="flex flex-wrap gap-2"><Button variant="contained">Principal</Button><Button variant="contained" color="secondary">Acento</Button><Button variant="contained" color="tertiary">Apoyo</Button></div><div className="flex flex-wrap gap-2"><Button variant="outlined">Principal</Button><Button variant="outlined" color="secondary">Acento</Button><Button variant="outlined" color="tertiary">Apoyo</Button><Chip label="Estado activo" color="primary" /></div><TextField label="Campo de ejemplo" defaultValue="Escribe aquí" fullWidth /><Typography variant="body2" color="text.secondary">El borrador se previsualiza en toda la interfaz mientras editas; al salir, se restaura el tema publicado.</Typography></CardContent></Card>
    </div>
  );
};
