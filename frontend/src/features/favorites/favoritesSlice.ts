import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * FAVORITOS (por ahora, del lado del cliente).
 *
 * El backend todavia no tiene tabla de favoritos (esta en el roadmap, M12). Para no
 * inventar un esquema que luego choque, los guardamos en el navegador (persistidos
 * junto al resto del estado). El dia que exista el endpoint, este slice se reemplaza
 * por llamadas al API sin tocar los componentes que ya usan `toggleFavorite`.
 */
export interface FavoriteItem {
  productId: number;
  slug: string;
  name: string;
  imageUrl?: string | null;
  priceFrom: number;
  type: 'FIXED' | 'CUSTOMIZABLE';
}

interface FavoritesState {
  items: FavoriteItem[];
}

const initialState: FavoritesState = { items: [] };

const favoritesSlice = createSlice({
  name: 'favorites',
  initialState,
  reducers: {
    replaceFavorites: (state, action: PayloadAction<FavoriteItem[]>) => { state.items = action.payload; },
    toggleFavorite: (state, action: PayloadAction<FavoriteItem>) => {
      const index = state.items.findIndex((item) => item.productId === action.payload.productId);
      if (index >= 0) state.items.splice(index, 1);
      else state.items.unshift(action.payload);
    },
    removeFavorite: (state, action: PayloadAction<number>) => {
      state.items = state.items.filter((item) => item.productId !== action.payload);
    },
  },
});

export const { replaceFavorites, toggleFavorite, removeFavorite } = favoritesSlice.actions;
export default favoritesSlice.reducer;
