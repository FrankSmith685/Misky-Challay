import type { ReactNode } from 'react';
import { Box, Container, Divider, Paper, Stack, Typography } from '@mui/material';

export interface LegalSection {
  title: string;
  body: ReactNode;
}

interface LegalDocumentProps {
  title: string;
  updatedAt: string;
  intro?: ReactNode;
  sections: LegalSection[];
}

/**
 * Documento legal con formato de lectura: un solo ancho de columna, numeracion de
 * secciones y jerarquia clara. La numeracion la aporta el orden del array, no se
 * escribe a mano en cada titulo.
 */
export const LegalDocument = ({ title, updatedAt, intro, sections }: LegalDocumentProps) => (
  <Container maxWidth="md" sx={{ py: { xs: 5, md: 8 } }}>
    <Typography variant="h3" sx={{ fontWeight: 800, fontSize: { xs: 30, md: 40 } }}>
      {title}
    </Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
      Última actualización: {updatedAt}
    </Typography>

    {intro && (
      <Paper variant="outlined" sx={{ p: 2.5, mt: 3, borderRadius: 2, bgcolor: 'action.hover' }}>
        <Typography variant="body2" color="text.secondary">
          {intro}
        </Typography>
      </Paper>
    )}

    <Stack spacing={4} sx={{ mt: 5 }} component="article">
      {sections.map((section, index) => (
        <Box key={section.title} component="section">
          <Typography variant="h6" sx={{ fontWeight: 800, mb: 1.25 }}>
            <Box component="span" sx={{ color: 'primary.main', mr: 1 }}>
              {index + 1}.
            </Box>
            {section.title}
          </Typography>
          <Box sx={{ color: 'text.secondary', lineHeight: 1.8, '& p': { m: 0, mb: 1.5 }, '& ul': { pl: 3, mt: 0 }, '& li': { mb: 0.75 } }}>
            {section.body}
          </Box>
        </Box>
      ))}
    </Stack>

    <Divider sx={{ my: 5 }} />
    <Typography variant="caption" color="text.secondary">
      Este documento es una plantilla adaptada al marco peruano. Antes de operar comercialmente,
      revísalo con un abogado y complétalo con los datos definitivos de tu empresa.
    </Typography>
  </Container>
);
