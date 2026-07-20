import type { HTMLAttributes } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { cn } from '@lib/cn';

export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <Paper
    component="div"
    variant="outlined"
    elevation={0}
    className={cn('rounded-card border-line bg-surface p-5 transition-[border-color,box-shadow,transform] duration-200', className)}
    sx={{ boxShadow: '0 1px 2px rgba(20,32,26,.025), 0 10px 30px rgba(20,32,26,.04)' }}
    {...props}
  />
);

export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <Box className={cn('mb-4 space-y-1', className)} {...props} />
);

export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <Typography component="h3" variant="h6" className={cn('text-lg font-semibold text-ink', className)} {...props} />
);

export const CardDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
  <Typography component="p" variant="body2" className={cn('text-sm text-ink-muted', className)} {...props} />
);
