import { useCallback, useEffect, useRef, useState } from 'react';
import type { KitchenBoard, KitchenTicket } from '../types';

const STORAGE_KEY = 'verde-bowl.admin.kitchen-alert';
const HIGHLIGHT_MS = 25_000;

const playChime = (context: AudioContext): void => {
  const start = context.currentTime;

  [880, 1175].forEach((frequency, index) => {
    const at = start + index * 0.19;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.18);
  });
};

export const useNewOrderAlert = (
  board: KitchenBoard | null,
  onIncoming?: (tickets: KitchenTicket[]) => void,
) => {
  const [isEnabled, setIsEnabled] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'off');
  const [freshIds, setFreshIds] = useState<number[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  const seenRef = useRef<Set<number> | null>(null);
  const onIncomingRef = useRef(onIncoming);
  onIncomingRef.current = onIncoming;

  useEffect(() => {
    const unlock = () => {
      if (!contextRef.current && typeof window.AudioContext === 'function') {
        contextRef.current = new window.AudioContext();
      }
      void contextRef.current?.resume();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };

    document.addEventListener('pointerdown', unlock);
    document.addEventListener('keydown', unlock);

    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      void contextRef.current?.close();
      contextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!board) {
      seenRef.current = null;
      setFreshIds([]);
      return;
    }

    const queued = board.tickets
      .filter((ticket) => ticket.status === 'QUEUED')
      .map((ticket) => ticket.id);

    if (seenRef.current === null) {
      seenRef.current = new Set(queued);
      return;
    }

    const seen = seenRef.current;
    const incoming = queued.filter((id) => !seen.has(id));
    queued.forEach((id) => seen.add(id));
    if (incoming.length === 0) return;

    setFreshIds((previous) => [...new Set([...previous, ...incoming])]);
    onIncomingRef.current?.(board.tickets.filter((ticket) => incoming.includes(ticket.id)));

    if (!isEnabled) return;
    if (contextRef.current) {
      void contextRef.current.resume();
      playChime(contextRef.current);
    }
    navigator.vibrate?.([140, 70, 140]);
  }, [board, isEnabled]);

  useEffect(() => {
    if (freshIds.length === 0) return undefined;
    const timer = setTimeout(() => setFreshIds([]), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [freshIds]);

  const toggle = useCallback(() => {
    const next = !isEnabled;
    setIsEnabled(next);
    localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');

    if (next && contextRef.current) {
      void contextRef.current.resume();
      playChime(contextRef.current);
    }
  }, [isEnabled]);

  const ring = useCallback(() => {
    if (!isEnabled || !contextRef.current) return;
    void contextRef.current.resume();
    playChime(contextRef.current);
    navigator.vibrate?.([180, 80, 180]);
  }, [isEnabled]);

  return { isEnabled, toggle, freshIds, ring };
};
