import AsyncStorage from '@react-native-async-storage/async-storage';
import { engagementApi, type MobileUxEvent } from './api/engagement.service';

const CONSENT_KEY = 'verde-bowl.analytics-consent.v1';
const SESSION_KEY = 'verde-bowl.analytics-session.v1';

/**
 * Respuesta del cliente al consentimiento de medición.
 * `null` significa que todavía NO ha contestado: es lo que distingue a quien dijo
 * que no de quien nunca vio la pregunta, y lo que dispara el onboarding.
 */
export type AnalyticsConsent = boolean | null;

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    return (token === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });

/*
 * Caché en memoria para no tocar el almacén en cada evento.
 *
 * OJO: son variables de MÓDULO, viven mientras viva el proceso. Al cerrar sesión
 * hay que reiniciarlas con `reset()`. Sin eso, el siguiente usuario del teléfono
 * heredaba el «sí» del anterior y, peor, compartía con él el identificador de
 * sesión: los eventos de dos personas distintas acababan en la misma fila.
 */
let cachedConsent: AnalyticsConsent = null;
let consentLoaded = false;
let cachedSession: string | null = null;

const readConsent = async (): Promise<AnalyticsConsent> => {
  if (consentLoaded) return cachedConsent;
  const stored = await AsyncStorage.getItem(CONSENT_KEY);
  cachedConsent = stored === null ? null : stored === 'true';
  consentLoaded = true;
  return cachedConsent;
};

/** El identificador es del dispositivo, no del pedido: se crea una vez y se guarda. */
const readSessionId = async (): Promise<string> => {
  if (cachedSession) return cachedSession;

  const stored = await AsyncStorage.getItem(SESSION_KEY);
  if (stored) {
    cachedSession = stored;
    return stored;
  }

  const created = uuid();
  cachedSession = created;
  await AsyncStorage.setItem(SESSION_KEY, created);
  return created;
};

export const mobileAnalytics = {
  /** `true` solo si aceptó. Sin respuesta todavía no se mide nada. */
  async consent(): Promise<boolean> {
    return (await readConsent()) === true;
  },

  /**
   * La respuesta en crudo, con el `null` incluido. La usa el arranque para saber
   * si hay que preguntar; el resto de la app quiere `consent()`.
   */
  decision(): Promise<AnalyticsConsent> {
    return readConsent();
  },

  async setConsent(value: boolean): Promise<void> {
    cachedConsent = value;
    consentLoaded = true;
    await AsyncStorage.setItem(CONSENT_KEY, String(value));

    // Retirar el consentimiento no puede dejar vivo el identificador con el que
    // se venía midiendo: si más tarde vuelve a aceptar, empieza de cero.
    if (!value) {
      cachedSession = null;
      await AsyncStorage.removeItem(SESSION_KEY);
    }
  },

  async track(
    eventType: MobileUxEvent,
    metadata?: Record<string, string | number | boolean | null>,
    branchId?: number | null,
  ): Promise<void> {
    if ((await readConsent()) !== true) return;
    const sessionId = await readSessionId();
    await engagementApi.event(sessionId, eventType, metadata, branchId).catch(() => null);
  },

  /**
   * Borrado total: consentimiento, identificador y las copias en memoria.
   * La llama SessionProvider al cerrar sesión. El teléfono queda como recién
   * instalado en lo que a medición se refiere.
   */
  async reset(): Promise<void> {
    cachedConsent = null;
    consentLoaded = false;
    cachedSession = null;
    await AsyncStorage.multiRemove([CONSENT_KEY, SESSION_KEY]);
  },
};
