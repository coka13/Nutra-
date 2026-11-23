'use client';
import { useEffect } from 'react';

export function useRestAlert(deadline: string | null, lang: string, ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const bridge = (
      window as Window & { ReactNativeWebView?: { postMessage: (value: string) => void } }
    ).ReactNativeWebView;
    if (bridge) {
      bridge.postMessage(JSON.stringify({ type: 'workout-rest', deadline, lang }));
      return;
    }
    const delay = deadline ? +new Date(deadline) - Date.now() : 0;
    if (delay <= 0) return;
    const timer = setTimeout(() => {
      navigator.vibrate?.(350);
      const audio = new Audio('/rest-end.wav');
      void audio.play().catch(() => {});
    }, delay);
    return () => clearTimeout(timer);
  }, [deadline, lang, ready]);
}
