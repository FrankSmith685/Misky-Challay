import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'verde-bowl.expo-push-token.v1';

/**
 * Token de Expo con el que este teléfono recibe los avisos del pedido.
 *
 * Es dato de la SESIÓN, no del dispositivo: mientras siga guardado, el servidor
 * puede seguir enviando a este aparato el número y el estado de los pedidos de
 * quien lo registró. Por eso `clear()` forma parte del borrado del cierre de
 * sesión y no solo de «desactivar notificaciones».
 */
export const pushStorage = {
  read(): Promise<string | null> {
    return AsyncStorage.getItem(KEY);
  },

  write(token: string): Promise<void> {
    return AsyncStorage.setItem(KEY, token);
  },

  clear(): Promise<void> {
    return AsyncStorage.removeItem(KEY);
  },
};
