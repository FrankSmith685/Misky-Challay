import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { ROUTES } from '@constants/routes';
import { getApiErrorMessage } from '@services/api/client';
import { cakesApi, type CakeConfiguration, type Effort, type Station } from '../cakes.service';

const stations: Station[] = ['DESIGN', 'BAKING', 'COOLING', 'FILLING', 'DECORATING', 'QA', 'DISPATCH'];
const labels: Record<Station, string> = { DESIGN: 'Diseño', BAKING: 'Horneado', COOLING: 'Enfriado', FILLING: 'Relleno', DECORATING: 'Decoración', QA: 'Calidad', DISPATCH: 'Despacho' };
const validEffort = (effort: Effort, max: number) => stations.every((station) => Number.isInteger(effort[station] ?? 0) && (effort[station] ?? 0) >= 0 && (effort[station] ?? 0) <= max);
const Minutes = ({ title, value, onChange, max = 1440 }: { title: string; value: Effort; onChange: (next: Effort) => void; max?: number }) => <fieldset className="rounded-xl border border-line p-4"><legend className="px-1 text-sm font-semibold">{title}</legend><div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-7">{stations.map((station) => <Input key={station} label={labels[station]} type="number" min="0" max={max} step="1" value={value[station] ?? 0} onChange={(event) => onChange({ ...value, [station]: Number(event.target.value) })} />)}</div></fieldset>;

export const ProductionSettings = ({ selectedProductId }: { selectedProductId: number }) => {
  const [rows, setRows] = useState<CakeConfiguration[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void cakesApi.configuration().then(setRows).catch((cause) => setError(getApiErrorMessage(cause))); }, []);
  const update = (productId: number, change: (row: CakeConfiguration) => CakeConfiguration) => setRows((current) => current.map((row) => row.product.id === productId ? change(row) : row));
  const save = async (operation: () => Promise<unknown>, text: string) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(text); } catch (cause) { setError(getApiErrorMessage(cause)); } finally { setBusy(false); }
  };
  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Preparación, opciones y plazos</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-ink-muted">La categoría organiza el catálogo. Estas reglas definen cómo se compra y prepara el producto. Cada bloque se guarda por separado.</p></div><div className="flex gap-4 text-sm font-semibold text-brand-700"><Link to={ROUTES.adminCatalog}>Catálogo</Link><Link to={ROUTES.adminBuilder}>Constructor</Link></div></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800">{notice}</p>}
    {rows.filter((row) => row.product.id === selectedProductId).map((row) => {
      const ready = row.product.preparationMode === 'READY_STOCK';
      return <article key={row.product.id} className="space-y-5 rounded-card border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold">{row.product.name}</h3><p className="mt-1 text-xs text-ink-muted">{ready ? 'Producto preparado · disponibilidad por existencias' : 'Por encargo · disponibilidad por insumos y capacidad'}</p></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row.profile.isActive} onChange={(event) => update(row.product.id, (old) => ({ ...old, profile: { ...old.profile, isActive: event.target.checked } }))} />Habilitar reglas de preparación</label></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Select label="Personalización permitida" value={row.profile.saleMode} onChange={(event) => update(row.product.id, (old) => ({ ...old, profile: { ...old.profile, saleMode: event.target.value as CakeConfiguration['profile']['saleMode'] } }))}>
            <SelectOption value="STANDARD">Sin personalización</SelectOption><SelectOption value="SEMI_CUSTOM" disabled={ready}>Opciones configuradas</SelectOption><SelectOption value="ADVANCED" disabled={ready || row.product.family !== 'CAKE'}>Diseño por cotización</SelectOption>
          </Select>
          <Input label="Anticipación mínima (horas)" type="number" min="0" max="720" step="1" value={row.profile.minLeadHours} onChange={(event) => update(row.product.id, (old) => ({ ...old, profile: { ...old.profile, minLeadHours: Number(event.target.value) } }))} />
        </div>
        <p className="rounded-xl bg-surface-muted p-4 text-sm leading-6 text-ink-muted">{ready ? 'Configura el tiempo necesario para el despacho. El pedido reserva las unidades de producto terminado conectadas en la receta; no reserva etapas de elaboración.' : `La primera etapa se programa ${Math.max(0, ...Object.values(row.profile.stationOffsetsJson))} día(s) antes de la entrega. La anticipación mínima debe cubrir ese plazo; la disponibilidad también depende de la capacidad de la sucursal. Las opciones y sus recargos se configuran en Constructor.`}</p>
        {!ready && <div className="space-y-4"><Minutes title="Minutos base por presentación" value={row.profile.baseEffortJson} onChange={(value) => update(row.product.id, (old) => ({ ...old, profile: { ...old.profile, baseEffortJson: value } }))} /><Minutes title="Días antes de la entrega por etapa" max={30} value={row.profile.stationOffsetsJson} onChange={(value) => update(row.product.id, (old) => ({ ...old, profile: { ...old.profile, stationOffsetsJson: value } }))} /></div>}
        <Button isLoading={busy} disabled={busy} onClick={() => {
          if (!Number.isInteger(row.profile.minLeadHours) || row.profile.minLeadHours < 0 || row.profile.minLeadHours > 720 || !validEffort(row.profile.baseEffortJson, 1440) || !validEffort(row.profile.stationOffsetsJson, 30)) { setError('Revisa la anticipación, los minutos y los días de preparación.'); return; }
          const requiredLeadHours = Math.max(0, ...Object.values(row.profile.stationOffsetsJson)) * 24;
          if (!ready && row.profile.minLeadHours < requiredLeadHours) { setError(`La anticipación mínima debe ser de al menos ${requiredLeadHours} horas para cubrir las etapas planificadas.`); return; }
          void save(() => cakesApi.updateProfile(row.product.id, row.profile), 'Reglas de preparación guardadas');
        }}>Guardar reglas de preparación</Button>
        {!ready && <div className="space-y-4 border-t border-line pt-5"><div><h4 className="font-bold">Tiempos por presentación</h4><p className="mt-1 text-xs leading-5 text-ink-muted">Si una presentación tiene tiempos propios, reemplazan los minutos base. La receta se configura para una o varias presentaciones según su rendimiento.</p></div>
          {row.variants.map((variant) => <div key={variant.id} className="space-y-3 rounded-xl bg-surface-muted p-4"><Minutes title={variant.name} value={variant.productionMinutesJson ?? {}} onChange={(value) => update(row.product.id, (old) => ({ ...old, variants: old.variants.map((entry) => entry.id === variant.id ? { ...entry, productionMinutesJson: value } : entry) }))} /><Button variant="outline" size="sm" disabled={busy} onClick={() => {
            if (!validEffort(variant.productionMinutesJson ?? {}, 1440)) { setError('Los minutos deben estar entre 0 y 1440.'); return; }
            void save(() => cakesApi.updateVariantEffort(variant.id, variant.productionMinutesJson ?? {}), 'Tiempos de presentación guardados');
          }}>Guardar tiempos de {variant.name}</Button></div>)}
        </div>}
        {!ready && row.options.length > 0 && <div className="space-y-4 border-t border-line pt-5"><h4 className="font-bold">Tiempo adicional por opción</h4>{row.options.map((option) => <div key={option.id} className="space-y-3 rounded-xl bg-surface-muted p-4"><Minutes title={option.name} value={option.productionMinutesJson ?? {}} onChange={(value) => update(row.product.id, (old) => ({ ...old, options: old.options.map((entry) => entry.id === option.id ? { ...entry, productionMinutesJson: value } : entry) }))} /><Button size="sm" variant="outline" disabled={busy} onClick={() => {
          if (!validEffort(option.productionMinutesJson ?? {}, 1440)) { setError('Los minutos deben estar entre 0 y 1440.'); return; }
          void save(() => cakesApi.updateOptionEffort(option.id, option.productionMinutesJson ?? {}), 'Tiempos de opción guardados');
        }}>Guardar tiempos de {option.name}</Button></div>)}</div>}
      </article>;
    })}
  </section>;
};
