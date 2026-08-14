import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from '@components/mui/MuiToast';
import { useAppDispatch } from '@app/hooks';
import { logoutUser } from '@features/auth/authSlice';
import { ROUTES } from '@constants/routes';
import { useAppState } from '@context/AppStateContext';

/**
 * Cierra la sesion (avisa al backend + limpia el estado local) y lleva al inicio.
 * Un solo lugar para el logout, usado por el menu de usuario y los paneles.
 */
export const useLogout = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { reset: resetPurchaseContext } = useAppState();

  return useCallback(async () => {
    await dispatch(logoutUser());
    // El Provider permanece montado al navegar al inicio: hay que limpiar
    // tambien su estado EN MEMORIA, no solo la copia de localStorage.
    resetPurchaseContext();
    toast.success('Sesion cerrada');
    navigate(ROUTES.home, { replace: true });
  }, [dispatch, navigate, resetPurchaseContext]);
};
