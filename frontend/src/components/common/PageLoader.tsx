import { Box, CircularProgress, Stack, Typography } from '@mui/material';

export const PageLoader = () => (
  <Box sx={{ display: 'grid', minHeight: '52vh', placeItems: 'center' }} role="status" aria-live="polite">
    <Stack spacing={2} sx={{ alignItems: 'center' }}>
      <Box sx={{ position: 'relative', display: 'grid', width: 54, height: 54, placeItems: 'center', borderRadius: 4, bgcolor: 'action.hover' }}>
        <CircularProgress size={30} thickness={4.5} />
      </Box>
      <Typography variant="body2" color="text.secondary">Preparando tu experiencia…</Typography>
    </Stack>
  </Box>
);
