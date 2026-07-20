import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer from '@features/auth/authSlice';
import cartReducer from '@features/cart/cartSlice';
import catalogReducer from '@features/catalog/catalogSlice';
import favoritesReducer from '@features/favorites/favoritesSlice';
import uiReducer from '@features/ui/uiSlice';
import { clearPersonalStorage, loadState, saveState } from '@lib/storage';

/**
 * ESTADO GLOBAL (Redux Toolkit)
 * Aqui vive lo que muchas pantallas comparten y sobrevive a la navegacion:
 * sesion, carrito, filtros de catalogo y estado de UI.
 *
 * El estado de UI puntual y efimero (ciudad/direccion elegida, modales de un
 * flujo) vive en el Context `useAppState`. El estado de un formulario o de un
 * componente concreto se queda en useState local.
 */
const appReducer = combineReducers({
  auth: authReducer,
  cart: cartReducer,
  catalog: catalogReducer,
  favorites: favoritesReducer,
  ui: uiReducer,
});

export type RootState = ReturnType<typeof appReducer>;

/**
 * Al cerrar sesion se descarta todo lo personal (carrito, favoritos, borradores) y
 * solo sobreviven catalogo y UI, que no son de nadie. Se hace aqui y no en authSlice
 * porque un reducer solo puede limpiar su propia rama.
 */
const rootReducer = (
  state: Parameters<typeof appReducer>[0],
  action: Parameters<typeof appReducer>[1],
): RootState => {
  if (action.type === 'auth/logout') {
    clearPersonalStorage();
    // combineReducers reinicia con su initialState toda rama que llegue undefined:
    // por eso basta con conservar las dos que no son personales.
    return appReducer({ catalog: state?.catalog, ui: state?.ui }, action);
  }
  return appReducer(state, action);
};

const PERSIST_KEY = 'verde-bowl:state';

export const store = configureStore({
  reducer: rootReducer,
  preloadedState: loadState<Partial<RootState>>(PERSIST_KEY) ?? undefined,
  devTools: import.meta.env.DEV,
});

// Solo se persiste lo necesario (sesion, carrito y favoritos); el resto se recarga del API.
store.subscribe(() => {
  const { auth, cart, favorites } = store.getState();
  saveState(PERSIST_KEY, { auth, cart, favorites });
});

export type AppDispatch = typeof store.dispatch;
