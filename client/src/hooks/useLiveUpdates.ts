import { useEffect, useRef } from 'react';
import { subscribe } from '../realtime/liveSocket';

// Subscribe to the shared WebSocket and invoke onChange (debounced) whenever the
// server signals a DB change, so screens refetch their data in realtime.
export function useLiveUpdates(onChange: () => void): void {
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribe(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => cbRef.current(), 300);
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, []);
}
