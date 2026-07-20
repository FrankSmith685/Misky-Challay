import { Link } from 'react-router-dom';
import { Box, Paper, Typography } from '@mui/material';
import { Leaf } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';

const NotFoundPage = () => (
  <Box sx={{ display: 'grid', minHeight: '65vh', placeItems: 'center', px: 2, py: 8 }}>
    <Paper variant="outlined" sx={{ position: 'relative', width: '100%', maxWidth: 560, overflow: 'hidden', p: { xs: 4, sm: 7 }, textAlign: 'center', borderRadius: 5, boxShadow: '0 24px 70px rgba(20,60,40,.09)' }}>
      <Box sx={{ display: 'grid', width: 56, height: 56, mx: 'auto', placeItems: 'center', borderRadius: 3, bgcolor: 'primary.50', color: 'primary.main' }}><Leaf size={27} /></Box>
      <Typography sx={{ mt: 2, color: 'primary.main', fontSize: { xs: 48, sm: 64 }, fontWeight: 850, lineHeight: 1 }}>404</Typography>
      <Typography component="h1" variant="h5" sx={{ mt: 2 }}>No encontramos esta página</Typography>
      <Typography color="text.secondary" sx={{ mt: 1.25, mb: 3.5 }}>Puede que el enlace haya cambiado o que el plato ya no esté en el menú.</Typography>
      <Link to={ROUTES.home}><Button>Volver al inicio</Button></Link>
    </Paper>
  </Box>
);

export default NotFoundPage;
