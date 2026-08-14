import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { getApiErrorMessage } from '@services/api/client';
import { catalogApi } from './services/catalog.service';
import type { RequestStatus } from '@/types/api';
import type { Allergen, Category, DietaryTag, Product } from './types';

export interface CatalogFilters {
  search: string;
  categoryId: number | null;
  /** El constructor es una opción del menú, no una experiencia aislada. */
  productMode: 'ALL' | 'CUSTOM' | 'READY';
  dietaryTags: string[];
  excludeAllergens: string[];
  maxCalories: number | null;
  minProtein: number | null;
  /** Se resuelve en el navegador: los favoritos aun no viven en el backend (M12). */
  onlyFavorites: boolean;
}

interface CatalogState {
  products: Product[];
  categories: Category[];
  tags: DietaryTag[];
  allergens: Allergen[];
  filters: CatalogFilters;
  status: RequestStatus;
  error: string | null;
}

const initialFilters: CatalogFilters = {
  search: '',
  categoryId: null,
  productMode: 'ALL',
  dietaryTags: [],
  excludeAllergens: [],
  maxCalories: null,
  minProtein: null,
  onlyFavorites: false,
};

const initialState: CatalogState = {
  products: [],
  categories: [],
  tags: [],
  allergens: [],
  filters: initialFilters,
  status: 'idle',
  error: null,
};

/** El menu depende de la sucursal: lo que esa cocina no prepara no se ofrece (RN-005). */
export const fetchProducts = createAsyncThunk<
  Product[],
  { branchId?: number | null; filters: CatalogFilters },
  { rejectValue: string }
>('catalog/fetchProducts', async ({ branchId, filters }, { rejectWithValue }) => {
  try {
    // Se enumeran los campos porque `onlyFavorites` no viaja al API: se aplica en el cliente.
    const { search, categoryId, dietaryTags, excludeAllergens, maxCalories, minProtein } = filters;
    return await catalogApi.getProducts({
      search,
      categoryId,
      dietaryTags,
      excludeAllergens,
      maxCalories,
      minProtein,
      branchId,
    });
  } catch (error) {
    return rejectWithValue(getApiErrorMessage(error));
  }
});

export const fetchCatalogMeta = createAsyncThunk<
  { categories: Category[]; tags: DietaryTag[]; allergens: Allergen[] },
  void,
  { rejectValue: string }
>('catalog/fetchMeta', async (_, { rejectWithValue }) => {
  try {
    const [categories, tags, allergens] = await Promise.all([
      catalogApi.getCategories(),
      catalogApi.getDietaryTags(),
      catalogApi.getAllergens(),
    ]);
    return { categories, tags, allergens };
  } catch (error) {
    return rejectWithValue(getApiErrorMessage(error));
  }
});

const catalogSlice = createSlice({
  name: 'catalog',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<CatalogFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    toggleDietaryTag: (state, action: PayloadAction<string>) => {
      const code = action.payload;
      state.filters.dietaryTags = state.filters.dietaryTags.includes(code)
        ? state.filters.dietaryTags.filter((tag) => tag !== code)
        : [...state.filters.dietaryTags, code];
    },
    toggleExcludedAllergen: (state, action: PayloadAction<string>) => {
      const code = action.payload;
      state.filters.excludeAllergens = state.filters.excludeAllergens.includes(code)
        ? state.filters.excludeAllergens.filter((item) => item !== code)
        : [...state.filters.excludeAllergens, code];
    },
    toggleOnlyFavorites: (state) => {
      state.filters.onlyFavorites = !state.filters.onlyFavorites;
    },
    resetFilters: (state) => {
      state.filters = initialFilters;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.products = action.payload;
        state.error = null;
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'No se pudo cargar el menu';
      })
      .addCase(fetchCatalogMeta.fulfilled, (state, action) => {
        state.categories = action.payload.categories;
        state.tags = action.payload.tags;
        state.allergens = action.payload.allergens;
      });
  },
});

export const {
  setFilters,
  toggleDietaryTag,
  toggleExcludedAllergen,
  toggleOnlyFavorites,
  resetFilters,
} = catalogSlice.actions;

export default catalogSlice.reducer;
