import type { ComponentProps } from 'react';
import Paper from '@mui/material/Paper';
import MuiTable from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { cn } from '@lib/cn';

/**
 * Tabla con el estilo de Misky Challay (borde, cabecera tenue, filas separadas).
 * Uso: <Table caption="Pedidos del turno"><Thead>...<Th/></Thead><Tbody>...</Tbody></Table>
 * La Table ya incluye el contenedor con scroll horizontal.
 */
export const Table = ({
  className,
  caption,
  children,
  ...props
}: ComponentProps<typeof MuiTable> & { caption?: string }) => (
  <TableContainer
    component={Paper}
    variant="outlined"
    sx={{
      width: '100%',
      maxWidth: '100%',
      overflowX: 'auto',
      borderRadius: 'var(--radius-card)',
      borderColor: 'divider',
      boxShadow: 'var(--shadow-e1)',
    }}
  >
    <MuiTable className={cn('w-full text-sm', className)} stickyHeader {...props}>
      {/* Un lector de pantalla que aterriza en una tabla anuncia "tabla, 7 columnas"
        * y nada mas. El <caption> le da nombre; va oculto porque la pantalla ya
        * trae su propio titulo visible encima. Debe ser el PRIMER hijo de <table>. */}
      {caption && <caption className="sr-only">{caption}</caption>}
      {children}
    </MuiTable>
  </TableContainer>
);

export const Thead = ({ className, ...props }: ComponentProps<typeof TableHead>) => (
  <TableHead
    className={cn(
      '[&_.MuiTableCell-head]:border-line [&_.MuiTableCell-head]:bg-surface-muted [&_.MuiTableCell-head]:text-[11px] [&_.MuiTableCell-head]:font-extrabold [&_.MuiTableCell-head]:uppercase [&_.MuiTableCell-head]:tracking-[.08em] [&_.MuiTableCell-head]:text-ink-muted',
      className,
    )}
    {...props}
  />
);

export const Tbody = (props: ComponentProps<typeof TableBody>) => <TableBody {...props} />;

export const Tr = ({ className, ...props }: ComponentProps<typeof TableRow>) => (
  <TableRow
    className={cn('transition-colors hover:bg-brand-50/35 [&:last-child_td]:border-b-0', className)}
    {...props}
  />
);

/* `scope` por defecto a "col": sin el, la relacion entre celda y cabecera se
 * pierde y el lector de pantalla lee valores sueltos sin decir de que columna
 * son. Se puede pasar "row" para las tablas cuya primera celda es la etiqueta
 * de la fila. */
export const Th = ({ className, scope = 'col', ...props }: ComponentProps<typeof TableCell>) => (
  <TableCell component="th" scope={scope} className={cn('whitespace-nowrap px-4 py-3 font-medium', className)} {...props} />
);

export const Td = ({ className, ...props }: ComponentProps<typeof TableCell>) => (
  <TableCell className={cn('px-4 py-3.5 text-ink', className)} {...props} />
);
