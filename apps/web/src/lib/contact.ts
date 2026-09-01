import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';

// Organizer-editable contact/payment copy shown on the Rules screen. Stored in
// the settings table (via /api/settings), NOT hardcoded in source — so the
// public repo never carries the real e-Transfer address or site URL.
export type Contact = { etransfer: string; siteUrl: string };

export const DEFAULT_CONTACT: Contact = { etransfer: '', siteUrl: '' };

export function useContact(): Contact {
  const q = useQuery({
    queryKey: ['settings', 'contact'],
    queryFn: () => api.settings.get(),
    staleTime: 5 * 60 * 1000,
  });
  return { ...DEFAULT_CONTACT, ...(q.data?.contact ?? {}) };
}
