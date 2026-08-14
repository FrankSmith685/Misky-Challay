import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Box, Stack, Typography } from '@mui/material';
import { cn } from '@lib/cn';
import { Breadcrumbs, type Crumb } from '@components/ui/Breadcrumbs';

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  /** Migas de pan opcionales, encima del título. */
  crumbs?: Crumb[];
  className?: string;
}

/** Encabezado coherente para pantallas de contenido y operación (con migas opcionales). */
export const PageHeader = ({ eyebrow, title, description, icon: Icon, action, crumbs, className }: PageHeaderProps) => (
  <Box
    component="header"
    className={cn('mb-7', className)}
    sx={{
      display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2,
      alignItems: { sm: 'flex-end' }, justifyContent: 'space-between',
      pb: 2.5, borderBottom: 1, borderColor: 'divider',
    }}
  >
    <Box sx={{ minWidth: 0 }}>
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} className="mb-3" />}
      {eyebrow && (
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: .75, mb: 1, px: 1.25, py: .55, borderRadius: 'var(--radius-pill)', bgcolor: 'primary.50', color: 'primary.dark' }}>
          {Icon && <Icon size={14} />}
          <Typography component="span" sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' }}>{eyebrow}</Typography>
        </Box>
      )}
      <Typography component="h1" variant="h4" sx={{ fontSize: { xs: 25, sm: 32 } }}>{title}</Typography>
      {description && <Typography color="text.secondary" sx={{ mt: .75, maxWidth: 720, fontSize: { xs: 14, sm: 15 } }}>{description}</Typography>}
    </Box>
    {/* `spacing` explicito: con `useFlexGap` y sin el, el gap es 0 y las pantallas
        que pasan varios hijos sueltos (Inventario, Cobertura) montaban sus botones
        pegados uno contra otro. `alignItems` los centra cuando la fila envuelve. */}
    {action && <Stack direction="row" spacing={1.5} useFlexGap sx={{ alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', '& > *': { flexShrink: 0 } }}>{action}</Stack>}
  </Box>
);
