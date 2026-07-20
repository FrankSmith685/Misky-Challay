import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { Address } from '@features/geo/types';

export interface Profile {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface AddressInput {
  label: string;
  line1: string;
  reference?: string;
  districtId?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
}

export interface FoodPreferences {
  allergens: string[];
  dietaryTags: string[];
  dislikedOptionIds: number[];
  calorieTarget: number | null;
  proteinTarget: number | null;
}

export interface AccountNotification {
  id: number;
  subject: string;
  template: string;
  status: 'SENT' | 'FAILED';
  sentAt: string | null;
  createdAt: string;
  order?: { orderNumber: string; status: string } | null;
}

export const accountApi = {
  async getProfile(): Promise<Profile> {
    const { data } = await api.get<ApiSuccess<Profile>>(ENDPOINTS.account.profile);
    return data.data;
  },

  async updateProfile(input: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  }): Promise<Profile> {
    const { data } = await api.patch<ApiSuccess<Profile>>(ENDPOINTS.account.profile, input);
    return data.data;
  },

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await api.patch(ENDPOINTS.account.password, input);
  },

  async getFoodPreferences(): Promise<FoodPreferences> {
    const { data } = await api.get<ApiSuccess<FoodPreferences>>(ENDPOINTS.account.foodPreferences);
    return data.data;
  },

  async updateFoodPreferences(input: FoodPreferences): Promise<FoodPreferences> {
    const { data } = await api.put<ApiSuccess<FoodPreferences>>(ENDPOINTS.account.foodPreferences, input);
    return data.data;
  },

  async listNotifications(): Promise<AccountNotification[]> {
    const { data } = await api.get<ApiSuccess<AccountNotification[]>>(ENDPOINTS.account.notifications);
    return data.data;
  },

  async listAddresses(): Promise<Address[]> {
    const { data } = await api.get<ApiSuccess<Address[]>>(ENDPOINTS.account.addresses);
    return data.data;
  },

  async createAddress(input: AddressInput): Promise<Address> {
    const { data } = await api.post<ApiSuccess<Address>>(ENDPOINTS.account.addresses, input);
    return data.data;
  },

  async updateAddress(id: number, input: Partial<AddressInput>): Promise<Address> {
    const { data } = await api.patch<ApiSuccess<Address>>(ENDPOINTS.account.address(id), input);
    return data.data;
  },

  async deleteAddress(id: number): Promise<void> {
    await api.delete(ENDPOINTS.account.address(id));
  },
};
