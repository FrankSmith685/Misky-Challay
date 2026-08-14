import type { LucideIcon } from 'lucide-react';
import { Bike, ChefHat, Check, MapPinned, ShoppingBag, Store } from 'lucide-react';
import { Card } from '@components/ui/Card';
import { cn } from '@lib/cn';

export type OperationStage = 'orders' | 'kitchen' | 'delivery';

interface OperationFlowGuideProps {
  stage: OperationStage;
  branchName?: string | null;
  className?: string;
}

interface FlowStep {
  id: OperationStage | 'routing';
  title: string;
  description: string;
  icon: LucideIcon;
}

const STEPS: FlowStep[] = [
  {
    id: 'orders',
    title: '1. Pedido confirmado',
    description: 'Pago validado, datos de contacto y productos congelados.',
    icon: ShoppingBag,
  },
  {
    id: 'routing',
    title: '2. Cocina asignada',
    description: 'Cobertura, cercania, horario y carga deciden la sede.',
    icon: MapPinned,
  },
  {
    id: 'kitchen',
    title: '3. Preparacion',
    description: 'La cocina acepta, prepara y marca el pedido como listo.',
    icon: ChefHat,
  },
  {
    id: 'delivery',
    title: '4. Entrega o recojo',
    description: 'Se asigna repartidor o se entrega en el mostrador.',
    icon: Bike,
  },
];

const stageIndex = (stage: OperationStage): number => {
  if (stage === 'orders') return 0;
  if (stage === 'kitchen') return 2;
  return 3;
};

/**
 * Explica el mismo flujo en las tres estaciones operativas. No es decorativo:
 * deja visible por que un pedido aparece en una cocina y quien debe actuar luego.
 */
export const OperationFlowGuide = ({ stage, branchName, className }: OperationFlowGuideProps) => {
  const currentIndex = stageIndex(stage);

  return (
    <Card className={cn('mb-5 overflow-hidden p-0', className)} shadow="e1">
      <div className="flex flex-col gap-2 border-b border-line bg-gradient-to-r from-brand-50 to-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-ink">Ruta operativa del pedido</p>
          <p className="text-xs text-ink-muted">Cada rol ve la etapa que le corresponde y la misma sucursal de origen.</p>
        </div>
        {branchName && (
          <p className="flex shrink-0 items-center gap-1.5 rounded-field border border-brand-200 bg-surface px-2.5 py-1.5 text-xs font-semibold text-brand-800">
            <Store className="size-3.5" />
            Operando: {branchName}
          </p>
        )}
      </div>

      <ol className="grid sm:grid-cols-2 xl:grid-cols-4" aria-label="Flujo operativo del pedido">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isCurrent = index === currentIndex;
          const isComplete = index < currentIndex;

          return (
            <li
              key={step.id}
              aria-current={isCurrent ? 'step' : undefined}
              className={cn(
                'relative flex gap-3 border-b border-line p-4 last:border-b-0 sm:[&:nth-child(odd)]:border-r xl:border-b-0 xl:border-r xl:last:border-r-0',
                isCurrent && 'bg-brand-50/70',
              )}
            >
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-field border',
                  isCurrent && 'border-brand-600 bg-brand-600 text-white',
                  isComplete && 'border-brand-200 bg-brand-100 text-brand-700',
                  !isCurrent && !isComplete && 'border-line bg-surface-muted text-ink-muted',
                )}
              >
                {isComplete ? <Check className="size-4" /> : <Icon className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className={cn('text-sm font-bold', isCurrent ? 'text-brand-800' : 'text-ink')}>{step.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
};

