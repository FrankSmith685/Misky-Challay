import { Link } from 'react-router-dom';
import { Box, Container, Divider, IconButton, Link as MuiLink, Stack, Typography } from '@mui/material';
import { Clock3, Instagram, Mail, MapPin, ShieldCheck, Truck } from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { AppLogo } from '@components/common/AppLogo';
import { useBusinessInfo } from '@services/businessInfo';

const DISCOVER = [
  { label: 'Menú', to: ROUTES.menu },
  { label: 'Arma tu bowl', to: ROUTES.builder },
  { label: 'Planes y saldo', to: ROUTES.plans },
  { label: 'Cobertura', to: ROUTES.coverage },
];

const LEGAL = [
  { label: 'Política de Privacidad', to: ROUTES.privacy },
  { label: 'Términos y Condiciones', to: ROUTES.terms },
  { label: 'Libro de Reclamaciones', to: ROUTES.complaints },
];

const TRUST = [
  { icon: Truck, title: 'Entrega coordinada', text: 'Elige tu zona y horario.' },
  { icon: ShieldCheck, title: 'Compra protegida', text: 'Tus datos siempre seguros.' },
  { icon: Clock3, title: 'Preparación fresca', text: 'Hecho para cada pedido.' },
];

export const Footer = () => {
  const business = useBusinessInfo();

  return (
  <Box component="footer" sx={{ mt: 'auto', bgcolor: '#123b2b', color: 'common.white' }}>
    <Box sx={{ borderBottom: '1px solid rgba(255,255,255,.10)', bgcolor: 'rgba(255,255,255,.035)' }}>
      <Container maxWidth="xl">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,1fr)' }, py: 2.5 }}>
          {TRUST.map(({ icon: Icon, title, text }, index) => (
            <Stack
              key={title}
              direction="row"
              spacing={1.5}
              sx={{ px: { xs: 0, sm: 2.5 }, py: { xs: 1.25, sm: 0 }, borderLeft: { sm: index ? '1px solid rgba(255,255,255,.10)' : 0 }, alignItems: 'center' }}
            >
              <Box sx={{ display: 'grid', width: 38, height: 38, placeItems: 'center', borderRadius: 2.5, bgcolor: 'rgba(255,255,255,.09)', color: '#9ed6b4' }}>
                <Icon size={18} />
              </Box>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 750 }}>{title}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.62)' }}>{text}</Typography>
              </Box>
            </Stack>
          ))}
        </Box>
      </Container>
    </Box>

    <Container maxWidth="xl" sx={{ py: { xs: 6, md: 8 } }}>
      <Box sx={{ display: 'grid', gap: { xs: 5, md: 6 }, gridTemplateColumns: { xs: '1fr', sm: '1.4fr .8fr .9fr', md: '1.6fr .7fr .8fr 1fr' } }}>
        <Box>
          <AppLogo inverse />
          <Typography variant="body2" sx={{ mt: 2.5, maxWidth: 380, color: 'rgba(255,255,255,.68)', lineHeight: 1.8 }}>
            Bowls frescos y personalizables, nutrición transparente y una experiencia de compra diseñada alrededor de tu tiempo.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
            <IconButton aria-label="Instagram" sx={{ color: 'white', bgcolor: 'rgba(255,255,255,.08)' }}><Instagram size={18} /></IconButton>
            <IconButton component="a" href={`mailto:${business.email}`} aria-label="Enviar correo" sx={{ color: 'white', bgcolor: 'rgba(255,255,255,.08)' }}><Mail size={18} /></IconButton>
          </Stack>
        </Box>

        <Box component="nav" aria-label="Enlaces del pie">
          <Typography variant="overline" sx={{ color: '#9ed6b4', fontWeight: 800 }}>Descubre</Typography>
          <Stack spacing={1.4} sx={{ mt: 1.5 }}>
            {DISCOVER.map((item) => (
              <MuiLink key={item.to} component={Link} to={item.to} color="inherit" underline="hover" sx={{ width: 'fit-content', fontSize: 14, color: 'rgba(255,255,255,.75)' }}>
                {item.label}
              </MuiLink>
            ))}
          </Stack>
        </Box>

        <Box component="nav" aria-label="Enlaces legales">
          <Typography variant="overline" sx={{ color: '#9ed6b4', fontWeight: 800 }}>Legal</Typography>
          <Stack spacing={1.4} sx={{ mt: 1.5 }}>
            {LEGAL.map((item) => (
              <MuiLink key={item.to} component={Link} to={item.to} color="inherit" underline="hover" sx={{ width: 'fit-content', fontSize: 14, color: 'rgba(255,255,255,.75)' }}>
                {item.label}
              </MuiLink>
            ))}
          </Stack>
        </Box>

        <Box>
          <Typography variant="overline" sx={{ color: '#9ed6b4', fontWeight: 800 }}>Visítanos</Typography>
          <Stack spacing={1.75} sx={{ mt: 1.5, color: 'rgba(255,255,255,.72)' }}>
            <Stack direction="row" spacing={1.25}><MapPin size={18} /><Typography variant="body2">{business.address}</Typography></Stack>
            <Stack direction="row" spacing={1.25}><Mail size={18} /><MuiLink href={`mailto:${business.email}`} color="inherit" underline="hover" variant="body2">{business.email}</MuiLink></Stack>
            <Typography variant="caption" sx={{ pl: 3.75, color: 'rgba(255,255,255,.48)' }}>Atención todos los días</Typography>
          </Stack>
        </Box>
      </Box>

      <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,.10)' }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, color: 'rgba(255,255,255,.48)' }}>
        <Box>
          <Typography variant="caption" sx={{ display: 'block' }}>© {new Date().getFullYear()} {business.commercialName}. Hecho fresco en Lima.</Typography>
          {/* Datos del proveedor: obligatorios de cara al consumidor en Peru. */}
          <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.38)' }}>
            {business.legalName} · RUC {business.ruc}
          </Typography>
        </Box>
        <MuiLink component={Link} to={ROUTES.complaints} underline="hover" sx={{ color: 'rgba(255,255,255,.62)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <ShieldCheck size={15} /> Libro de Reclamaciones
        </MuiLink>
      </Stack>
    </Container>
  </Box>
  );
};
