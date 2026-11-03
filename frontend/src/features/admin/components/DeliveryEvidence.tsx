import { useEffect, useState } from 'react';
import { Camera } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { api, getApiErrorMessage } from '@services/api/client';
import { prepareCakeReference } from '@features/cakes/utils/prepareCakeReference';
import toast from '@components/mui/MuiToast';

export function DeliveryEvidence({ deliveryId, status, evidence = [], canUpload, onSaved }: {
  deliveryId: number; status: string; evidence?: string[]; canUpload: boolean; onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview); }, [preview]);
  const stage = ['ASSIGNED', 'PICKED_UP'].includes(status) ? 'DEPARTURE' : status === 'ON_ROUTE' ? 'ARRIVAL' : null;
  return <div className="space-y-3 border-t border-line pt-3">
    <p className="flex items-center gap-2 text-xs font-semibold text-ink-muted"><Camera className="size-4" /> Fotos del traslado (opcionales)</p>
    <div className="flex flex-wrap gap-2">
      {canUpload && stage && <label className="inline-flex min-h-11 cursor-pointer items-center rounded-field border border-line px-3 py-2 text-xs font-medium text-ink">
        {busy ? 'Guardando foto…' : stage === 'DEPARTURE' ? 'Adjuntar foto de salida' : 'Adjuntar foto de entrega'}
        <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={busy} aria-label={stage === 'DEPARTURE' ? 'Foto de salida' : 'Foto de entrega'} onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
          setBusy(true); try {
            const dataUrl = await prepareCakeReference(file);
            await api.put(`/delivery/${deliveryId}/evidence/${stage}`, { dataUrl });
            setPreview(dataUrl); toast.success('Foto guardada'); onSaved?.();
          } catch (error) { toast.error(getApiErrorMessage(error)); } finally { setBusy(false); }
        }} />
      </label>}
      {evidence.map((savedStage) => <Button key={savedStage} variant="outline" size="sm" disabled={busy} onClick={async () => {
        setBusy(true); try { const { data } = await api.get(`/delivery/${deliveryId}/evidence/${savedStage}`, { responseType: 'blob' }); setPreview(URL.createObjectURL(data)); }
        catch (error) { toast.error(getApiErrorMessage(error)); } finally { setBusy(false); }
      }}>Ver foto de {savedStage === 'DEPARTURE' ? 'salida' : 'entrega'}</Button>)}
    </div>
    {preview && <div className="space-y-2"><img src={preview} alt="Evidencia del estado de la torta durante el traslado" className="max-h-52 w-full rounded-field object-contain" /><Button variant="ghost" size="sm" onClick={() => setPreview(null)}>Cerrar foto</Button></div>}
  </div>;
}
