import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage } from '@services/api/client';
import { adminApi } from '../services/admin.service';

const decodeVapidKey = (value: string): ArrayBuffer => {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes.buffer as ArrayBuffer;
};

export const useKitchenPush = (branchId: number | null) => {
  const [isSupported] = useState(
    () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isSupported) return;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        setIsSubscribed(Boolean(subscription));
        // Una tablet puede cambiar de cocina: la misma suscripcion se reasigna al
        // alcance activo para que no siga recibiendo pedidos del local anterior.
        if (subscription && branchId) {
          const json = subscription.toJSON();
          if (json.endpoint && json.keys?.p256dh && json.keys.auth) {
            await adminApi.subscribeKitchenPush({ branchId, endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
          }
        }
      })
      .catch(() => setIsSubscribed(false));
  }, [branchId, isSupported]);

  const enable = useCallback(async () => {
    if (!branchId || !isSupported) return false;
    setIsBusy(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Debes permitir las notificaciones en este dispositivo.');
      const config = await adminApi.kitchenPushConfig();
      if (!config.enabled || !config.publicKey) throw new Error('Web Push todavía no está configurado en el servidor.');
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      subscription ??= await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(config.publicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('El navegador no devolvió una suscripción válida.');
      await adminApi.subscribeKitchenPush({
        branchId,
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setIsSubscribed(true);
      return true;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : getApiErrorMessage(requestError));
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [branchId, isSupported]);

  const disable = useCallback(async () => {
    if (!isSupported) return;
    setIsBusy(true);
    setError('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await adminApi.unsubscribeKitchenPush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }, [isSupported]);

  return { isSupported, isSubscribed, isBusy, error, enable, disable };
};
