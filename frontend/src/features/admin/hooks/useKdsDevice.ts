import { useCallback, useEffect, useRef, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface WakeLockHandle extends EventTarget {
  released: boolean;
  release: () => Promise<void>;
}

const WAKE_KEY = 'verde-bowl:kds-keep-awake';

export const useKdsDevice = () => {
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [wakeEnabled, setWakeEnabled] = useState(() => localStorage.getItem(WAKE_KEY) !== 'off');
  const [wakeActive, setWakeActive] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  );
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    () => ('Notification' in window ? Notification.permission : 'denied'),
  );
  const wakeRef = useRef<WakeLockHandle | null>(null);

  const requestWake = useCallback(async () => {
    if (!wakeEnabled || document.visibilityState !== 'visible') return;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockHandle> } }).wakeLock;
    if (!wakeLock) return;
    try {
      wakeRef.current = await wakeLock.request('screen');
      setWakeActive(true);
      wakeRef.current.addEventListener('release', () => setWakeActive(false), { once: true });
    } catch {
      setWakeActive(false);
    }
  }, [wakeEnabled]);

  useEffect(() => {
    void requestWake();
    const onVisible = () => { if (document.visibilityState === 'visible') void requestWake(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void wakeRef.current?.release();
      wakeRef.current = null;
    };
  }, [requestWake]);

  useEffect(() => {
    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => { setIsInstalled(true); setInstallPrompt(null); };
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('beforeinstallprompt', onInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('beforeinstallprompt', onInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const toggleWake = async () => {
    const next = !wakeEnabled;
    setWakeEnabled(next);
    localStorage.setItem(WAKE_KEY, next ? 'on' : 'off');
    if (next) await requestWake();
    else {
      await wakeRef.current?.release();
      wakeRef.current = null;
      setWakeActive(false);
    }
  };

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const requestNotifications = async (): Promise<NotificationPermission> => {
    if (!('Notification' in window)) return 'denied';
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    return permission;
  };

  const notify = useCallback(async (input: { title: string; body: string; tag: string; url?: string }) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const registration = await navigator.serviceWorker?.ready.catch(() => null);
    if (registration?.active) {
      registration.active.postMessage({
        type: 'SHOW_NOTIFICATION',
        payload: { ...input, requireInteraction: true, url: input.url ?? '/admin/cocina?kds=1' },
      });
    } else {
      new Notification(input.title, { body: input.body, tag: input.tag, icon: '/favicon.svg' });
    }
    return true;
  }, []);

  return {
    isFullscreen,
    toggleFullscreen,
    wakeEnabled,
    wakeActive,
    wakeSupported: 'wakeLock' in navigator,
    toggleWake,
    notificationsSupported: 'Notification' in window,
    notificationPermission,
    requestNotifications,
    notify,
    canInstall: Boolean(installPrompt),
    isInstalled,
    install,
  };
};
