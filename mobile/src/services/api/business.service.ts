import { Platform } from 'react-native';
import type { PublicSettings } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export const businessApi = {
  /**
   * La plataforma viaja porque `mobile.updateUrl` se resuelve por tienda: sin
   * ella el servidor devuelve el enlace genérico (la web) y el botón «Actualizar»
   * no llevaría a Play Store ni a App Store. Cualquier valor distinto de
   * 'android' o 'ios' se ignora sin error.
   */
  publicSettings: () =>
    apiRequest<PublicSettings>(ENDPOINTS.settings.public, {
      query: { platform: Platform.OS },
    }),
};
