'use client';
import { useEffect } from 'react';

export function ViewTracker({ id }: { id: string }) {
  useEffect(() => {
    const key = `padelhub:view:${id}:${new Date().toISOString().slice(0,10)}`;
    function track() {
      if (document.visibilityState !== 'visible') return;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, '1');
      } catch { return; }
      void fetch(`/api/analytics/listings/${id}`, { method: 'POST', keepalive: true }).catch(() => {});
    }
    track();
    document.addEventListener('visibilitychange', track);
    return () => document.removeEventListener('visibilitychange', track);
  }, [id]);
  return null;
}
