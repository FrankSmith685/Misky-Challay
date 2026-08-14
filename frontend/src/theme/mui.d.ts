/**
 * AUGMENTACION DE TIPOS DE MATERIAL UI.
 *
 * Añade el color de marca `tertiary` a la paleta y habilita `color="tertiary"`
 * en los componentes que lo usan en la app. Sin esto, TypeScript no reconoceria
 * el color personalizado.
 */
import '@mui/material/styles';

/**
 * Paradas numericas de rampa (ver theme/colorUtils.ts). MUI solo tipa
 * main/light/dark/contrastText; buildTheme publica ademas la rampa completa
 * para que rutas como `bgcolor: 'primary.50'` resuelvan a un color real.
 */
type RampStops = Partial<Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900, string>>;

declare module '@mui/material/styles' {
  interface Palette {
    tertiary: Palette['primary'];
  }
  interface PaletteOptions {
    tertiary?: PaletteOptions['primary'];
  }
  interface PaletteColor extends RampStops {}
  interface SimplePaletteColorOptions extends RampStops {}
}

declare module '@mui/material/Button' {
  interface ButtonPropsColorOverrides {
    tertiary: true;
  }
}
declare module '@mui/material/IconButton' {
  interface IconButtonPropsColorOverrides {
    tertiary: true;
  }
}
declare module '@mui/material/Chip' {
  interface ChipPropsColorOverrides {
    tertiary: true;
  }
}
declare module '@mui/material/Badge' {
  interface BadgePropsColorOverrides {
    tertiary: true;
  }
}
declare module '@mui/material/Fab' {
  interface FabPropsColorOverrides {
    tertiary: true;
  }
}
declare module '@mui/material/SvgIcon' {
  interface SvgIconPropsColorOverrides {
    tertiary: true;
  }
}
declare module '@mui/material/CircularProgress' {
  interface CircularProgressPropsColorOverrides {
    tertiary: true;
  }
}
declare module '@mui/material/LinearProgress' {
  interface LinearProgressPropsColorOverrides {
    tertiary: true;
  }
}
declare module '@mui/material/Checkbox' {
  interface CheckboxPropsColorOverrides {
    tertiary: true;
  }
}
declare module '@mui/material/Radio' {
  interface RadioPropsColorOverrides {
    tertiary: true;
  }
}
declare module '@mui/material/Switch' {
  interface SwitchPropsColorOverrides {
    tertiary: true;
  }
}
