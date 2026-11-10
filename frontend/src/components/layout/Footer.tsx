import { Link } from 'react-router-dom';
import { Box, Container, Divider, IconButton, Link as MuiLink, Stack, Typography } from '@mui/material';
import { Clock3, Mail, MapPin, MessageCircle, Phone, ShieldCheck, Truck } from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { AppLogo } from '@components/common/AppLogo';
import { useBusinessInfo } from '@services/businessInfo';
import { whatsappLink } from '@lib/whatsapp';

const DISCOVER = [
  { label: 'Cómo hacer tu pedido', to: ROUTES.howToOrder },
  { label: 'Catálogo', to: ROUTES.menu },
  { label: 'Crea tu torta', to: ROUTES.menuMode('CUSTOM') },
  { label: 'Para empresas', to: ROUTES.business },
  { label: 'Zonas de entrega', to: ROUTES.coverage },
  { label: 'Experiencia AR', to: ROUTES.cakeAr },
];

const LEGAL = [
  { label: 'Política de Privacidad', to: ROUTES.privacy },
  { label: 'Términos y Condiciones', to: ROUTES.terms },
  { label: 'Política de Cookies', to: ROUTES.cookies },
  { label: 'Libro de Reclamaciones', to: ROUTES.complaints },
  // Google Play revisa que la baja de cuenta se alcance navegando el sitio, no
  // solo escribiendo la URL a mano.
  { label: 'Eliminar mi cuenta', to: ROUTES.deleteAccount },
];

const TRUST = [
  { icon: Truck, title: 'Entrega coordinada', text: 'Elige tu zona y horario.' },
  { icon: ShieldCheck, title: 'Compra protegida', text: 'Tus datos siempre seguros.' },
  { icon: Clock3, title: 'Preparación fresca', text: 'Hecho para cada pedido.' },
];

export const Footer = () => {
  const business = useBusinessInfo();
  const whatsapp = whatsappLink(business.whatsappPhone ?? business.phone, 'Hola, quisiera hacer una consulta a Misky Challay.');

  // El pie combina las tres tintas del logotipo y sigue los tokens gestionables.
  return (
  <Box component="footer" sx={{ mt: 'auto', color: 'common.white', background: 'linear-gradient(135deg, var(--color-brand-900) 0%, color-mix(in srgb, var(--color-brand-900) 72%, var(--color-tertiary-900)) 58%, var(--color-tertiary-900) 100%)' }}>
    <Box sx={{ height: 4, background: 'linear-gradient(90deg, var(--color-accent-500), var(--color-tertiary-600), var(--color-brand-500))' }} />
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
              <Box sx={{ display: 'grid', width: 38, height: 38, placeItems: 'center', borderRadius: 'var(--radius-card)', bgcolor: 'rgba(255,255,255,.09)', color: index === 1 ? 'secondary.300' : index === 2 ? 'tertiary.300' : 'primary.300' }}>
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
            Tortas, postres, turrones y bocaditos para compartir. Elige tu favorito y reserva una fecha disponible para tu entrega.
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
            {whatsapp && <IconButton component="a" href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Escríbenos por WhatsApp" sx={{ color: 'white', bgcolor: 'rgba(255,255,255,.08)' }}><MessageCircle size={18} /></IconButton>}
            <IconButton component="a" href={`mailto:${business.email}`} aria-label="Enviar correo" sx={{ color: 'white', bgcolor: 'rgba(255,255,255,.08)' }}><Mail size={18} /></IconButton>
          </Stack>
        </Box>

        <Box component="nav" aria-label="Enlaces del pie">
          <Typography variant="overline" sx={{ color: 'secondary.300', fontWeight: 800 }}>Descubre</Typography>
          <Stack spacing={1.4} sx={{ mt: 1.5 }}>
            {DISCOVER.map((item) => (
              <MuiLink key={item.to} component={Link} to={item.to} color="inherit" underline="hover" sx={{ width: 'fit-content', fontSize: 14, color: 'rgba(255,255,255,.75)' }}>
                {item.label}
              </MuiLink>
            ))}
          </Stack>
        </Box>

        <Box component="nav" aria-label="Enlaces legales">
          <Typography variant="overline" sx={{ color: 'tertiary.300', fontWeight: 800 }}>Legal</Typography>
          <Stack spacing={1.4} sx={{ mt: 1.5 }}>
            {LEGAL.map((item) => (
              <MuiLink key={item.to} component={Link} to={item.to} color="inherit" underline="hover" sx={{ width: 'fit-content', fontSize: 14, color: 'rgba(255,255,255,.75)' }}>
                {item.label}
              </MuiLink>
            ))}
          </Stack>
        </Box>

        <Box>
          <Typography variant="overline" sx={{ color: 'primary.300', fontWeight: 800 }}>Taller y contacto</Typography>
          <Stack spacing={1.75} sx={{ mt: 1.5, color: 'rgba(255,255,255,.72)' }}>
            <Stack direction="row" spacing={1.25}><MapPin size={18} /><Typography variant="body2">{business.address}</Typography></Stack>
            <Stack direction="row" spacing={1.25}><Mail size={18} /><MuiLink href={`mailto:${business.email}`} color="inherit" underline="hover" variant="body2">{business.email}</MuiLink></Stack>
            <Stack direction="row" spacing={1.25}><Phone size={18} /><MuiLink href={`tel:${business.phone.replace(/\s+/g, '')}`} color="inherit" underline="hover" variant="body2">{business.phone}</MuiLink></Stack>
            <Typography variant="caption" sx={{ pl: 3.75, color: 'rgba(255,255,255,.48)' }}>Consulta los horarios al elegir tu entrega o recojo.</Typography>
          </Stack>
        </Box>
      </Box>

      <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,.10)' }} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, color: 'rgba(255,255,255,.48)' }}>
        <Box>
          <Typography variant="caption" sx={{ display: 'block' }}>© {new Date().getFullYear()} {business.commercialName}. Hecho fresco en Lima.</Typography>
          {/* Datos del proveedor: obligatorios de cara al consumidor en Peru. */}
          <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,.38)' }}>
            {business.legalName}{business.ruc ? ` · RUC ${business.ruc}` : ''}
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
