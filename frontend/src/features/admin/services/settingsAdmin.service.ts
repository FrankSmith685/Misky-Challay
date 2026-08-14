import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { BusinessInfo } from '@services/businessInfo';

export interface BusinessSettingsState {
  business: BusinessInfo;
  source: 'database' | 'environment';
  isConfigured: boolean;
  updatedAt: string | null;
  updatedBy?: number | null;
}

export interface CommunicationSettings {
  emailNotificationsEnabled: boolean;
  inAppNotificationsEnabled: boolean;
  orderUpdatesEnabled: boolean;
  planUpdatesEnabled: boolean;
  staffAccessEnabled: boolean;
  availabilityAlertsEnabled: boolean;
  availabilityEmailSubject: string;
  availabilityEmailBody: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  smtpPasswordConfigured: boolean;
  deliveryMode: 'smtp' | 'console' | 'unavailable';
}

export interface CommunicationSettingsInput extends Omit<CommunicationSettings, 'smtpPasswordConfigured' | 'deliveryMode'> {
  smtpPassword?: string;
  clearSmtpPassword?: boolean;
}

export interface CommunicationSettingsState {
  communication: CommunicationSettings;
  source: 'database' | 'environment';
  isConfigured: boolean;
  updatedAt: string | null;
  updatedBy?: number | null;
}

export interface NotificationHistoryItem {
  id: number;
  channel: string;
  template: string;
  recipient: string;
  subject: string;
  status: 'SENT' | 'FAILED';
  provider: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

export interface NotificationOverview {
  totals: { sent: number; failed: number };
  recent: NotificationHistoryItem[];
}

export interface LocalPaymentSettings {
  yapeEnabled: boolean;
  yapePhone: string;
  yapeRecipient: string;
  yapeQrImageUrl: string;
  plinEnabled: boolean;
  plinPhone: string;
  plinRecipient: string;
  plinQrImageUrl: string;
  instructions: string;
}

export interface LocalPaymentSettingsState {
  localPayments: LocalPaymentSettings;
  isConfigured: boolean;
  updatedAt: string | null;
  updatedBy?: number | null;
}

export type ReceiptMode = 'INTERNAL_ONLY' | 'EXTERNAL_MANUAL' | 'INTEGRATED';

export interface ReceiptSettings {
  mode: ReceiptMode;
  autoPrintKitchenTicket: boolean;
  autoPrintCustomerTicket: boolean;
  paperWidth: 58 | 80;
}

export interface ReceiptSettingsState {
  receipts: ReceiptSettings;
  isConfigured: boolean;
  updatedAt: string | null;
  updatedBy?: number | null;
}

export const settingsAdminApi = {
  async getBusiness(): Promise<BusinessSettingsState> {
    const { data } = await api.get<ApiSuccess<BusinessSettingsState>>(ENDPOINTS.settings.business);
    return data.data;
  },

  async updateBusiness(input: BusinessInfo): Promise<BusinessSettingsState> {
    const { data } = await api.put<ApiSuccess<BusinessSettingsState>>(
      ENDPOINTS.settings.business,
      input,
    );
    return data.data;
  },

  async getLocalPayments(): Promise<LocalPaymentSettingsState> {
    const { data } = await api.get<ApiSuccess<LocalPaymentSettingsState>>(ENDPOINTS.settings.localPayments);
    return data.data;
  },

  async updateLocalPayments(input: LocalPaymentSettings): Promise<LocalPaymentSettingsState> {
    const { data } = await api.put<ApiSuccess<LocalPaymentSettingsState>>(ENDPOINTS.settings.localPayments, input);
    return data.data;
  },

  async getReceipts(): Promise<ReceiptSettingsState> {
    const { data } = await api.get<ApiSuccess<ReceiptSettingsState>>(ENDPOINTS.settings.receipts);
    return data.data;
  },

  async updateReceipts(input: ReceiptSettings): Promise<ReceiptSettingsState> {
    const { data } = await api.put<ApiSuccess<ReceiptSettingsState>>(ENDPOINTS.settings.receipts, input);
    return data.data;
  },

  async getCommunication(): Promise<CommunicationSettingsState> {
    const { data } = await api.get<ApiSuccess<CommunicationSettingsState>>(ENDPOINTS.settings.communication);
    return data.data;
  },

  async updateCommunication(input: CommunicationSettingsInput): Promise<CommunicationSettingsState> {
    const { data } = await api.put<ApiSuccess<CommunicationSettingsState>>(
      ENDPOINTS.settings.communication,
      input,
    );
    return data.data;
  },

  async sendTestEmail(recipient: string): Promise<{ provider: string; messageId: string }> {
    const { data } = await api.post<ApiSuccess<{ provider: string; messageId: string }>>(
      ENDPOINTS.settings.communicationTest,
      { recipient },
    );
    return data.data;
  },

  async getNotificationHistory(): Promise<NotificationOverview> {
    const { data } = await api.get<ApiSuccess<NotificationOverview>>(ENDPOINTS.settings.notificationHistory);
    return data.data;
  },
};
