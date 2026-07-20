import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  theme: 'light' | 'dark';
  isMobileMenuOpen: boolean;
  globalLoading: boolean;
}

const initialState: UiState = {
  theme: 'light',
  isMobileMenuOpen: false,
  globalLoading: false,
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
    },
    setMobileMenu: (state, action: PayloadAction<boolean>) => {
      state.isMobileMenuOpen = action.payload;
    },
    setGlobalLoading: (state, action: PayloadAction<boolean>) => {
      state.globalLoading = action.payload;
    },
  },
});

export const { toggleTheme, setMobileMenu, setGlobalLoading } = uiSlice.actions;
export default uiSlice.reducer;
