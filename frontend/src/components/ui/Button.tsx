import type { ElementType, ReactNode } from 'react';
import MuiButton, { type ButtonProps as MuiButtonProps } from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<MuiButtonProps, 'variant' | 'size' | 'color' | 'startIcon'> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  component?: ElementType;
  to?: string;
  state?: unknown;
  target?: string;
  rel?: string;
}

const VARIANTS: Record<Variant, { mui: MuiButtonProps['variant']; color: MuiButtonProps['color'] }> = {
  primary: { mui: 'contained', color: 'primary' },
  secondary: { mui: 'contained', color: 'secondary' },
  outline: { mui: 'outlined', color: 'inherit' },
  ghost: { mui: 'text', color: 'inherit' },
  danger: { mui: 'contained', color: 'error' },
};

/**
 * ESCALA UNICA DE ALTURAS DEL PRODUCTO (px).
 *
 * Anclada en el tema de MUI para que no haya dos verdades: `sm` es el `minHeight`
 * del MuiButton base (lo que mide cualquier boton crudo de MUI), `lg` es su
 * `sizeLarge`, y `md` es el paso tactil de 44 que exige el recorrido de compra.
 * Antes aqui vivia 36/44/48 y en el tema 40, asi que en /menu convivian tres
 * alturas distintas en la misma fila.
 *
 * Se exporta a proposito: cualquier control que tenga que medir contra un boton
 * (pills del header, cajas de iconos, campos en linea) debe importar esto en vez
 * de repetir los numeros.
 */
export const BUTTON_HEIGHT: Record<Size, number> = { sm: 40, md: 44, lg: 48 };

/** Boton de producto: API propia, comportamiento y accesibilidad de MUI. */
export const Button = ({
  variant = 'primary', size = 'md', isLoading = false, leftIcon,
  className, children, disabled, sx, ...props
}: ButtonProps) => {
  const style = VARIANTS[variant];

  return (
    <MuiButton
      variant={style.mui}
      color={style.color}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : leftIcon}
      className={className}
      sx={{
        minHeight: BUTTON_HEIGHT[size], px: size === 'lg' ? 3 : size === 'sm' ? 1.5 : 2.5,
        fontSize: size === 'lg' ? 16 : 14, whiteSpace: 'nowrap',
        // Explicita porque la del tema no cubre color ni borde: sin ellas el paso
        // a disabled y el cambio de borde del outline eran un corte seco.
        transition: 'background-color var(--duration-base) var(--ease-standard), border-color var(--duration-base) var(--ease-standard), color var(--duration-base) var(--ease-standard), box-shadow var(--duration-base) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)',
        ...(variant === 'outline' && { borderColor: 'divider', bgcolor: 'background.paper' }),
        ...(variant === 'ghost' && { color: 'text.secondary' }),
        // Un solo anillo de foco en todo el producto: el de :focus-visible de
        // styles/index.css. El tema pinta uno propio de 3px mas claro solo para
        // botones, asi que hay que reponer el global aqui para que gane.
        '&:focus-visible': { outline: '2px solid var(--color-brand-600)', outlineOffset: '2px' },
        // El levantamiento solo donde hay puntero: en tactil el :hover se queda
        // pegado tras el toque y el boton daba un salto al pulsarlo.
        '@media (hover: hover)': {
          '&:hover': { transform: 'translateY(-1px)' },
          '&:active': { transform: 'translateY(0)' },
        },
        '&.Mui-disabled': { transform: 'none', boxShadow: 'none' },
        ...sx,
      }}
      {...props}
    >
      {children}
    </MuiButton>
  );
};
