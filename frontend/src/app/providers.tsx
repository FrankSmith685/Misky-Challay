import type { ReactNode } from 'react';
import { Provider as ReduxProvider } from 'react-redux';
import { Toaster } from '@components/mui/MuiToast';
import { ConfirmDialogProvider } from '@components/ui/ConfirmDialog';
import { store } from './store';
import { SessionGate } from './SessionGate';
import { ThemeSettingsProvider } from '@/theme/ThemeSettingsProvider';
import { AppStateProvider } from '@context/AppStateContext';
import { PurchaseContextSync } from '@context/PurchaseContextSync';

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
      <AppStateProvider>
        {/* Recupera de la cuenta la direccion o el local que uso por ultima vez. */}
        <PurchaseContextSync />
        <ConfirmDialogProvider>
          {/* Revalida la sesion contra el backend antes de mostrar la app. */}
          <SessionGate>{children}</SessionGate>
        </ConfirmDialogProvider>
        {/* Centro de notificaciones personalizado, construido con Snackbar + Alert de MUI. */}
        <Toaster toastOptions={{ duration: 4200 }} />
      </AppStateProvider>
    </ThemeSettingsProvider>
  </ReduxProvider>
);
