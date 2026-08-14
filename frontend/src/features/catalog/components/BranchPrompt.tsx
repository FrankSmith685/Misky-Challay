import { MapPin, Navigation } from 'lucide-react';
import { Button } from '@components/ui/Button';

interface BranchPromptProps {
  onChooseLocation: () => void;
}

/** Solicita ubicación sin bloquear la exploración y explica por qué mejora el resultado. */
export const BranchPrompt = ({ onChooseLocation }: BranchPromptProps) => (
  <aside className="relative flex flex-col gap-4 overflow-hidden rounded-card border border-accent-400/35 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
    <span className="absolute inset-y-0 left-0 w-1 bg-accent-500" aria-hidden="true" />
    <div className="flex items-start gap-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-card bg-accent-400/10 text-accent-500">
        <MapPin className="size-4.5" aria-hidden="true" />
      </span>
      <div>
        <p className="font-extrabold text-ink">Confirma qué cocina puede atenderte</p>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-ink-muted">Puedes explorar ahora. Con tu dirección confirmaremos disponibilidad, cobertura y tiempo estimado.</p>
      </div>
    </div>
    <Button variant="outline" onClick={onChooseLocation} leftIcon={<Navigation className="size-4 text-accent-500" />} className="w-full shrink-0 border-accent-400/40 bg-white sm:w-auto">Elegir dirección</Button>
  </aside>
);
