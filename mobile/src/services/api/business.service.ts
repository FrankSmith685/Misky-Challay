import type { PublicSettings } from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export const businessApi = {
  publicSettings: () => apiRequest<PublicSettings>(ENDPOINTS.settings.public),
};
