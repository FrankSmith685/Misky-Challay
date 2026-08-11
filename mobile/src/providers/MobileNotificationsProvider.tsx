import * as Application from 'expo-application';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { router, type Href } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { notificationsApi } from '../services/api/notifications.service';
import { pushStorage } from '../services/session/pushStorage';
import { useSession } from './SessionProvider';

type NotificationsModule = typeof import('expo-notifications');
type PushStatus = 'disabled' | 'enabled' | 'unsupported' | 'configuration-required' | 'busy';

interface Value {
  status: PushStatus;
  error: string;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

const Context = createContext<Value | null>(null);
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const projectId =
  process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
  Constants.easConfig?.projectId ||
  Constants.expoConfig?.extra?.eas?.projectId;

let notificationsPromise: Promise<NotificationsModule> | null = null;

/**
 * Expo Go elimina el soporte push remoto en Android y el módulo arroja al evaluarse.
 * La importación diferida permite usar el resto de la app en Expo Go sin romper el
 * árbol de rutas; el development build sí carga el módulo nativo completo.
 */
const loadNotifications = (): Promise<NotificationsModule | null> => {
  if (isExpoGo) return Promise.resolve(null);
  notificationsPromise ??= import('expo-notifications');
  return notificationsPromise;
};

const deviceId = async () =>
  Platform.OS === 'android'
    ? Application.getAndroidId()
    : (await Application.getIosIdForVendorAsync()) ?? Application.applicationId ?? undefined;

const requiresFirebaseConfiguration = (message: string) =>
  /firebase messaging|googleServicesFile|FirebaseApp/i.test(message);

export function MobileNotificationsProvider({ children }: { children: ReactNode }) {
  const { status: sessionStatus } = useSession();
  const [status, setStatus] = useState<PushStatus>(isExpoGo ? 'unsupported' : 'disabled');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let removeListener: (() => void) | undefined;

    void loadNotifications()
      .then((Notifications) => {
        if (!active || !Notifications) return;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
        if (Platform.OS === 'android') {
          void Notifications.setNotificationChannelAsync('order-updates', {
            name: 'Estado de pedidos',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 180, 250],
            lightColor: '#237c52',
          });
        }
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const actionUrl = response.notification.request.content.data?.actionUrl;
          if (typeof actionUrl !== 'string' || !/^\/order\/[A-Za-z0-9-]+$/.test(actionUrl)) return;
          const orderNumber = actionUrl.split('/').pop()!;
          router.push({ pathname: '/order/[orderNumber]', params: { orderNumber } } as Href);
        });
        removeListener = () => subscription.remove();
      })
      .catch(() => {
        if (active) {
          setStatus('unsupported');
          setError('Este cliente no incluye el módulo nativo de notificaciones.');
        }
      });

    return () => {
      active = false;
      removeListener?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (isExpoGo) {
      setStatus('unsupported');
      return () => { active = false; };
    }
    void pushStorage.read().then(async (token) => {
      if (!active) return;
      if (!token) {
        setStatus(Device.isDevice ? 'disabled' : 'unsupported');
        return;
      }
      setStatus('enabled');
      if (sessionStatus === 'authenticated') {
        await notificationsApi.register({
          expoPushToken: token,
          deviceId: await deviceId(),
          appVersion: Application.nativeApplicationVersion ?? undefined,
        }).catch(() => undefined);
      }
    });
    return () => { active = false; };
  }, [sessionStatus]);

  const enable = useCallback(async () => {
    setError('');
    if (isExpoGo) {
      setStatus('unsupported');
      setError('Instala el development build para activar notificaciones remotas.');
      return;
    }
    if (!Device.isDevice) {
      setStatus('unsupported');
      setError('Las notificaciones remotas requieren un teléfono físico.');
      return;
    }
    if (!projectId || projectId === 'REPLACE_WITH_EAS_PROJECT_ID') {
      setError('Falta el projectId de EAS para registrar este dispositivo.');
      return;
    }

    setStatus('busy');
    try {
      const Notifications = await loadNotifications();
      if (!Notifications) throw new Error('Las notificaciones requieren el development build.');
      const current = await Notifications.getPermissionsAsync();
      const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
      if (!permission.granted) {
        throw new Error('El permiso de notificaciones fue rechazado en el teléfono.');
      }
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await notificationsApi.register({
        expoPushToken: token,
        deviceId: await deviceId(),
        appVersion: Application.nativeApplicationVersion ?? undefined,
      });
      await pushStorage.write(token);
      setStatus('enabled');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      if (requiresFirebaseConfiguration(message)) {
        setStatus('configuration-required');
        setError('Esta versión de prueba todavía no incluye la conexión de Firebase para Android.');
      } else {
        setStatus('disabled');
        setError(message || 'No pudimos activar las notificaciones.');
      }
    }
  }, []);

  const disable = useCallback(async () => {
    setStatus('busy');
    setError('');
    const token = await pushStorage.read();
    try {
      if (token && sessionStatus === 'authenticated') await notificationsApi.unregister(token);
    } finally {
      await pushStorage.clear();
      setStatus('disabled');
    }
  }, [sessionStatus]);

  const value = useMemo(() => ({ status, error, enable, disable }), [disable, enable, error, status]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useMobileNotifications = () => {
  const value = useContext(Context);
  if (!value) throw new Error('useMobileNotifications requiere su provider');
  return value;
};
