import { BookmarkCheck } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { formatCurrency } from '@lib/format';

interface SaveBowlModalProps {
  isOpen: boolean;
  name: string;
  selectionCount: number;
  variantName?: string;
  total: number;
  isSaving: boolean;
  onNameChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
}

export const SaveBowlModal = ({
  isOpen,
  name,
  selectionCount,
  variantName,
  total,
  isSaving,
  onNameChange,
  onClose,
  onSave,
}: SaveBowlModalProps) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="Guarda tu combinación"
    description="La encontrarás aquí la próxima vez y podrás volver a pedirla con un toque."
    maxWidth="sm"
  >
    <div className="grid gap-5">
      <Input
        label="Nombre de tu bowl"
        value={name}
        onChange={(event) => onNameChange(event.target.value)}
        maxLength={80}
        autoFocus
      />
      <div className="rounded-card border border-line bg-surface-muted p-4 text-sm text-ink-muted">
        <p className="font-extrabold text-ink">Resumen</p>
        <p className="mt-1.5">
          {selectionCount} ingredientes · {variantName} · {formatCurrency(total)}
        </p>
      </div>
      <Button className="w-full" size="lg" isLoading={isSaving} disabled={!name.trim()} onClick={onSave}>
        <BookmarkCheck className="size-4" /> Guardar en favoritos
      </Button>
    </div>
  </Modal>
);
