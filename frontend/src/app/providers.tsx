import type { ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { Toaster } from '@components/mui/MuiToast';
import { ConfirmDialogProvider } from '@components/ui/ConfirmDialog';
import { store } from './store';
import { SessionGate } from './SessionGate';
import { ThemeSettingsProvider } from '@/theme/ThemeSettingsProvider';
import { AppStateProvider } from '@context/AppStateContext';
import { PurchaseContextSync } from '@context/PurchaseContextSync';
import { useAppSelector } from './hooks';
import { StorefrontProvider } from '@features/home/content/StorefrontProvider';
import { RealtimeConnection } from './RealtimeConnection';
import { CustomerWorkspaceSync } from './CustomerWorkspaceSync';
import { LocalPersistenceNotice } from './LocalPersistenceNotice';

const PurchaseExperience = ({ children }: { children: ReactNode }) => {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  return (
    <AppStateProvider key={userId ?? 'guest'}>
      <PurchaseContextSync />
      <RealtimeConnection />
      <CustomerWorkspaceSync />
      <LocalPersistenceNotice />
      <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
    </AppStateProvider>
  );
};

/**
 * Un unico lugar donde se envuelven todos los providers de la aplicacion.
 *
 * ThemeSettingsProvider aplica el tema de marca GESTIONABLE a los componentes de
 * MUI (colores editables + persistencia). CssBaseline y los tokens CSS comparten
 * la misma fuente visual para evitar diferencias entre rutas.
 *
 * ConfirmDialogProvider va DENTRO del tema (el dialogo es un componente de MUI) y
 * envuelve a toda la app: cualquier pantalla puede pedir una confirmacion con
 * `await useConfirm()(...)` sin montar su propio modal.
 */
export const AppProviders = ({ children }: { children: ReactNode }) => (
  <ReduxProvider store={store}>
    <ThemeSettingsProvider>
      {/* No se consulta ni se sube contexto de una cuenta antes de validarla. */}
      <StorefrontProvider><SessionGate><PurchaseExperience>{children}</PurchaseExperience></SessionGate></StorefrontProvider>
      <Toaster />
    </ThemeSettingsProvider>
  </ReduxProvider>
);
