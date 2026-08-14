import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { Address } from '@features/geo/types';

export interface Profile {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface AddressInput {
  label: string;
  line1: string;
  reference?: string;
  districtId?: number | null;
  ubigeoCode?: string | null;
  departmentName?: string | null;
  provinceName?: string | null;
  districtName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isDefault?: boolean;
}

/**
 * Contexto de compra del servidor: donde se quedo el cliente la ultima vez.
 * `source` dice si es su eleccion real (SAVED) o una suposicion nuestra a partir
 * de su direccion principal (DEFAULT_ADDRESS).
 */
export interface PurchaseContextPayload {
  source: 'SAVED' | 'DEFAULT_ADDRESS' | 'EMPTY';
  deliveryType: 'DELIVERY' | 'PICKUP';
  cityId: number | null;
  branch: { id: number; name: string; addressLine: string } | null;
  address: Address | null;
}

/** Lo que devuelve DELETE /account: que se llevo la baja y que se queda. */
export interface DeleteAccountSummary {
  deletedAt: string;
  /** Pedidos y comprobantes que se conservan por obligacion tributaria (SUNAT). */
  keptOrders: number;
  /** Saldo de billetera que se pierde al cerrar la cuenta. */
  forfeitedWalletBalance: number;
  removed: {
    addresses: number;
    savedBowls: number;
    favorites: number;
    availabilityAlerts: number;
    devices: number;
  };
}

export interface PurchaseContextInput {
  deliveryType: 'DELIVERY' | 'PICKUP';
  cityId?: number | null;
  branchId?: number | null;
  addressId?: number | null;
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
  readAt: string | null;
  createdAt: string;
  /** Destino al pulsar el aviso (p. ej. la ficha del plato que volvio a haber). */
  actionUrl?: string | null;
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

  async updateAvatar(input: {
    fileName: string;
    mimeType: 'image/webp' | 'image/jpeg' | 'image/png';
    dataUrl: string;
  }): Promise<Profile> {
    const { data } = await api.post<ApiSuccess<Profile>>(ENDPOINTS.account.profileAvatar, input);
    return data.data;
  },

  async removeAvatar(): Promise<Profile> {
    const { data } = await api.delete<ApiSuccess<Profile>>(ENDPOINTS.account.profileAvatar);
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
    const { data } = await api.put<ApiSuccess<FoodPreferences>>(
      ENDPOINTS.account.foodPreferences,
      input,
    );
    return data.data;
  },

  async listNotifications(): Promise<AccountNotification[]> {
    const { data } = await api.get<ApiSuccess<AccountNotification[]>>(
      ENDPOINTS.account.notifications,
    );
    return data.data;
  },

  async markNotificationsRead(): Promise<void> {
    await api.patch(ENDPOINTS.account.notificationsRead);
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

  async getPurchaseContext(): Promise<PurchaseContextPayload> {
    const { data } = await api.get<ApiSuccess<PurchaseContextPayload>>(
      ENDPOINTS.account.purchaseContext,
    );
    return data.data;
  },

  async savePurchaseContext(input: PurchaseContextInput): Promise<PurchaseContextPayload> {
    const { data } = await api.put<ApiSuccess<PurchaseContextPayload>>(
      ENDPOINTS.account.purchaseContext,
      input,
    );
    return data.data;
  },

  /**
   * Baja de la cuenta, irreversible. El backend reautentica con la contrasena y
   * comparte limitador con el login (20 intentos / 15 min), asi que un 429 aqui
   * puede venir de intentos de acceso previos.
   */
  async deleteAccount(input: { password: string; reason?: string }): Promise<DeleteAccountSummary> {
    const { data } = await api.delete<ApiSuccess<DeleteAccountSummary>>(
      ENDPOINTS.account.delete,
      { data: input },
    );
    return data.data;
  },
};
