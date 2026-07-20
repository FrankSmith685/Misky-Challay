import type { ReactNode } from 'react';
import {
  Box,
  Chip,
  Container,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { CheckCircle2, Leaf, ShieldCheck, Sparkles } from 'lucide-react';

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
};

const BENEFITS = [
  'Compra y revisa tus pedidos en un solo lugar',
  'Guarda direcciones y preferencias de entrega',
  'Accede a beneficios, saldo y favoritos',
];

/** Marco visual compartido por las pantallas de acceso, construido solo con MUI. */
export const AuthShell = ({ eyebrow, title, description, children, wide = false }: AuthShellProps) => (
  <Box
    component="section"
    sx={{
      position: 'relative',
      overflow: 'hidden',
      display: 'grid',
      minHeight: { xs: 'calc(100vh - 72px)', md: 'calc(100vh - 80px)' },
      placeItems: 'center',
      py: { xs: 4, sm: 7 },
      background:
        'radial-gradient(circle at 8% 15%, rgba(35,124,82,.12), transparent 28%), radial-gradient(circle at 92% 82%, rgba(232,148,15,.10), transparent 26%), #f7faf8',
    }}
  >
    <Container maxWidth="lg" sx={{ position: 'relative' }}>
      <Paper
        elevation={0}
        sx={{
          mx: 'auto',
          display: 'grid',
          maxWidth: wide ? 1080 : 1020,
          gridTemplateColumns: { xs: '1fr', md: wide ? '0.88fr 1.12fr' : '1fr 1fr' },
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: { xs: 4, sm: 5 },
          boxShadow: '0 28px 80px rgba(20, 60, 40, .12)',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            display: { xs: 'none', md: 'flex' },
            minHeight: 600,
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden',
            p: { md: 5, lg: 6 },
            color: 'common.white',
            background: 'linear-gradient(145deg, #174c35 0%, #237c52 68%, #2f9164 100%)',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: -100,
              right: -80,
              width: 280,
              height: 280,
              borderRadius: '50%',
              bgcolor: 'rgba(255,255,255,.08)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              right: -20,
              bottom: -90,
              width: 240,
              height: 240,
              border: '44px solid rgba(255,255,255,.06)',
              borderRadius: '50%',
            }}
          />

          <Box sx={{ position: 'relative' }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  display: 'grid',
                  width: 44,
                  height: 44,
                  placeItems: 'center',
                  borderRadius: 3,
                  bgcolor: 'rgba(255,255,255,.15)',
                  border: '1px solid rgba(255,255,255,.18)',
                }}
              >
                <Leaf size={23} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 850, letterSpacing: '-.02em' }}>
                Verde Bowl
              </Typography>
            </Stack>

            <Chip
              icon={<Sparkles size={15} />}
              label="Comer bien, todos los días"
              sx={{
                mt: 7,
                color: 'common.white',
                bgcolor: 'rgba(255,255,255,.13)',
                '& .MuiChip-icon': { color: '#ffd38a' },
              }}
            />
            <Typography
              component="p"
              sx={{ mt: 3, maxWidth: 390, fontSize: { md: 34, lg: 40 }, fontWeight: 800, lineHeight: 1.12 }}
            >
              Tu experiencia saludable empieza aquí.
            </Typography>
            <Typography sx={{ mt: 2, maxWidth: 390, color: 'rgba(255,255,255,.76)', lineHeight: 1.7 }}>
              Una cuenta sencilla para pedir más rápido y tener todo tu historial siempre disponible.
            </Typography>

            <Stack spacing={2} sx={{ mt: 5 }}>
              {BENEFITS.map((benefit) => (
                <Stack key={benefit} direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <CheckCircle2 size={19} color="#bde8cc" />
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.9)' }}>
                    {benefit}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          <Stack direction="row" spacing={1.25} sx={{ position: 'relative', alignItems: 'center' }}>
            <ShieldCheck size={20} color="#bde8cc" />
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.72)' }}>
              Tus datos están protegidos y nunca compartimos tu contraseña.
            </Typography>
          </Stack>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', p: { xs: 3, sm: 5, lg: 6 } }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1, mb: 4, color: 'primary.main' }}>
            <Leaf size={23} />
            <Typography sx={{ fontWeight: 850 }}>Verde Bowl</Typography>
          </Box>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 800, letterSpacing: '.12em' }}>
            {eyebrow}
          </Typography>
          <Typography component="h1" variant="h4" sx={{ mt: 0.5, fontWeight: 850, letterSpacing: '-.035em' }}>
            {title}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1.25, mb: 4, maxWidth: 520, lineHeight: 1.65 }}>
            {description}
          </Typography>
          {children}
        </Box>
      </Paper>
    </Container>
  </Box>
);
