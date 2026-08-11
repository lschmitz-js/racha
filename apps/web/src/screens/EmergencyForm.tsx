import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, type EmergencyContact } from '../lib/api.js';
import { useT } from '../lib/i18n.js';

type Fields = {
  player_phone: string;
  contact_name: string;
  contact_phone: string;
  relationship: string;
  medical_notes: string;
};

const EMPTY: Fields = {
  player_phone: '',
  contact_name: '',
  contact_phone: '',
  relationship: '',
  medical_notes: '',
};

function fromContact(c: EmergencyContact | null): Fields {
  if (!c) return { ...EMPTY };
  return {
    player_phone: c.player_phone ?? '',
    contact_name: c.contact_name ?? '',
    contact_phone: c.contact_phone ?? '',
    relationship: c.relationship ?? '',
    medical_notes: c.medical_notes ?? '',
  };
}

// Public self-service form a player opens via their private link (/e/:token).
// No admin login required — the token in the URL is the authorization.
export function EmergencyForm({ params }: { params: { token: string } }) {
  const t = useT();
  const token = params.token;

  const q = useQuery({
    queryKey: ['emergency', token],
    queryFn: () => api.emergency.get(token),
    retry: false,
  });

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Prefill once the existing contact loads.
  useEffect(() => {
    if (q.data) setFields(fromContact(q.data.contact));
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => api.emergency.save(token, fields),
    onSuccess: () => {
      setError(null);
      setSaved(true);
    },
    onError: (e: any) => setError(t('emergency.saveFailed', { msg: e?.message ?? '' })),
  });

  function submit() {
    if (!fields.contact_name.trim() || !fields.contact_phone.trim()) {
      setError(t('emergency.required'));
      return;
    }
    setError(null);
    save.mutate();
  }

  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setFields((f) => ({ ...f, [k]: e.target.value }));
  };

  if (q.isLoading) {
    return <div className="p-6 text-muted text-center">{t('common.loading')}</div>;
  }
  if (q.isError || !q.data) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
          ⚠️ {t('emergency.invalidLink')}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 max-w-md mx-auto space-y-4">
      <header className="pt-6 text-center">
        <div className="text-4xl mb-1">🚨</div>
        <h1 className="text-2xl font-bold">{t('emergency.formTitle')}</h1>
        <p className="text-sm text-muted mt-1">{t('emergency.forPlayer', { name: q.data.name })}</p>
      </header>

      <p className="text-sm text-fg/90 leading-relaxed">{t('emergency.formSubtitle')}</p>

      <div className="space-y-3">
        <Field label={t('emergency.playerPhone')}>
          <input
            type="tel"
            className="input"
            value={fields.player_phone}
            onChange={set('player_phone')}
            autoComplete="tel"
          />
        </Field>
        <Field label={t('emergency.contactName')}>
          <input className="input" value={fields.contact_name} onChange={set('contact_name')} />
        </Field>
        <Field label={t('emergency.contactPhone')}>
          <input
            type="tel"
            className="input"
            value={fields.contact_phone}
            onChange={set('contact_phone')}
          />
        </Field>
        <Field label={t('emergency.relationship')}>
          <input className="input" value={fields.relationship} onChange={set('relationship')} />
        </Field>
        <Field label={t('emergency.medicalNotes')}>
          <textarea
            className="input min-h-24 resize-y"
            value={fields.medical_notes}
            onChange={set('medical_notes')}
          />
        </Field>
      </div>

      <div className="text-xs text-muted flex items-start gap-1.5">
        <span>🔒</span>
        <span>{t('emergency.privacy')}</span>
      </div>

      {error ? <div className="text-sm text-red-400">{error}</div> : null}
      {saved ? (
        <div className="rounded-lg border border-accent/40 bg-accent/10 text-fg/90 px-4 py-3 text-sm">
          ✅ {t('emergency.saved')}
        </div>
      ) : null}

      <button
        className="btn-primary w-full"
        disabled={save.isPending}
        onClick={submit}
      >
        {save.isPending ? t('common.saving') : t('emergency.saveBtn')}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
