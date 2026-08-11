import { Platform } from 'react-native';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

export const notificationsApi = {
  register: (input: { expoPushToken: string; deviceId?: string; appVersion?: string }) => apiRequest<{ id: number; platform: string; isActive: boolean }>(ENDPOINTS.account.mobileDevices, { method: 'POST', auth: true, body: { ...input, platform: Platform.OS } }),
  unregister: (expoPushToken: string) => apiRequest<null>(ENDPOINTS.account.mobileDevices, { method: 'DELETE', auth: true, body: { expoPushToken } }),
};
