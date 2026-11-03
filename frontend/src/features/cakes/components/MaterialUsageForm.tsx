import { useEffect, useState } from 'react';
import { Button } from '@components/ui/Button';
import { getApiErrorMessage } from '@services/api/client';
import type { ProductionTask, RecipeInventoryItem } from '../cakes.service';
import { cakesApi } from '../cakes.service';

export const MaterialUsageForm = ({ task, branchId, canOperate, disabled, onSaved }: { task: ProductionTask; branchId: number; canOperate: boolean; disabled?: boolean; onSaved: () => void }) => {
  const [consumed, setConsumed] = useState<Record<string, number>>({});
  const [waste, setWaste] = useState<Record<string, number>>({});
  const [items, setItems] = useState<RecipeInventoryItem[]>([]);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const canonical = (value: Record<string, number> | null | undefined) => Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  const serverVersion = JSON.stringify([canonical(task.materialConsumedJson), canonical(task.materialWasteJson), canonical(task.materialPlanJson)]);
  const [baseline, setBaseline] = useState(serverVersion);
  const [dirty, setDirty] = useState(false);
  const [waitingVersion, setWaitingVersion] = useState<string | null>(null);
  const [identity, setIdentity] = useState(`${branchId}:${task.id}`);
  const conflict = dirty && !waitingVersion && baseline !== serverVersion;
  useEffect(() => {
    const nextIdentity = `${branchId}:${task.id}`;
    if (identity === nextIdentity && waitingVersion) {
      if (serverVersion === waitingVersion) { setDirty(false); setWaitingVersion(null); }
      else if (serverVersion !== baseline) setWaitingVersion(null);
      return;
    }
    if (identity === nextIdentity && dirty) return;
    setWaitingVersion(null);
    setConsumed(Object.keys(task.materialConsumedJson ?? {}).length ? task.materialConsumedJson! : { ...task.materialPlanJson });
    setWaste(task.materialWasteJson ?? {});
    setBaseline(serverVersion);
    setIdentity(nextIdentity);
    setDirty(false);
  }, [branchId, task.id, task.materialConsumedJson, task.materialPlanJson, task.materialWasteJson, identity, dirty, serverVersion, waitingVersion, baseline]);
  useEffect(() => { void cakesApi.recipes().then((data) => setItems(data.inventoryItems)).catch((cause) => setError(getApiErrorMessage(cause))); }, []);
  const plan = task.materialPlanJson ?? {};
  if (!Object.keys(plan).length) return null;
  const save = async () => {
    if (conflict || waitingVersion || saving || !canOperate) return;
    setSaving(true); setError('');
    try {
      const [previousConsumed, previousWaste] = JSON.parse(baseline) as [Record<string, number>, Record<string, number>];
      const saved = await cakesApi.recordMaterials(task.id, { branchId, consumed, waste, expectedMaterials: { consumed: previousConsumed, waste: previousWaste } });
      setWaitingVersion(JSON.stringify([canonical(saved.materialConsumedJson), canonical(saved.materialWasteJson), canonical(saved.materialPlanJson)]));
      onSaved();
    }
    catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setSaving(false); }
  };
  return <div onChangeCapture={() => setDirty(true)} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p className="font-semibold">Materiales usados</p><p className="mt-1 text-xs text-ink-muted">Indica lo usado y lo desperdiciado. El sistema corrige el stock y el costo al guardar.</p><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-1">Insumo</th><th className="p-1">Plan</th><th className="p-1">Usado</th><th className="p-1">Merma</th></tr></thead><tbody>{Object.entries(plan).map(([id, quantity]) => { const item = items.find((entry) => entry.id === Number(id)); return <tr key={id}><td className="p-1 font-semibold">{item?.name ?? `#${id}`} {item?.unit ? `(${item.unit})` : ''}</td><td className="p-1">{quantity}</td><td className="p-1"><input aria-label={`Usado ${item?.name ?? id}`} type="number" min="0" step="0.01" className="w-24 rounded-lg border border-line bg-white p-2" value={consumed[id] ?? 0} disabled={!canOperate || disabled || saving || Boolean(waitingVersion)} onChange={(event) => setConsumed((current) => ({ ...current, [id]: Number(event.target.value) }))} /></td><td className="p-1"><input aria-label={`Merma ${item?.name ?? id}`} type="number" min="0" step="0.01" className="w-24 rounded-lg border border-line bg-white p-2" value={waste[id] ?? 0} disabled={!canOperate || disabled || saving || Boolean(waitingVersion)} onChange={(event) => setWaste((current) => ({ ...current, [id]: Number(event.target.value) }))} /></td></tr>; })}</tbody></table></div>{waitingVersion && <p role="status" className="mt-2 text-xs text-ink-muted">Materiales guardados. Actualizando los datos confirmados...</p>}{conflict && <p role="alert" className="mt-2 text-xs text-red-700">Otra persona actualizó los materiales. Conservamos tus cantidades; recarga antes de guardar.</p>}{dirty && <Button size="sm" variant="ghost" disabled={saving || Boolean(waitingVersion)} onClick={() => setDirty(false)}>Descartar cambios y recargar</Button>}{error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}{canOperate && <Button size="sm" className="mt-2" disabled={disabled || saving || conflict || Boolean(waitingVersion) || !dirty} isLoading={saving} onClick={() => void save()}>Guardar materiales</Button>}</div>;
};
