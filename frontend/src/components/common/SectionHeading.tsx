import { Box, Typography } from '@mui/material';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export const SectionHeading = ({ eyebrow, title, description }: SectionHeadingProps) => (
  <Box component="header" sx={{ mb: 4, pb: 2.5, borderBottom: 1, borderColor: 'divider' }}>
    {eyebrow && (
      <Typography component="p" sx={{ display: 'inline-flex', px: 1.25, py: .55, borderRadius: 99, bgcolor: 'primary.50', color: 'primary.dark', fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase' }}>{eyebrow}</Typography>
    )}
    <Typography component="h1" variant="h4" sx={{ mt: eyebrow ? 1 : 0, fontSize: { xs: 25, sm: 32 } }}>{title}</Typography>
    {description && <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 720, fontSize: { xs: 14, sm: 15 } }}>{description}</Typography>}
  </Box>
);
