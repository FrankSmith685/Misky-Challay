import { useId, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import MuiDrawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { X } from 'lucide-react';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: 'left' | 'right';
  children: ReactNode;
}

/** Panel lateral de producto sobre Drawer de MUI: portal, foco, Escape y backdrop incluidos. */
export const Drawer = ({ isOpen, onClose, title, description, side = 'right', children }: DrawerProps) => {
  const generatedId = useId().replace(/:/g, '');
  const titleId = `app-drawer-title-${generatedId}`;
  const descriptionId = `app-drawer-description-${generatedId}`;

  return (
    <MuiDrawer
      anchor={side}
      open={isOpen}
      onClose={onClose}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      ModalProps={{ keepMounted: true }}
      slotProps={{
        backdrop: {
          sx: { backgroundColor: 'rgba(28,10,28,.56)', backdropFilter: 'blur(4px)' },
        },
      }}
      sx={{
        '& .MuiDrawer-paper': {
          width: { xs: 'min(100vw, 380px)', sm: 420 },
          maxWidth: '100%',
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          px: { xs: 2.5, sm: 3 },
          py: { xs: 2.25, sm: 2.75 },
          borderBottom: '1px solid',
          borderColor: 'divider',
          background: 'linear-gradient(135deg, rgba(248,241,248,.95), rgba(255,255,255,.98))',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography id={titleId} variant="h6" component="h2" sx={{ fontWeight: 850 }}>
            {title}
          </Typography>
          {description && (
            <Typography
              id={descriptionId}
              variant="body2"
              color="text.secondary"
              sx={{ mt: .5, lineHeight: 1.55 }}
            >
              {description}
            </Typography>
          )}
        </Box>
        <IconButton aria-label="Cerrar panel" onClick={onClose} sx={{ mt: -.5, mr: -.75 }}>
          <X size={20} />
        </IconButton>
      </Box>

      {/* El panel llega al borde inferior de la pantalla: sin el safe-area su
          último control cae bajo el indicador de inicio del iPhone. */}
      <Box
        sx={{
          minHeight: 0,
          flex: 1,
          overflowY: 'auto',
          px: { xs: 2.5, sm: 3 },
          pt: { xs: 2.5, sm: 3 },
          pb: { xs: 'calc(20px + env(safe-area-inset-bottom, 0px))', sm: 'calc(24px + env(safe-area-inset-bottom, 0px))' },
        }}
      >
        {children}
      </Box>
    </MuiDrawer>
  );
};
