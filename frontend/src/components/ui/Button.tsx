import type { ElementType, ReactNode } from 'react';
import MuiButton, { type ButtonProps as MuiButtonProps } from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { cn } from '@lib/cn';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<MuiButtonProps, 'variant' | 'size' | 'color' | 'startIcon'> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  component?: ElementType;
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

const HEIGHTS: Record<Size, number> = { sm: 36, md: 44, lg: 48 };

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
      startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : leftIcon}
      className={cn('transition-all duration-200', className)}
      sx={{
        minHeight: HEIGHTS[size], px: size === 'lg' ? 3 : size === 'sm' ? 1.5 : 2.5,
        fontSize: size === 'lg' ? 16 : 14, whiteSpace: 'nowrap',
        ...(variant === 'outline' && { borderColor: 'divider', bgcolor: 'background.paper' }),
        ...(variant === 'ghost' && { color: 'text.secondary' }),
        '&:hover': { transform: 'translateY(-1px)' },
        '&.Mui-disabled': { transform: 'none' },
        ...sx,
      }}
      {...props}
    >
      {children}
    </MuiButton>
  );
};
