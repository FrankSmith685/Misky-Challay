import { Check } from 'lucide-react';

interface CoverageProgressProps {
  steps: Array<{ label: string; ready: boolean }>;
}

/** Progreso compacto reutilizable para el verificador de dirección. */
export const CoverageProgress = ({ steps }: CoverageProgressProps) => {
  const completed = steps.filter((step) => step.ready).length;
  const percentage = Math.round((completed / steps.length) * 100);

  return (
    <div className="overflow-hidden rounded-card border border-brand-100 bg-white shadow-e2">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 sm:px-5">
        <p className="text-xs font-extrabold text-ink">Tu progreso</p>
        <p className="text-xs font-bold text-brand-700">
          {completed}/{steps.length} listo
        </p>
      </div>
      <div className="mx-4 mt-2 h-1.5 overflow-hidden rounded-pill bg-neutral-100 sm:mx-5">
        <div
          className="h-full rounded-pill bg-gradient-to-r from-brand-600 to-brand-400 transition-[width] duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-1 p-2.5 sm:gap-2 sm:p-3">
        {steps.map((step, index) => (
          <div
            key={step.label}
            className={`flex min-w-0 items-center gap-2 rounded-pill px-2 py-2 text-[11px] font-bold transition-colors sm:px-3 sm:text-xs ${
              step.ready ? 'bg-brand-50 text-brand-800' : 'text-ink-muted'
            }`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-pill ${
                step.ready ? 'bg-brand-700 text-white' : 'bg-neutral-100 text-ink-muted'
              }`}
            >
              {step.ready ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span className="truncate">{step.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
