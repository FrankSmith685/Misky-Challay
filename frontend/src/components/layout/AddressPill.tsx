import type { SxProps, Theme } from '@mui/material';
import { Box, Button } from '@mui/material';
import { MapPin, Store } from 'lucide-react';
import type { DeliveryType } from '@context/AppStateContext';

interface AddressPillProps {
  label?: string | null;
  deliveryType: DeliveryType;
  onClick: () => void;
  sx?: SxProps<Theme>;
}

/**
 * Selector de dirección compacto para el header. Cuando no hay dirección, entra en
 * estado "attention" (resaltado cálido) para invitar a elegirla.
 *
 * Por debajo de 600px se queda en el icono, pero NO desaparece: es el dato que
 * refiltra el catálogo y decide el costo de envío, y el estado de atención (fondo
 * y borde cálidos) se conserva igual que en escritorio. El texto completo sigue
 * disponible en el drawer y en el nombre accesible del botón.
 */
export const AddressPill = ({ label, deliveryType, onClick, sx }: AddressPillProps) => {
  const attention = !label;
  const isPickup = deliveryType === 'PICKUP';
  const fallback = isPickup ? 'Elige un local' : 'Elige tu dirección';

  return (
    <Button
      onClick={onClick}
      variant="outlined"
      startIcon={isPickup ? <Store size={16} /> : <MapPin size={16} />}
      aria-label={
        label
          ? `${isPickup ? 'Local de recojo' : 'Dirección de entrega'}: ${label}. Cambiar`
          : isPickup
            ? 'Elige un local de recojo'
            : 'Elige tu dirección de entrega'
      }
      sx={{
        maxWidth: { xs: 44, sm: 200 },
        // 44px es el paso `md` de components/ui/Button y el minimo tactil del icono solo.
        minWidth: 44,
        minHeight: 44,
        px: { xs: 0, sm: 1.75 },
        color: attention ? 'secondary.dark' : 'text.secondary',
        borderColor: attention ? 'secondary.main' : 'divider',
        // Desde la rampa, no un rgba fijo: si el negocio cambia el acento en el
        // editor de tema, el estado de atencion lo sigue.
        bgcolor: attention ? 'secondary.50' : 'transparent',
        '& .MuiButton-startIcon': {
          mr: { xs: 0, sm: 0.75 },
          ml: 0,
          color: attention ? 'secondary.main' : 'inherit',
        },
        ...sx,
      }}
    >
      <Box
        component="span"
        sx={{ display: { xs: 'none', sm: 'block' }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {label ?? fallback}
      </Box>
    </Button>
  );
};
