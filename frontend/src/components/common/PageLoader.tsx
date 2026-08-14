import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { Leaf } from 'lucide-react';

/**
 * Fallback de Suspense de TODAS las rutas: es lo que ve el cliente entre pantalla
 * y pantalla, asi que lleva la marca y no un spinner anonimo.
 *
 * El retardo de la animacion es intencionado: la mayoria de los chunks llegan en
 * menos de 200 ms y, sin el, cada navegacion daba un fogonazo de pantalla vacia.
 * Con `both` el bloque permanece invisible durante la espera corta y solo aparece
 * cuando la carga se nota de verdad. Va en el hijo y no en la raiz porque
 * `.public-shell main > *` de styles/index.css ya anima al hijo directo de <main>.
 */
export const PageLoader = () => (
  <Box sx={{ display: 'grid', minHeight: '52vh', placeItems: 'center', px: 3 }} role="status" aria-live="polite" aria-busy="true">
    <Stack
      spacing={2}
      sx={{ alignItems: 'center', animation: 'ds-fade-in 320ms var(--ease-standard) 200ms both' }}
    >
      <Box sx={{ position: 'relative', display: 'grid', width: 68, height: 68, placeItems: 'center' }}>
        <CircularProgress size={68} thickness={2.2} sx={{ position: 'absolute', color: 'primary.main', opacity: .3 }} />
        <Box
          sx={{
            display: 'grid',
            width: 44,
            height: 44,
            placeItems: 'center',
            borderRadius: 'var(--radius-card)',
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            boxShadow: 'var(--shadow-e1)',
          }}
        >
          <Leaf size={22} />
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary">Preparando tu experiencia…</Typography>
    </Stack>
  </Box>
);
