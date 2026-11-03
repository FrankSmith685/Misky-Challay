import { configureStore, combineReducers } from '@reduxjs/toolkit';
import authReducer, { fetchCurrentUser, login, logout, register, setUser } from '@features/auth/authSlice';
import cartReducer from '@features/cart/cartSlice';
import catalogReducer from '@features/catalog/catalogSlice';
import favoritesReducer from '@features/favorites/favoritesSlice';
import uiReducer from '@features/ui/uiSlice';
import { clearPersonalStorage, loadState, saveState } from '@lib/storage';
import { tokenStorage } from '@services/api/client';

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
  // Una respuesta anterior al logout o a otra revalidación no puede recuperar
  // la cuenta que ya salió ni cerrar la sesión del siguiente cliente.
  if ((fetchCurrentUser.fulfilled.match(action) || fetchCurrentUser.rejected.match(action))
    && action.meta.requestId !== state?.auth?.currentUserRequestId) {
    return appReducer(state, { type: '@@ignore-stale-session' });
  }
  const nextUser = fetchCurrentUser.fulfilled.match(action) || setUser.match(action)
    ? action.payload
    : login.fulfilled.match(action) || register.fulfilled.match(action) ? action.payload.user : null;
  const changedAccount = nextUser && state?.auth?.user && nextUser.id !== state.auth.user.id;
  if (logout.match(action) || fetchCurrentUser.rejected.match(action) || changedAccount) {
    clearPersonalStorage();
    // combineReducers reinicia con su initialState toda rama que llegue undefined:
    // por eso basta con conservar las dos que no son personales.
    return appReducer({ catalog: state?.catalog, ui: state?.ui }, action);
  }
  return appReducer(state, action);
};

const PERSIST_KEY = 'verde-bowl:state';

interface PersistedState extends Partial<RootState> {
  persistenceVersion?: number;
  ownerUserId?: number | null;
}

const restoreState = (): Partial<RootState> | undefined => {
  const saved = loadState<PersistedState>(PERSIST_KEY);
  if (!saved) {
    clearPersonalStorage();
    return undefined;
  }
  const cachedId = saved.auth?.isAuthenticated ? saved.auth.user?.id : null;
  const hasCredentials = Boolean(tokenStorage.getAccess() || tokenStorage.getRefresh());
  const knownOwner = saved.persistenceVersion === 1 && Object.hasOwn(saved, 'ownerUserId');
  const validGuest = knownOwner && saved.ownerUserId === null
    && !saved.auth?.isAuthenticated && !saved.auth?.user;
  const validAccount = cachedId != null && hasCredentials
    && (!knownOwner || saved.ownerUserId === cachedId);

  // Las versiones antiguas guardaban carritos anónimos sin identificar su origen.
  // Si ya no hay sesión, no se pueden atribuir al visitante actual.
  if (!validGuest && !validAccount) {
    clearPersonalStorage();
    return undefined;
  }
  return {
    ...(validAccount ? { auth: { ...saved.auth!, currentUserRequestId: null } } : {}),
    ...(saved.cart ? { cart: saved.cart } : {}),
    ...(saved.favorites ? { favorites: saved.favorites } : {}),
  };
};

export const store = configureStore({
  reducer: rootReducer,
  preloadedState: restoreState(),
  devTools: import.meta.env.DEV,
});

// Solo se persiste lo necesario (sesion, carrito y favoritos); el resto se recarga del API.
const persistState = () => {
  const { auth, cart, favorites } = store.getState();
  saveState(PERSIST_KEY, {
    persistenceVersion: 1,
    ownerUserId: auth.isAuthenticated ? auth.user?.id ?? null : null,
    auth, cart, favorites,
  });
};
// Identifica también una visita nueva antes de guardar borradores fuera de Redux.
persistState();
store.subscribe(persistState);

export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
