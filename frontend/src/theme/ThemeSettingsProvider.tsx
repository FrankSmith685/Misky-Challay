/* eslint-disable react-refresh/only-export-components -- El provider y su hook forman una única API de contexto. */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { buildTheme } from './buildTheme';
import { applyCssVars } from './applyCssVars';
import { DEFAULT_TOKENS, loadTokens, saveTokens, type ThemeTokens } from './tokens';

type ThemeSettingsContextValue = {
  tokens: ThemeTokens;
  /** Cambia un token individual (color o radio). */
  setToken: <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => void;
  /** Restablece TODO el tema a los valores por defecto de la marca. */
  reset: () => void;
  /** True si el tema difiere de los valores por defecto. */
  isCustomized: boolean;
};

const ThemeSettingsContext = createContext<ThemeSettingsContextValue | null>(null);

/**
 * Provee el tema de Material UI DE FORMA DINAMICA a partir de tokens editables.
 *
 * - Carga los tokens guardados (localStorage) al iniciar.
 * - Sincroniza las variables CSS de Tailwind con cada cambio (applyCssVars).
 * - Reconstruye el tema de MUI y persiste los cambios.
 *
 * Reemplaza al ThemeProvider estatico. CssBaseline alinea la base accesible de
 * MUI y styles/index.css conserva los tokens y utilidades propias del producto.
 */
export const ThemeSettingsProvider = ({ children }: { children: ReactNode }) => {
  const [tokens, setTokens] = useState<ThemeTokens>(loadTokens);

  // Antes de pintar: aplica las variables CSS de marca (evita parpadeo).
  useLayoutEffect(() => {
    applyCssVars(tokens);
    saveTokens(tokens);
  }, [tokens]);

  const setToken = useCallback(<K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => {
    setTokens((prev) => ({ ...prev, [key]: value }));
  }, []);

  const reset = useCallback(() => setTokens(DEFAULT_TOKENS), []);

  const theme = useMemo(() => buildTheme(tokens), [tokens]);

  const value = useMemo<ThemeSettingsContextValue>(
    () => ({
      tokens,
      setToken,
      reset,
      isCustomized: (Object.keys(DEFAULT_TOKENS) as Array<keyof ThemeTokens>).some(
        (key) => tokens[key] !== DEFAULT_TOKENS[key],
      ),
    }),
    [tokens, setToken, reset],
  );

  return (
    <ThemeSettingsContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeSettingsContext.Provider>
  );
};

/** Acceso al tema gestionable desde el editor y cualquier consumidor. */
export const useThemeSettings = (): ThemeSettingsContextValue => {
  const ctx = useContext(ThemeSettingsContext);
  if (!ctx) throw new Error('useThemeSettings debe usarse dentro de <ThemeSettingsProvider>');
  return ctx;
};
