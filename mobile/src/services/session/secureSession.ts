import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'verde-bowl.access-token';
const REFRESH_TOKEN_KEY = 'verde-bowl.refresh-token';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
}

// SecureStore cruza el puente nativo y lee el almacén cifrado del sistema. Hacer
// esas dos lecturas antes de CADA request volvía especialmente lento el panel de
// superadministración, que encadena varias consultas. La memoria es la fuente
// rápida durante la sesión; write/clear mantienen ambas fuentes sincronizadas.
let memorySession: StoredSession | null | undefined;
let pendingRead: Promise<StoredSession | null> | null = null;

export const secureSession = {
  async read(): Promise<StoredSession | null> {
    if (memorySession !== undefined) return memorySession;
    pendingRead ??= Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    ]).then(([accessToken, refreshToken]) => {
      memorySession = accessToken && refreshToken ? { accessToken, refreshToken } : null;
      pendingRead = null;
      return memorySession;
    }, (error: unknown) => {
      pendingRead = null;
      throw error;
    });
    return pendingRead;
  },

  async write(session: StoredSession): Promise<void> {
    memorySession = session;
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken),
    ]);
  },

  async clear(): Promise<void> {
    memorySession = null;
    pendingRead = null;
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    ]);
  },
};
