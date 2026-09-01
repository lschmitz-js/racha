import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useContact } from '../lib/contact.js';

// Admin editor for the Rules-screen contact/payment copy. The values live in
// the settings table (DB), so the public source never carries them.
export function ContactSettings({ onClose }: { onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const current = useContact();
  const [etransfer, setEtransfer] = useState(current.etransfer);
  const [siteUrl, setSiteUrl] = useState(current.siteUrl);

  const save = useMutation({
    mutationFn: () =>
      api.settings.updateContact({ etransfer: etransfer.trim(), siteUrl: siteUrl.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'contact'] });
      onClose();
    },
    onError: (e: any) => alert(String(e?.message ?? e)),
  });

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-bg2 border border-border rounded-t-xl sm:rounded-xl p-4 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">{t('settings.contactTitle')}</h2>
        <p className="text-sm text-muted mb-4">{t('settings.contactHint')}</p>

        <label className="block space-y-1 mb-3">
          <span className="text-sm font-medium">{t('settings.etransfer')}</span>
          <input
            className="input"
            value={etransfer}
            onChange={(e) => setEtransfer(e.target.value)}
            placeholder="you@example.com"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('settings.siteUrl')}</span>
          <input
            className="input"
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="example.com"
            autoComplete="off"
            autoCapitalize="none"
          />
        </label>

        <div className="mt-5 flex gap-2">
          <button className="btn flex-1" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-primary flex-1"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            {save.isPending ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
