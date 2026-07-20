import { useId, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { LayoutPanelTop, X, type LucideIcon } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  icon?: LucideIcon;
  eyebrow?: string;
}

/** Diálogo personalizado con foco, teclado, portal y bloqueo de scroll provistos por MUI. */
export const Modal = ({ isOpen, onClose, title, description, children, maxWidth = 'sm', icon: Icon = LayoutPanelTop, eyebrow }: ModalProps) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const generatedId = useId().replace(/:/g, '');
  const titleId = `app-dialog-title-${generatedId}`;
  const descriptionId = `app-dialog-description-${generatedId}`;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullWidth
      fullScreen={fullScreen}
      maxWidth={maxWidth}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      sx={{
        '& .MuiDialog-paper': {
          overflow: 'hidden',
          border: { xs: 0, sm: '1px solid' },
          borderColor: 'divider',
          borderRadius: { xs: 0, sm: 4.5 },
          boxShadow: '0 32px 90px rgba(13, 45, 28, .22)',
          maxHeight: { xs: '100%', sm: 'calc(100% - 48px)' },
        },
        '& .MuiBackdrop-root': { backgroundColor: 'rgba(9, 25, 16, .62)', backdropFilter: 'blur(5px)' },
      }}
    >
      <DialogTitle
        id={titleId}
        sx={{
          position: 'relative',
          borderBottom: '1px solid',
          borderColor: 'divider',
          background: 'linear-gradient(135deg, rgba(237,249,242,.95), rgba(255,255,255,.98))',
          px: { xs: 2.25, sm: 3.25 },
          py: { xs: 2, sm: 2.5 },
          pr: 7,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
          <Box sx={{ mt: .15, display: 'grid', width: 40, height: 40, flexShrink: 0, placeItems: 'center', borderRadius: 2.5, bgcolor: 'primary.main', color: 'primary.contrastText', boxShadow: '0 8px 22px rgba(33,131,90,.22)' }}>
            <Icon size={19} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            {eyebrow && <Typography component="p" variant="overline" color="primary.main" sx={{ lineHeight: 1.25, fontWeight: 800, letterSpacing: '.11em' }}>{eyebrow}</Typography>}
            <Typography component="span" variant="h6" sx={{ display: 'block', fontWeight: 850, lineHeight: 1.3 }}>
              {title}
            </Typography>
            {description && (
              <Typography id={descriptionId} component="p" variant="body2" color="text.secondary" sx={{ mt: .5, maxWidth: 720, lineHeight: 1.55 }}>
                {description}
              </Typography>
            )}
          </Box>
        </Box>
        <IconButton aria-label="Cerrar" onClick={onClose} sx={{ position: 'absolute', right: 14, top: 14 }}>
          <X size={19} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ maxHeight: { xs: 'none', sm: '78vh' }, overflowY: 'auto', bgcolor: '#f7faf8', px: { xs: 2, sm: 3 }, py: { xs: 2.25, sm: 3 } }}>
        <Box className="app-modal-body" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3.25, bgcolor: 'background.paper', p: { xs: 2, sm: 2.5 }, boxShadow: '0 8px 28px rgba(20, 55, 37, .045)' }}>
          {children}
        </Box>
      </DialogContent>
    </Dialog>
  );
};
