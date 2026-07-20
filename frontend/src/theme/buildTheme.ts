import { createTheme, type Theme } from '@mui/material/styles';
import { readableText, shade, tint } from './colorUtils';
import type { ThemeTokens } from './tokens';

/**
 * Construye el tema de Material UI a partir de los tokens gestionables.
 *
 * Se llama cada vez que el usuario cambia un color/radio en el editor, de modo
 * que TODOS los componentes de MUI (botones, campos, tablas, dialogos...) se
 * actualizan en vivo. El look de marca (verde, Inter, radios) sale de aqui.
 */
export const buildTheme = (tokens: ThemeTokens): Theme => {
  const { primary, secondary, tertiary, radius } = tokens;

  return createTheme({
    palette: {
      primary: { main: primary, contrastText: readableText(primary) },
      secondary: { main: secondary, contrastText: readableText(secondary) },
      // Color de marca personalizado (ver theme/mui.d.ts). Se calculan light/dark
      // y el texto legible para que funcione con cualquier color elegido.
      tertiary: {
        main: tertiary,
        light: tint(tertiary, 0.2),
        dark: shade(tertiary, 0.2),
        contrastText: readableText(tertiary),
      },
      success: { main: '#237c52', contrastText: '#ffffff' },
      warning: { main: '#e8940f', contrastText: '#ffffff' },
      info: { main: '#237c52', contrastText: '#ffffff' },
      error: { main: '#dc2626', contrastText: '#ffffff' },
      text: { primary: '#14201a', secondary: '#5d6b64' },
      background: { default: '#f6f8f7', paper: '#ffffff' },
      divider: '#e3e8e5',
    },
    typography: {
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      h1: { fontWeight: 850, letterSpacing: '-0.04em', lineHeight: 1.08 },
      h2: { fontWeight: 820, letterSpacing: '-0.035em', lineHeight: 1.14 },
      h3: { fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.2 },
      h4: { fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.22 },
      h5: { fontWeight: 750, letterSpacing: '-0.015em' },
      h6: { fontWeight: 750, letterSpacing: '-0.01em' },
      body1: { lineHeight: 1.65 },
      body2: { lineHeight: 1.55 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: { borderRadius: radius },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: false, size: 'medium' },
        styleOverrides: {
          root: {
            minHeight: 40,
            borderRadius: 999,
            letterSpacing: 0,
            paddingInline: 20,
            transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease',
            '&:focus-visible': { outline: `3px solid ${tint(primary, 0.65)}`, outlineOffset: 2 },
          },
          contained: { boxShadow: '0 4px 12px rgba(20,32,26,.10)', '&:hover': { boxShadow: '0 8px 20px rgba(35,124,82,.22)' } },
          outlined: { borderColor: '#d9e2dd', '&:hover': { borderColor: primary, backgroundColor: tint(primary, 0.94) } },
          sizeLarge: { minHeight: 48, paddingInline: 28 },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: 'background-color 160ms ease, color 160ms ease, transform 160ms ease',
            '&:focus-visible': { outline: `3px solid ${tint(primary, 0.65)}`, outlineOffset: 2 },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: 650 },
          outlined: { backgroundColor: '#ffffff' },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: {
            borderColor: '#e3e8e5',
            borderRadius: Math.max(radius + 6, 18),
            boxShadow: '0 1px 2px rgba(20,32,26,.03)',
            transition: 'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: { borderRadius: Math.max(radius, 12), fontWeight: 500, alignItems: 'center' },
          message: { minWidth: 0 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            border: '1px solid #e3e8e5',
            borderRadius: Math.max(radius + 6, 16),
            boxShadow: '0 24px 80px rgba(20,32,26,.22)',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: { tooltip: { borderRadius: 8, fontSize: 12, padding: '7px 10px' } },
      },
      MuiTextField: { defaultProps: { size: 'small', variant: 'outlined' } },
      MuiFormHelperText: { styleOverrides: { root: { marginLeft: 4, marginTop: 6, lineHeight: 1.35 } } },
      MuiInputLabel: { styleOverrides: { root: { fontWeight: 520 } } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            minHeight: 44,
            borderRadius: radius,
            backgroundColor: '#ffffff',
            transition: 'box-shadow 160ms ease, background-color 160ms ease',
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tint(primary, 0.45) },
            '&.Mui-focused': { boxShadow: `0 0 0 4px ${tint(primary, 0.88)}` },
          },
          notchedOutline: { borderColor: '#dfe6e2' },
        },
      },
      MuiSelect: {
        defaultProps: { MenuProps: { disableScrollLock: true } },
        styleOverrides: { select: { display: 'flex', alignItems: 'center' } },
      },
      MuiDialogTitle: { styleOverrides: { root: { fontWeight: 800, padding: '24px 24px 8px' } } },
      MuiDialogContent: { styleOverrides: { root: { padding: '16px 24px 24px' } } },
      MuiDialogActions: { styleOverrides: { root: { padding: '8px 24px 24px', gap: 8 } } },
      MuiMenu: { styleOverrides: { paper: { marginTop: 8, border: '1px solid #e3e8e5', borderRadius: 14, boxShadow: '0 16px 48px rgba(20,32,26,.16)' } } },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 42, marginInline: 6, borderRadius: 9, fontSize: 14 } } },
      MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 99 } } },
      MuiTab: { styleOverrides: { root: { minHeight: 44, textTransform: 'none', fontWeight: 650 } } },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            border: '1px solid #e3e8e5',
            borderRadius: Math.max(radius + 4, 14),
            boxShadow: '0 8px 28px rgba(20,32,26,.055)',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: '#f3f6f4',
            color: '#425148',
            fontSize: 12,
            fontWeight: 750,
            letterSpacing: '.035em',
            textTransform: 'uppercase',
          },
          root: { borderColor: '#e8ecea', paddingBlock: 14 },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: 'background-color 160ms ease',
            '&:last-child td': { borderBottom: 0 },
            '&:hover': { backgroundColor: tint(primary, 0.965) },
          },
        },
      },
      MuiSkeleton: { styleOverrides: { root: { borderRadius: Math.max(radius, 10) } } },
      MuiSnackbar: { defaultProps: { anchorOrigin: { vertical: 'bottom', horizontal: 'right' } } },
      MuiDrawer: { styleOverrides: { paper: { backgroundImage: 'none' } } },
      MuiAppBar: { defaultProps: { elevation: 0 } },
    },
  });
};
