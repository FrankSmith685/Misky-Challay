import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppDispatch } from '@app/hooks';
import { logoutUser } from '@features/auth/authSlice';
import { ROUTES } from '@constants/routes';

/**
 * Cierra la sesion (avisa al backend + limpia el estado local) y lleva al inicio.
 * Un solo lugar para el logout, usado por el menu de usuario y los paneles.
 */
export const useLogout = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  return useCallback(async () => {
    await dispatch(logoutUser());
    toast.success('Sesion cerrada');
    navigate(ROUTES.home, { replace: true });
  }, [dispatch, navigate]);
};
