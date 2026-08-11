import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'verde-bowl.access-token';
const REFRESH_TOKEN_KEY = 'verde-bowl.refresh-token';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

export const secureSession = {
  async read(): Promise<StoredSession | null> {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]);
    return accessToken && refreshToken ? { accessToken, refreshToken } : null;
  },

  async write(session: StoredSession): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken),
    ]);
  },

  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  },
};
