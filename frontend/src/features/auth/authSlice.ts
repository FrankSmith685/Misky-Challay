import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api, getApiErrorMessage, tokenStorage } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess, RequestStatus } from '@/types/api';
import type { User } from '@/types/domain';

interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  status: RequestStatus;
  error: string | null;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  status: 'idle',
  error: null,
};

export const login = createAsyncThunk<
  AuthResponse,
  { email: string; password: string },
  { rejectValue: string }
>('auth/login', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post<ApiSuccess<AuthResponse>>(ENDPOINTS.auth.login, credentials);
    tokenStorage.set(data.data.accessToken, data.data.refreshToken);
    return data.data;
  } catch (error) {
    return rejectWithValue(getApiErrorMessage(error));
  }
});

// Recuperacion de contrasena. Ninguno de los dos autentica ni toca la sesion: solo
// devuelven el mensaje del backend, asi que no necesitan extraReducers.
export const requestPasswordReset = createAsyncThunk<
  string,
  { email: string },
  { rejectValue: string }
>('auth/forgotPassword', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post<ApiSuccess<null>>(ENDPOINTS.auth.forgotPassword, payload);
    return data.message;
  } catch (error) {
    return rejectWithValue(getApiErrorMessage(error));
  }
});

export const resetPassword = createAsyncThunk<
  string,
  { token: string; password: string },
  { rejectValue: string }
>('auth/resetPassword', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post<ApiSuccess<null>>(ENDPOINTS.auth.resetPassword, payload);
    return data.message;
  } catch (error) {
    return rejectWithValue(getApiErrorMessage(error));
  }
});

export const register = createAsyncThunk<
  AuthResponse,
  {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    acceptedTerms: boolean;
  },
  { rejectValue: string }
>('auth/register', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post<ApiSuccess<AuthResponse>>(ENDPOINTS.auth.register, payload);
    tokenStorage.set(data.data.accessToken, data.data.refreshToken);
    return data.data;
  } catch (error) {
    return rejectWithValue(getApiErrorMessage(error));
  }
});

export const fetchCurrentUser = createAsyncThunk<User, void, { rejectValue: string }>(
  'auth/me',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.get<ApiSuccess<User>>(ENDPOINTS.auth.me);
      return data.data;
    } catch (error) {
      return rejectWithValue(getApiErrorMessage(error));
    }
  },
);

/**
 * Cierre de sesion "completo": avisa al backend (para revocar el refresh token) y,
 * pase lo que pase, limpia la sesion local. Nunca falla de cara al usuario.
 */
export const logoutUser = createAsyncThunk<void, void>('auth/logoutUser', async (_, { dispatch }) => {
  try {
    await api.post(ENDPOINTS.auth.logout);
  } catch {
    // Best-effort: aunque el backend no responda, cerramos la sesion en el cliente.
  } finally {
    dispatch(logout());
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      tokenStorage.clear();
      state.user = null;
      state.isAuthenticated = false;
      state.status = 'idle';
      state.error = null;
    },
    setUser: (state, action: PayloadAction<User>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload.user;
        state.isAuthenticated = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'No se pudo iniciar sesion';
      })
      .addCase(register.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.user = action.payload.user;
        state.isAuthenticated = true;
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'No se pudo crear la cuenta';
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.user = null;
        state.isAuthenticated = false;
      });
  },
});

export const { logout, setUser } = authSlice.actions;
export default authSlice.reducer;
