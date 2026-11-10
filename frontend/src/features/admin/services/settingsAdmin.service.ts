import { api } from '@services/api/client';
import { ENDPOINTS } from '@services/api/endpoints';
import type { ApiSuccess } from '@/types/api';
import type { BusinessInfo } from '@services/businessInfo';
import type { ThemeTokens } from '@/theme/tokens';

export interface BusinessSettingsState {
  business: BusinessInfo;
  source: 'database' | 'environment';
  isConfigured: boolean;
  updatedAt: string | null;
  updatedBy?: number | null;
  version: number;
}

export interface CommunicationSettings {
  emailNotificationsEnabled: boolean;
  inAppNotificationsEnabled: boolean;
  orderUpdatesEnabled: boolean;
  whatsappUpdatesEnabled: boolean;
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
  version: number;
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

export interface IntegrationStatus {
  checkedAt: string;
  integrations: Array<{
    key: string;
    name: string;
    provider: string;
    status: 'READY' | 'ACTION_REQUIRED' | 'DEVELOPMENT';
    detail: string;
  }>;
}

export interface LocalPaymentSettings {
  paymentWindowMinutes?: number;
  reviewAlertMinutes?: number;
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
  version: number;
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
  version: number;
}

export interface SettingRevision {
  id: number;
  scope: 'business' | 'local-payments' | 'receipts' | 'communication' | 'theme';
  version: number;
  actorId: number | null;
  reason: string;
  createdAt: string;
}

export interface ThemeAdminState {
  draft: ThemeTokens;
  published: ThemeTokens;
  draftVersion: number;
  publishedVersion: number;
  updatedAt: string | null;
  updatedBy?: number | null;
  publishedBy?: number | null;
  source: 'database' | 'default';
}

export const settingsAdminApi = {
  async getTheme(): Promise<{ tokens: ThemeTokens }> {
    const { data } = await api.get<ApiSuccess<{ tokens: ThemeTokens }>>(ENDPOINTS.settings.theme);
    return data.data;
  },

  async getThemeAdmin(): Promise<ThemeAdminState> {
    const { data } = await api.get<ApiSuccess<ThemeAdminState>>(ENDPOINTS.settings.themeAdmin);
    return data.data;
  },

  async saveThemeDraft(tokens: ThemeTokens, expectedVersion?: number): Promise<ThemeAdminState> {
    const { data } = await api.put<ApiSuccess<ThemeAdminState>>(ENDPOINTS.settings.themeDraft, { ...tokens, expectedVersion });
    return data.data;
  },

  async publishTheme(expectedVersion?: number): Promise<ThemeAdminState> {
    const { data } = await api.post<ApiSuccess<ThemeAdminState>>(ENDPOINTS.settings.themePublish, { expectedVersion });
    return data.data;
  },

  async resetTheme(expectedVersion?: number): Promise<ThemeAdminState> {
    const { data } = await api.post<ApiSuccess<ThemeAdminState>>(ENDPOINTS.settings.themeReset, { expectedVersion });
    return data.data;
  },

  async themeRevisions(): Promise<SettingRevision[]> {
    const { data } = await api.get<ApiSuccess<SettingRevision[]>>(ENDPOINTS.settings.themeRevisions);
    return data.data;
  },

  async rollbackTheme(revisionId: number, expectedVersion?: number): Promise<ThemeAdminState> {
    const { data } = await api.post<ApiSuccess<ThemeAdminState>>(ENDPOINTS.settings.themeRollback(revisionId), { expectedVersion });
    return data.data;
  },

  async getBusiness(): Promise<BusinessSettingsState> {
    const { data } = await api.get<ApiSuccess<BusinessSettingsState>>(ENDPOINTS.settings.business);
    return data.data;
  },

  async updateBusiness(input: BusinessInfo, expectedVersion?: number): Promise<BusinessSettingsState> {
    const { data } = await api.put<ApiSuccess<BusinessSettingsState>>(
      ENDPOINTS.settings.business,
      { ...input, expectedVersion },
    );
    return data.data;
  },

  async getLocalPayments(): Promise<LocalPaymentSettingsState> {
    const { data } = await api.get<ApiSuccess<LocalPaymentSettingsState>>(ENDPOINTS.settings.localPayments);
    return data.data;
  },

  async updateLocalPayments(input: LocalPaymentSettings, expectedVersion?: number): Promise<LocalPaymentSettingsState> {
    const { data } = await api.put<ApiSuccess<LocalPaymentSettingsState>>(ENDPOINTS.settings.localPayments, { ...input, expectedVersion });
    return data.data;
  },

  async checkLocalPayments(): Promise<{ providers: Array<{ provider: 'yape' | 'plin'; enabled: boolean; valid: boolean; qrConfigured: boolean }>; checkedAt: string }> {
    const { data } = await api.post<ApiSuccess<{ providers: Array<{ provider: 'yape' | 'plin'; enabled: boolean; valid: boolean; qrConfigured: boolean }>; checkedAt: string }>>(ENDPOINTS.settings.localPaymentsCheck);
    return data.data;
  },

  async getReceipts(): Promise<ReceiptSettingsState> {
    const { data } = await api.get<ApiSuccess<ReceiptSettingsState>>(ENDPOINTS.settings.receipts);
    return data.data;
  },

  async updateReceipts(input: ReceiptSettings, expectedVersion?: number): Promise<ReceiptSettingsState> {
    const { data } = await api.put<ApiSuccess<ReceiptSettingsState>>(ENDPOINTS.settings.receipts, { ...input, expectedVersion });
    return data.data;
  },

  async getCommunication(): Promise<CommunicationSettingsState> {
    const { data } = await api.get<ApiSuccess<CommunicationSettingsState>>(ENDPOINTS.settings.communication);
    return data.data;
  },

  async updateCommunication(input: CommunicationSettingsInput, expectedVersion?: number): Promise<CommunicationSettingsState> {
    const { data } = await api.put<ApiSuccess<CommunicationSettingsState>>(
      ENDPOINTS.settings.communication,
      { ...input, expectedVersion },
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

  async getIntegrations(): Promise<IntegrationStatus> {
    const { data } = await api.get<ApiSuccess<IntegrationStatus>>(ENDPOINTS.settings.integrations);
    return data.data;
  },

  async checkIntegrations(): Promise<IntegrationStatus> {
    const { data } = await api.post<ApiSuccess<IntegrationStatus>>(ENDPOINTS.settings.integrationsCheck);
    return data.data;
  },

  async revisions(scope: SettingRevision['scope']): Promise<SettingRevision[]> {
    const { data } = await api.get<ApiSuccess<SettingRevision[]>>(`/settings/revisions/${scope}`);
    return data.data;
  },

  async rollback(scope: SettingRevision['scope'], revisionId: number, expectedVersion?: number): Promise<void> {
    await api.post(`/settings/revisions/${scope}/${revisionId}/rollback`, { expectedVersion });
  },
};
