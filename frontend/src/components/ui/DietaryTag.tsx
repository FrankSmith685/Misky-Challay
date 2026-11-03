import type { ReactNode } from 'react';
import { cn } from '@lib/cn';

/** Diccionario compartido código -> etiqueta legible (usado cuando no viene del backend). */
export const DIETARY_LABELS: Record<string, string> = {
  vegano: 'Vegano',
  vegetariano: 'Vegetariano',
  'sin-gluten': 'Sin gluten',
  'sin-azucar': 'Sin azúcar',
};

/** Etiqueta dietética individual, apariencia única en toda la app. */
export const DietaryTag = ({ label, className }: { label: ReactNode; className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-pill bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700',
      className,
    )}
  >
    {label}
  </span>
);

/** Acepta códigos (string) o items {code, name} del backend. */
type TagInput = string | { code: string; name?: string };

const tagCode = (tag: TagInput): string => (typeof tag === 'string' ? tag : tag.code);
const tagLabel = (tag: TagInput): string =>
  typeof tag === 'string'
    ? DIETARY_LABELS[tag] ?? tag
    : tag.name ?? DIETARY_LABELS[tag.code] ?? tag.code;

interface TagListProps {
  tags: TagInput[];
  /** Máximo de etiquetas a mostrar. */
  max?: number;
  className?: string;
}

/** Lista de etiquetas dietéticas con diccionario compartido y una sola apariencia. */
export const TagList = ({ tags, max, className }: TagListProps) => {
  const shown = max ? tags.slice(0, max) : tags;
  if (shown.length === 0) return null;

  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)}>
      {shown.map((tag) => (
        <li key={tagCode(tag)}>
          <DietaryTag label={tagLabel(tag)} />
        </li>
      ))}
    </ul>
  );
};
