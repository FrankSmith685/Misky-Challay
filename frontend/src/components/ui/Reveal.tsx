import { Children, type ReactNode } from 'react';
import { useScrollReveal } from '@hooks/useScrollReveal';
import { cn } from '@lib/cn';

interface RevealProps {
  children: ReactNode;
  /** Retraso en ms (para stagger). */
  delay?: number;
  /** Desplazamiento vertical inicial en px. */
  y?: number;
  className?: string;
}

/** Aparición suave (fade + subir) al entrar en el viewport. Solo transform/opacity. */
export const Reveal = ({ children, delay = 0, y = 16, className }: RevealProps) => {
  const { ref, visible } = useScrollReveal();

  return (
    <div
      ref={ref}
      className={cn('motion-reduce:!translate-y-0 motion-reduce:!opacity-100 motion-reduce:!transition-none', className)}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : `translateY(${y}px)`,
        transition: 'opacity 550ms ease-out, transform 550ms ease-out',
        transitionDelay: `${delay}ms`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
};

interface RevealGroupProps {
  children: ReactNode;
  /** Retraso incremental entre hijos, en ms. */
  stagger?: number;
  className?: string;
}

/**
 * Revela cada hijo en cascada. Renderiza un contenedor; úsalo como grid/flex
 * pasando las clases de layout en `className`.
 */
export const RevealGroup = ({ children, stagger = 80, className }: RevealGroupProps) => (
  <div className={className}>
    {Children.toArray(children).map((child, index) => (
      <Reveal key={index} delay={index * stagger}>
        {child}
      </Reveal>
    ))}
  </div>
);
