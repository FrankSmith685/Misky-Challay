import { useDispatch, useSelector, useStore, type TypedUseSelectorHook } from 'react-redux';
import type { AppDispatch, AppStore, RootState } from './store';

/** Usa SIEMPRE estos hooks tipados en lugar de useDispatch/useSelector directos. */
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
/** Lee el estado posterior a una acción asíncrona antes de decidir el retorno. */
export const useAppStore = useStore.withTypes<AppStore>();
