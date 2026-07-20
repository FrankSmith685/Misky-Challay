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
 * Tabla con el estilo de Verde Bowl (borde, cabecera tenue, filas separadas).
 * Uso: <Table><Thead>...<Th/></Thead><Tbody><Tr><Td/></Tr></Tbody></Table>
 * La Table ya incluye el contenedor con scroll horizontal.
 */
export const Table = ({ className, ...props }: ComponentProps<typeof MuiTable>) => (
  <TableContainer component={Paper} variant="outlined">
    <MuiTable className={cn('w-full text-sm', className)} {...props} />
  </TableContainer>
);

export const Thead = ({ className, ...props }: ComponentProps<typeof TableHead>) => (
  <TableHead className={className} {...props} />
);

export const Tbody = (props: ComponentProps<typeof TableBody>) => <TableBody {...props} />;

export const Tr = ({ className, ...props }: ComponentProps<typeof TableRow>) => (
  <TableRow className={className} {...props} />
);

export const Th = ({ className, ...props }: ComponentProps<typeof TableCell>) => (
  <TableCell component="th" className={cn('font-medium', className)} {...props} />
);

export const Td = ({ className, ...props }: ComponentProps<typeof TableCell>) => (
  <TableCell className={cn('text-ink', className)} {...props} />
);
