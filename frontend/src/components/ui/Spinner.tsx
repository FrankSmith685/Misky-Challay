import { Loader2 } from 'lucide-react';
import { cn } from '@lib/cn';

type SpinnerSize = 'sm' | 'md' | 'lg';

const SIZES: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
};

/** Indicador de carga circular, en el verde de marca. */
export const Spinner = ({ size = 'md', className }: { size?: SpinnerSize; className?: string }) => (
  <Loader2 className={cn('animate-spin text-brand-600', SIZES[size], className)} aria-hidden="true" />
);
