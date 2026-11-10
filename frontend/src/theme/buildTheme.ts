import { createTheme, type Theme } from '@mui/material/styles';
import { rampFromHex, readableText, shade, tint, type ColorRamp } from './colorUtils';
import { SURFACE, rampsFromTokens, type ThemeTokens } from './tokens';

/**
 * Construye el tema de Material UI a partir de los tokens gestionables.
 *
 * Se llama cada vez que el usuario cambia un color/radio en el editor, de modo
 * que TODOS los componentes de MUI (botones, campos, tablas, dialogos...) se
 * actualizan en vivo. Comparte la identidad de pastelería con Tailwind.
 */
export const buildTheme = (tokens: ThemeTokens): Theme => {
  const { primary, secondary, tertiary, radius } = tokens;
  const safeRadius = Math.min(5, Math.max(0, radius));
  const compact = tokens.density === 'compact';
  const ramp = rampsFromTokens(tokens);
  const successRamp = rampFromHex('#167653');
  const infoRamp = rampFromHex('#376a91');
  const warningRamp = rampFromHex('#b77712');

  /**
   * Publica la rampa completa junto al `main`. Sin las paradas numericas, rutas
   * como `bgcolor: 'primary.50'` resolvian a undefined y el chip de PageHeader,
   * el icono de la 404 y el fondo de las notificaciones no leidas se pintaban
   * transparentes. Al existir las paradas, MUI toma ademas `light` del 300 y
   * `dark` del 700 en lugar de aclarar/oscurecer el `main` a ojo.
   */
  const withRamp = (stops: ColorRamp, main: string) => ({
    ...stops,
    main,
    contrastText: readableText(main),
  });

  return createTheme({
    palette: {
      primary: withRamp(ramp.brand, primary),
      secondary: withRamp(ramp.accent, secondary),
      // Color de marca personalizado (ver theme/mui.d.ts). Se calculan light/dark
      // y el texto legible para que funcione con cualquier color elegido.
      tertiary: {
        ...ramp.tertiary,
        main: tertiary,
        light: tint(tertiary, 0.2),
        dark: shade(tertiary, 0.2),
        contrastText: readableText(tertiary),
      },
      // Status colors remain independent of the editable brand colors.
      success: withRamp(successRamp, successRamp[600]),
      warning: withRamp(warningRamp, '#b77712'),
      info: withRamp(infoRamp, '#376a91'),
      error: withRamp(ramp.error, ramp.error[600]),
      text: { primary: SURFACE.ink, secondary: SURFACE.inkMuted },
      background: { default: SURFACE.muted, paper: SURFACE.base },
      divider: SURFACE.line,
    },
    typography: {
      fontFamily: tokens.fontFamily === 'serif' ? 'Georgia, Cambria, serif' : tokens.fontFamily === 'system' ? 'ui-sans-serif, system-ui, sans-serif' : "'Inter', ui-sans-serif, system-ui, sans-serif",
      fontSize: tokens.baseFontSize,
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
    shape: { borderRadius: safeRadius },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true, disableRipple: false, size: 'medium' },
        styleOverrides: {
          root: {
            minHeight: compact ? 40 : 44,
            borderRadius: safeRadius,
            letterSpacing: 0,
            paddingInline: 20,
            transition: 'transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease',
          },
          contained: {
            boxShadow: '0 4px 12px rgba(23,50,77,.10)',
            '&:hover': { boxShadow: 'var(--shadow-e3)' },
            '&.MuiButton-containedPrimary': {
              backgroundImage: 'none',
              backgroundColor: primary,
            },
            '&.MuiButton-containedPrimary:hover': {
              backgroundImage: 'none',
              backgroundColor: ramp.brand[700],
            },
            '&.MuiButton-containedSecondary': {
              color: readableText(secondary),
              backgroundImage: `linear-gradient(135deg, ${secondary} 0%, ${ramp.accent[300]} 100%)`,
            },
            '&.MuiButton-containedSecondary:hover': {
              backgroundImage: `linear-gradient(135deg, ${ramp.accent[600]} 0%, ${ramp.accent[400]} 100%)`,
            },
          },
          outlined: { borderColor: SURFACE.line, '&:hover': { borderColor: primary, backgroundColor: tint(primary, 0.94) } },
          sizeLarge: { minHeight: 48, paddingInline: 28 },
        },
      },
      // El foco visible NO se define aqui: lo pone el `:focus-visible` global de
      // styles/index.css. Cuando cada componente traia el suyo convivian tres
      // estilos distintos en la misma pantalla (boton propio, MuiButton, IconButton).
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: 'background-color 160ms ease, color 160ms ease, transform 160ms ease',
            // El panel se opera en tablet, de pie: los iconos de la barra movil y
            // del sidebar contraido median 34-36px, por debajo del paso tactil de
            // 44 que el propio sistema declara (BUTTON_HEIGHT.md). Solo con puntero
            // grueso: con raton, engordar cada icono descuadraria las barras.
            '@media (pointer: coarse)': { minWidth: 44, minHeight: 44 },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: safeRadius, fontWeight: 650 },
          outlined: { backgroundColor: '#ffffff' },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: {
            borderColor: SURFACE.line,
            borderRadius: 'var(--radius-card)',
            boxShadow: '0 1px 2px rgba(23,50,77,.03)',
            transition: 'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
          },
        },
      },
      MuiCardContent: {
        styleOverrides: {
          root: {
            padding: compact ? 20 : 24,
            '&:last-child': { paddingBottom: compact ? 20 : 24 },
            '@media (max-width: 600px)': {
              padding: 20,
              '&:last-child': { paddingBottom: 20 },
            },
          },
        },
      },
      MuiCardActions: {
        styleOverrides: {
          root: {
            gap: 8,
            padding: '0 24px 24px',
            '@media (max-width: 600px)': { padding: '0 20px 20px' },
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            minHeight: 56,
            padding: '11px 16px',
            border: '1px solid',
            borderColor: SURFACE.line,
            borderRadius: safeRadius,
            fontWeight: 500,
            alignItems: 'flex-start',
            boxShadow: '0 6px 18px rgba(23,50,77,.045)',
            '&.MuiAlert-standardInfo': {
              borderColor: infoRamp[200],
              backgroundColor: infoRamp[50],
            },
            '&.MuiAlert-standardSuccess': {
              borderColor: successRamp[200],
              backgroundColor: successRamp[50],
            },
            '&.MuiAlert-standardWarning': {
              borderColor: warningRamp[200],
              backgroundColor: warningRamp[50],
            },
            '&.MuiAlert-standardError': {
              borderColor: ramp.error[200],
              backgroundColor: ramp.error[50],
            },
          },
          icon: {
            width: 32,
            height: 32,
            marginRight: 12,
            padding: 0,
            borderRadius: safeRadius,
            display: 'grid',
            placeItems: 'center',
            backgroundColor: 'rgba(255,255,255,.72)',
          },
          message: { minWidth: 0, padding: '2px 0', lineHeight: 1.5 },
          action: { alignItems: 'center', marginRight: -6, padding: 0, paddingLeft: 12 },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            border: `1px solid ${SURFACE.line}`,
            borderRadius: safeRadius,
            boxShadow: '0 24px 80px rgba(23,50,77,.22)',
            backgroundImage: `linear-gradient(180deg, ${SURFACE.base} 0%, ${SURFACE.muted} 100%)`,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: { tooltip: { borderRadius: safeRadius, fontSize: 12, padding: '7px 10px' } },
      },
      MuiTextField: { defaultProps: { size: 'medium', variant: 'outlined' } },
      MuiFormHelperText: {
        styleOverrides: {
          root: { marginLeft: 6, marginTop: 7, minHeight: 17, lineHeight: 1.4 },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { fontWeight: 600, color: SURFACE.inkMuted },
          shrink: { fontWeight: 650 },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            minHeight: 52,
            borderRadius: safeRadius,
            backgroundColor: '#ffffff',
            transition: 'border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease',
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tint(primary, 0.45) },
            '&.Mui-focused': { boxShadow: `0 0 0 4px ${tint(primary, 0.88)}` },
            '&.Mui-error.Mui-focused': { boxShadow: `0 0 0 4px ${tint(ramp.error[600], 0.88)}` },
            '&.MuiInputBase-multiline': {
              minHeight: 112,
              alignItems: 'flex-start',
              padding: '15px 16px',
            },
            '&.Mui-disabled': { backgroundColor: SURFACE.muted },
          },
          notchedOutline: { borderColor: SURFACE.line },
          input: { padding: '14px 16px' },
        },
      },
      MuiFormLabel: {
        styleOverrides: {
          root: { marginBottom: 8, color: SURFACE.inkMuted, fontWeight: 700 },
        },
      },
      MuiFormControlLabel: {
        styleOverrides: {
          root: {
            minHeight: 44,
            marginLeft: -6,
            marginRight: 0,
            borderRadius: safeRadius,
          },
          label: { fontSize: 14, lineHeight: 1.45 },
        },
      },
      MuiCheckbox: {
        styleOverrides: { root: { padding: 10 } },
      },
      MuiRadio: {
        styleOverrides: { root: { padding: 10 } },
      },
      MuiSwitch: {
        styleOverrides: {
          root: { width: 50, height: 32, padding: 6 },
          switchBase: {
            padding: 8,
            '&.Mui-checked': {
              transform: 'translateX(18px)',
              '& + .MuiSwitch-track': { opacity: 1 },
            },
          },
          thumb: { width: 16, height: 16, boxShadow: '0 2px 5px rgba(23,50,77,.25)' },
          track: { borderRadius: safeRadius, opacity: 1, backgroundColor: '#b5cfe2' },
        },
      },
      MuiSelect: {
        defaultProps: { MenuProps: { disableScrollLock: true } },
        styleOverrides: { select: { display: 'flex', alignItems: 'center' } },
      },
      MuiDialogTitle: {
        styleOverrides: {
          root: {
            fontWeight: 800,
            padding: '28px 28px 12px',
            '@media (max-width: 600px)': { padding: '22px 20px 10px' },
          },
        },
      },
      MuiDialogContent: {
        styleOverrides: {
          root: {
            padding: '20px 28px 28px',
            '@media (max-width: 600px)': { padding: '18px 20px 24px' },
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: {
            minHeight: 72,
            padding: '14px 28px 22px',
            gap: 10,
            borderTop: `1px solid ${SURFACE.line}`,
            '@media (max-width: 600px)': {
              padding: '14px 20px 20px',
              flexDirection: 'column-reverse',
              '& > :not(style)': { width: '100%', margin: 0 },
            },
          },
        },
      },
      MuiMenu: { styleOverrides: { paper: { marginTop: 8, border: `1px solid ${SURFACE.line}`, borderRadius: safeRadius, boxShadow: '0 16px 48px rgba(23,50,77,.16)' } } },
      MuiMenuItem: { styleOverrides: { root: { minHeight: 42, marginInline: 6, borderRadius: safeRadius, fontSize: 14 } } },
      MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: safeRadius } } },
      MuiTab: { styleOverrides: { root: { minHeight: 44, textTransform: 'none', fontWeight: 650 } } },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            border: `1px solid ${SURFACE.line}`,
            borderRadius: safeRadius,
            boxShadow: '0 8px 28px rgba(23,50,77,.055)',
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          head: {
            backgroundColor: SURFACE.muted,
            color: SURFACE.inkMuted,
            fontSize: 12,
            fontWeight: 750,
            letterSpacing: '.035em',
            textTransform: 'uppercase',
          },
          root: { borderColor: SURFACE.line, paddingBlock: 14 },
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
      MuiSkeleton: { styleOverrides: { root: { borderRadius: safeRadius } } },
      MuiSnackbar: {
        defaultProps: { anchorOrigin: { vertical: 'bottom', horizontal: 'right' } },
        styleOverrides: { root: { maxWidth: 'calc(100vw - 24px)' } },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundImage: `linear-gradient(180deg, ${SURFACE.base} 0%, ${SURFACE.muted} 100%)`,
            borderColor: SURFACE.line,
            boxShadow: '0 24px 80px rgba(23,50,77,.18)',
          },
        },
      },
      MuiAppBar: { defaultProps: { elevation: 0 } },
      MuiContainer: {
        styleOverrides: {
          root: {
            '&.MuiContainer-maxWidthXl': {
              maxWidth: 'var(--content-max-width)',
              paddingInline: 'var(--content-gutter)',
            },
          },
        },
      },
    },
  });
};
