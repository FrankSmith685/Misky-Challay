import type {
  AccountNotification,
  AccountNotificationsFeed,
  Address,
  AvailabilityAlert,
  AvailabilityAlertInput,
  DeleteAccountSummary,
  FoodPreferences,
  Profile,
  ProfileInput,
  PurchaseContext,
  PurchaseContextInput,
  SavedBowl,
  SavedBowlInput,
} from '../../types/domain';
import { apiRequest } from './client';
import { ENDPOINTS } from './endpoints';

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

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export const accountApi = {
  profile: () => apiRequest<Profile>(ENDPOINTS.account.profile, { auth: true }),

  updateProfile: (input: ProfileInput) =>
    apiRequest<Profile>(ENDPOINTS.account.profile, { method: 'PATCH', body: input, auth: true }),

  updateAvatar: (input: {
    fileName: string;
    mimeType: 'image/webp' | 'image/jpeg' | 'image/png';
    dataUrl: string;
  }) =>
    apiRequest<Profile>(ENDPOINTS.account.profileAvatar, {
      method: 'POST',
      body: input,
      auth: true,
    }),

  removeAvatar: () =>
    apiRequest<Profile>(ENDPOINTS.account.profileAvatar, { method: 'DELETE', auth: true }),

  changePassword: (input: ChangePasswordInput) =>
    apiRequest<null>(ENDPOINTS.account.password, { method: 'PATCH', body: input, auth: true }),

  /**
   * La campana. El backend no publica un contador aparte, así que el número de
   * pendientes sale de la misma lista y se entrega ya resuelto.
   */
  async notifications(): Promise<AccountNotificationsFeed> {
    const items = await apiRequest<AccountNotification[]>(ENDPOINTS.account.notifications, {
      auth: true,
    });
    return {
      items,
      unreadCount: items.filter((item) => item.readAt === null).length,
    };
  },

  markNotificationsRead: () =>
    apiRequest<null>(ENDPOINTS.account.notificationsRead, { method: 'PATCH', auth: true }),

  foodPreferences: () =>
    apiRequest<FoodPreferences>(ENDPOINTS.account.foodPreferences, { auth: true }),

  /** PUT reemplaza el conjunto entero: manda siempre las cuatro listas completas. */
  saveFoodPreferences: (input: FoodPreferences) =>
    apiRequest<FoodPreferences>(ENDPOINTS.account.foodPreferences, {
      method: 'PUT',
      body: input,
      auth: true,
    }),

  purchaseContext: () =>
    apiRequest<PurchaseContext>(ENDPOINTS.account.purchaseContext, { auth: true }),

  savePurchaseContext: (input: PurchaseContextInput) =>
    apiRequest<PurchaseContext>(ENDPOINTS.account.purchaseContext, {
      method: 'PUT',
      body: input,
      auth: true,
    }),

  addresses: () => apiRequest<Address[]>(ENDPOINTS.account.addresses, { auth: true }),

  createAddress: (input: AddressInput) =>
    apiRequest<Address>(ENDPOINTS.account.addresses, { method: 'POST', body: input, auth: true }),

  updateAddress: (id: number, input: Partial<AddressInput>) =>
    apiRequest<Address>(ENDPOINTS.account.address(id), {
      method: 'PATCH',
      body: input,
      auth: true,
    }),

  deleteAddress: (id: number) =>
    apiRequest<null>(ENDPOINTS.account.address(id), { method: 'DELETE', auth: true }),

  savedBowls: () => apiRequest<SavedBowl[]>(ENDPOINTS.account.savedBowls, { auth: true }),

  /** El backend revalida la receta con el mismo motor del carrito antes de guardarla. */
  createSavedBowl: (input: SavedBowlInput) =>
    apiRequest<SavedBowl>(ENDPOINTS.account.savedBowls, { method: 'POST', body: input, auth: true }),

  updateSavedBowl: (id: number, input: Partial<SavedBowlInput>) =>
    apiRequest<SavedBowl>(ENDPOINTS.account.savedBowl(id), {
      method: 'PATCH',
      body: input,
      auth: true,
    }),

  deleteSavedBowl: (id: number) =>
    apiRequest<null>(ENDPOINTS.account.savedBowl(id), { method: 'DELETE', auth: true }),

  /**
   * Aviso de vuelta a stock del plato agotado, por producto y sede.
   * Devuelve `null` cuando el cliente no está apuntado.
   */
  availabilityAlert: (productId: number, branchId: number) =>
    apiRequest<AvailabilityAlert | null>(ENDPOINTS.account.availabilityAlerts, {
      auth: true,
      query: { productId, branchId },
    }),

  subscribeAvailabilityAlert: (input: AvailabilityAlertInput) =>
    apiRequest<AvailabilityAlert>(ENDPOINTS.account.availabilityAlerts, {
      method: 'POST',
      body: input,
      auth: true,
    }),

  cancelAvailabilityAlert: (productId: number, branchId: number) =>
    apiRequest<null>(ENDPOINTS.account.availabilityAlerts, {
      method: 'DELETE',
      auth: true,
      query: { productId, branchId },
    }),

  /**
   * Baja de la cuenta, irreversible. Exige reautenticarse con la contraseña.
   * El motivo es opcional (máx. 300 caracteres) y solo va a la bitácora.
   *
   * Comparte limitador con el login (20 intentos / 15 min), así que un 429 aquí
   * puede venir de intentos de acceso previos.
   */
  deleteAccount: (password: string, reason?: string) =>
    apiRequest<DeleteAccountSummary>(ENDPOINTS.account.delete, {
      method: 'DELETE',
      body: { password, reason },
      auth: true,
    }),
};
