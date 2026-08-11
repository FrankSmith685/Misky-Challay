import AsyncStorage from '@react-native-async-storage/async-storage';
import { engagementApi, type MobileUxEvent } from './api/engagement.service';

const CONSENT_KEY = 'verde-bowl.analytics-consent.v1';
const SESSION_KEY = 'verde-bowl.analytics-session.v1';

const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
  const random = Math.floor(Math.random() * 16);
  return (token === 'x' ? random : (random & 0x3) | 0x8).toString(16);
});

let cachedConsent: boolean | null = null;
let cachedSession: string | null = null;

export const mobileAnalytics = {
  async consent() {
    if (cachedConsent !== null) return cachedConsent;
    cachedConsent = (await AsyncStorage.getItem(CONSENT_KEY)) === 'true';
    return cachedConsent;
  },
  async setConsent(value: boolean) {
    cachedConsent = value;
    await AsyncStorage.setItem(CONSENT_KEY, String(value));
  },
  async track(eventType: MobileUxEvent, metadata?: Record<string, string | number | boolean | null>, branchId?: number | null) {
    if (!(await this.consent())) return;
    if (!cachedSession) {
      cachedSession = await AsyncStorage.getItem(SESSION_KEY);
      if (!cachedSession) { cachedSession = uuid(); await AsyncStorage.setItem(SESSION_KEY, cachedSession); }
    }
    await engagementApi.event(cachedSession, eventType, metadata, branchId).catch(() => null);
  },
};
