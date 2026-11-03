import { useState } from 'react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { Textarea } from '@components/ui/Textarea';
import { getApiErrorMessage } from '@services/api/client';
import { cakesApi, type DesignRequest } from '../cakes.service';

export const DesignRequestDetailsEditor = ({ request, onClose, onSaved }: {
  request: DesignRequest;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) => {
  const [description, setDescription] = useState(request.description);
  const [flavor, setFlavor] = useState(request.brief?.flavor ?? '');
  const [filling, setFilling] = useState(request.brief?.filling ?? '');
  const [message, setMessage] = useState(request.brief?.message ?? '');
  const [notes, setNotes] = useState(request.brief?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (description.trim().length < 10 || flavor.trim().length < 2 || filling.trim().length < 2) {
      setError('Describe el diseño e indica sabor y relleno antes de guardar.'); return;
    }
    setBusy(true); setError('');
    try {
      await cakesApi.updatePendingDesign(request.id, { description: description.trim(), flavor: flavor.trim(), filling: filling.trim(), message: message.trim(), notes: notes.trim() });
      toast.success('Los detalles de tu diseño se actualizaron.');
      await onSaved();
      onClose();
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(false); }
  };

  return <Modal isOpen onClose={onClose} disableBackdropClose maxWidth="md" title={`Completar solicitud #${request.id}`} description="Puedes precisar los detalles mientras el equipo aún no haya enviado una cotización." actions={<><Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button onClick={() => void save()} isLoading={busy}>Guardar detalles</Button></>}>
    <div className="space-y-4">
      {request.themeSnapshotJson && <p className="rounded-xl border border-brand-100 bg-brand-50 p-3 text-sm"><strong>Modelo elegido:</strong> {request.themeSnapshotJson.name}. Su imagen permanece vinculada a esta solicitud.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Sabor del bizcocho" required minLength={2} maxLength={80} value={flavor} onChange={(event) => setFlavor(event.target.value)} placeholder="Ej. vainilla" disabled={busy} />
        <Input label="Relleno" required minLength={2} maxLength={80} value={filling} onChange={(event) => setFilling(event.target.value)} placeholder="Ej. fudge casero" disabled={busy} />
      </div>
      <Textarea label="Cómo quieres el diseño" required minLength={10} maxLength={4000} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} hint="Indica colores, forma, flores u otros acabados. Si lo quieres igual al modelo, dilo expresamente." disabled={busy} />
      <Input label="Texto en la torta (opcional)" maxLength={160} value={message} onChange={(event) => setMessage(event.target.value)} disabled={busy} />
      <Textarea label="Otras indicaciones (opcional)" maxLength={1200} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} />
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>
  </Modal>;
};
