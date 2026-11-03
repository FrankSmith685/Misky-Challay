import { useId, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
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
  actions?: ReactNode;
  /** Cambia la lectura visual del encabezado sin obligar a cada pantalla a
   * reconstruir el dialogo. `danger` se reserva para acciones destructivas. */
  tone?: 'brand' | 'danger' | 'neutral';
  /** Foto, mini resumen o estado que ayuda a reconocer el elemento antes de
   * editarlo. En movil baja debajo del titulo para no comprimir el texto. */
  headerAside?: ReactNode;
  /**
   * Ignora el clic en el fondo. Por defecto `false` para no cambiarle el
   * comportamiento a nadie: se activa donde el modal contiene un formulario
   * largo, porque ahi un toque fuera se lleva quince campos sin preguntar.
   * La tecla Escape y la X siguen cerrando: bloquear tambien la salida por
   * teclado dejaria el dialogo sin escape accesible.
   */
  disableBackdropClose?: boolean;
}

/* Por debajo de 600px el diálogo va a pantalla completa, así que su último
 * elemento aterriza justo sobre el indicador de inicio del iPhone. `max()` deja
 * el relleno normal donde no hay recorte y lo sustituye por el del sistema donde
 * lo hay. Requiere `viewport-fit=cover` en el <meta viewport>. */
const SAFE_BOTTOM = 'max(20px, env(safe-area-inset-bottom, 0px))';
const SAFE_BOTTOM_PLUS = 'calc(20px + env(safe-area-inset-bottom, 0px))';

/** Diálogo personalizado con foco, teclado, portal y bloqueo de scroll provistos por MUI. */
export const Modal = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'sm',
  icon: Icon = LayoutPanelTop,
  eyebrow,
  actions,
  tone = 'brand',
  headerAside,
  disableBackdropClose = false,
}: ModalProps) => {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const generatedId = useId().replace(/:/g, '');
  const titleId = `app-dialog-title-${generatedId}`;
  const descriptionId = `app-dialog-description-${generatedId}`;
  const toneStyles = {
    brand: {
      background: 'linear-gradient(135deg, var(--color-brand-50), var(--color-surface-muted) 65%, var(--color-accent-50))',
      iconBg: 'primary.main',
      iconColor: 'primary.contrastText',
      accent: 'linear-gradient(90deg, var(--color-brand-700), var(--color-brand-400), var(--color-accent-400))',
    },
    danger: {
      background: 'linear-gradient(135deg, rgba(254,242,242,.98) 0%, rgba(255,255,255,.98) 62%, rgba(255,247,237,.92) 100%)',
      iconBg: 'error.main',
      iconColor: 'error.contrastText',
      accent: 'linear-gradient(90deg, #b91c1c, #ef4444, #fb923c)',
    },
    neutral: {
      background: 'linear-gradient(135deg, var(--color-surface-muted), var(--color-surface))',
      iconBg: 'text.primary',
      iconColor: 'background.paper',
      accent: 'linear-gradient(90deg, var(--color-ink), var(--color-brand-600), var(--color-accent-400))',
    },
  }[tone];

  /* MUI informa del MOTIVO del cierre y aqui se descartaba: `onClose` iba directo
   * al Dialog, asi que un clic fuera pesaba lo mismo que pulsar Cancelar. */
  const handleClose = (_event: unknown, reason: 'backdropClick' | 'escapeKeyDown') => {
    if (disableBackdropClose && reason === 'backdropClick') return;
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
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
          borderRadius: 'var(--radius-card)',
          // La sombra la pone el tema (MuiDialog): aqui vivia otra tinta verdosa
          // distinta de la escala, y eran dos verdades para la misma superficie.
          maxHeight: { xs: '100%', sm: 'calc(100% - 48px)' },
          boxShadow: 'var(--shadow-e5)',
        },
        '& .app-modal-body, & .app-modal-body > *': {
          minWidth: 0,
          maxWidth: '100%',
        },
        '& .MuiBackdrop-root': { backgroundColor: 'rgba(28, 10, 28, .62)', backdropFilter: 'blur(5px)' },
      }}
    >
      <DialogTitle
        id={titleId}
        sx={{
          position: 'relative',
          borderBottom: '1px solid',
          borderColor: 'divider',
          background: toneStyles.background,
          px: { xs: 2.25, sm: 3.25 },
          py: { xs: 2, sm: 2.5 },
          pr: { xs: 7, sm: 8 },
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 4,
            background: toneStyles.accent,
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            width: 150,
            height: 150,
            right: -52,
            top: -78,
            borderRadius: '50%',
            border: '24px solid rgba(255,255,255,.42)',
            pointerEvents: 'none',
          },
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ display: 'flex', minWidth: 0, alignItems: 'flex-start', gap: 1.5 }}>
          <Box sx={{ mt: .15, display: 'grid', width: 44, height: 44, flexShrink: 0, placeItems: 'center', borderRadius: 'var(--radius-card)', bgcolor: toneStyles.iconBg, color: toneStyles.iconColor, boxShadow: 'var(--shadow-e2)', border: '1px solid rgba(255,255,255,.5)' }}>
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
          {headerAside && (
            <Box sx={{ minWidth: 0, flexShrink: 0, pr: { sm: 1 } }}>
              {headerAside}
            </Box>
          )}
        </Box>
        <IconButton aria-label="Cerrar" onClick={onClose} sx={{ position: 'absolute', right: 14, top: 14 }}>
          <X size={19} />
        </IconButton>
      </DialogTitle>
      <DialogContent
        sx={{
          maxHeight: { xs: 'none', sm: '78vh' },
          overflowY: 'auto',
          // El gris de fondo es el del token, no un cuarto verdoso casi igual.
          backgroundColor: 'background.default',
          backgroundImage: 'radial-gradient(circle at 100% 0%, rgba(139,61,89,.035), transparent 30%), radial-gradient(circle at 0% 100%, rgba(245,158,11,.035), transparent 28%)',
          px: { xs: 2, sm: 3.5 },
          pt: { xs: 2.5, sm: 3.5 },
          // Con pie de acciones el safe-area lo pone el pie; sin él, el último
          // control del formulario es lo que queda bajo el indicador de inicio.
          pb: { xs: actions ? 2.5 : SAFE_BOTTOM_PLUS, sm: 3.5 },
        }}
      >
        <Box
          className="app-modal-body shadow-e2"
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 'var(--radius-card)',
            bgcolor: 'background.paper',
            p: { xs: 2.5, sm: 3.5 },
          }}
        >
          {children}
        </Box>
      </DialogContent>
      {/* El pie no scrollea con el contenido: en pantalla completa el CTA tiene que
          seguir alcanzable con el pulgar sin recorrer un formulario largo. */}
      {actions && (
        <DialogActions
          sx={{
            position: 'sticky',
            bottom: 0,
            zIndex: 1,
            flexShrink: 0,
            bgcolor: 'background.paper',
            borderTop: '1px solid',
            borderColor: 'divider',
            px: { xs: 2, sm: 3.5 },
            pt: { xs: 1.5, sm: 2 },
            pb: { xs: SAFE_BOTTOM, sm: '22px' },
            gap: 1.25,
            '& > :not(style)': { m: 0 },
            flexDirection: { xs: 'column-reverse', sm: 'row' },
            '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' }, minHeight: 44 },
          }}
        >
          {actions}
        </DialogActions>
      )}
    </Dialog>
  );
};
