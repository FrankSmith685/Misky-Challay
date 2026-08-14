import { Link } from 'react-router-dom';
import { Box, Paper, Typography } from '@mui/material';
import { Compass, Leaf } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';

/** Vive dentro de PublicLayout: un enlace roto compartido por WhatsApp aterriza con
 *  cabecera, carrito y pie, no en una tarjeta suelta sin salida. */
const NotFoundPage = () => (
  <Box sx={{ display: 'grid', minHeight: '65vh', placeItems: 'center', px: 2, py: 8 }}>
    <Paper variant="outlined" sx={{ position: 'relative', width: '100%', maxWidth: 560, overflow: 'hidden', p: { xs: 4, sm: 7 }, textAlign: 'center', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-e2)' }}>
      <Box sx={{ display: 'grid', width: 56, height: 56, mx: 'auto', placeItems: 'center', borderRadius: 'var(--radius-card)', bgcolor: 'primary.50', color: 'primary.main' }}><Leaf size={27} /></Box>
      <Typography sx={{ mt: 2, color: 'primary.main', fontSize: { xs: 48, sm: 64 }, fontWeight: 850, lineHeight: 1 }}>404</Typography>
      <Typography component="h1" variant="h5" sx={{ mt: 2 }}>No encontramos esta página</Typography>
      <Typography color="text.secondary" sx={{ mt: 1.25, mb: 3.5 }}>Puede que el enlace haya cambiado o que el plato ya no esté en el menú.</Typography>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.25, justifyContent: 'center' }}>
        <Button component={Link} to={ROUTES.menu} leftIcon={<Compass className="size-4" />}>Ver el menú</Button>
        <Button component={Link} to={ROUTES.home} variant="outline">Volver al inicio</Button>
      </Box>
    </Paper>
  </Box>
);

export default NotFoundPage;
