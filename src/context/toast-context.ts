// A single place for "that worked" and "that did not work" messages.
//
// Every save in the app goes through here, so feedback is consistent and no
// failure can pass silently.

import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error';

export interface ToastState {
  /** Bumped per message so a repeat of the same text still re-animates. */
  id: number;
  message: string;
  tone: ToastTone;
}

export type Notify = (message: string, tone?: ToastTone) => void;

export const ToastContext = createContext<Notify | null>(null);

export function useToast(): Notify {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error('useToast must be used inside <ToastProvider>');
  return notify;
}
