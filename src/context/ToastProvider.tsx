// Shows the confirmation (or the error) just above the tab bar.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastState, type ToastTone } from './toast-context';

// A confirmation only has to register; an error has to be read.
const DURATIONS: Record<ToastTone, number> = { success: 1800, error: 6000 };

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'bg-brand-600 text-white',
  error: 'bg-red-600 text-white',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), DURATIONS[tone]);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={notify}>
      {children}

      {/*
        aria-live so a screen reader hears the confirmation rather than only
        seeing it, and pointer-events-none so it never blocks a tap underneath.
      */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-5"
      >
        {toast && (
          <div
            key={toast.id}
            className={`animate-toast-in flex max-w-sm items-center gap-2 rounded-full px-4 py-2.5
              text-sm font-semibold shadow-lg ${TONE_STYLES[toast.tone]}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
              {toast.tone === 'success' ? (
                <path
                  d="M4 12.5l5 5L20 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <path
                  d="M12 8v5M12 16.5v.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
