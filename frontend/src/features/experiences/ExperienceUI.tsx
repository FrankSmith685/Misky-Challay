import type { ReactNode } from 'react';
import { Check, Circle, type LucideIcon } from 'lucide-react';
import { EXPERIENCE_LABELS } from './experiences.service';
import './experiences.css';

export function ExperienceStatus({ status, active }: { status?: string; active?: boolean }) {
  const value = status ?? (active ? 'PUBLISHED' : 'DRAFT');
  const tone = ['PUBLISHED', 'APPROVED'].includes(value)
    ? 'success'
    : ['AWAITING_APPROVAL', 'PAUSED', 'EXPIRED'].includes(value)
      ? 'warning'
      : 'neutral';
  return (
    <span className={`exp-status exp-status--${tone}`}>
      <span aria-hidden="true" />
      {status ? (EXPERIENCE_LABELS[value] ?? value) : active ? 'Activo' : 'Borrador'}
    </span>
  );
}

export function ExperiencePanel({
  icon: Icon,
  title,
  description,
  children,
  action,
  className = '',
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`exp-panel ${className}`}>
      <header className="exp-panel__header">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="exp-icon">
              <Icon size={18} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-ink">{title}</h3>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{description}</p>
            )}
          </div>
        </div>
        {action}
      </header>
      <div className="exp-panel__body">{children}</div>
    </section>
  );
}

export function ExperienceEmpty({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="exp-empty">
      <span className="exp-empty__icon">
        <Icon size={27} strokeWidth={1.4} aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-lg font-extrabold text-ink">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function ExperienceProgress({ status }: { status: string }) {
  const current =
    (
      {
        DRAFT: 0,
        IN_PROGRESS: 0,
        AWAITING_APPROVAL: 1,
        APPROVED: 2,
        PUBLISHED: 3,
        PAUSED: 3,
        EXPIRED: 3,
      } as Record<string, number>
    )[status] ?? 0;
  return (
    <ol className="exp-progress" aria-label="Etapas de la experiencia">
      {['Creación', 'Revisión', 'Aprobación', 'Publicación'].map((label, index) => (
        <li
          key={label}
          className={index <= current ? 'is-active' : ''}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className="exp-progress__number">
            {index < current ? (
              <Check size={13} aria-hidden="true" />
            ) : index === current ? (
              <Circle size={10} fill="currentColor" aria-hidden="true" />
            ) : (
              index + 1
            )}
          </span>
          <span>{label}</span>
        </li>
      ))}
    </ol>
  );
}
