import { useState } from 'react';
import { useAuth } from '../lib/auth.js';
import { useT } from '../lib/i18n.js';

// Admin sign-in dialog: player name + password, with a break-glass toggle to
// paste the master token directly. Shared by the top-bar button and the Match
// screen's "sign in to record" banner.
export function SignInModal({ onClose }: { onClose: () => void }) {
  const { login, loginMaster } = useAuth();
  const t = useT();
  const [masterMode, setMasterMode] = useState(false);
  const [name, setName] = useState('');
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    const ok = masterMode ? await loginMaster(pwd) : await login(name, pwd);
    setBusy(false);
    if (ok) onClose();
    else setError(t('auth.signInFailed'));
  }

  const canSubmit = masterMode ? !!pwd : !!name && !!pwd;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-bg2 border border-border rounded-xl p-4 w-full max-w-sm">
        <h2 className="text-lg font-semibold mb-3">{t('auth.adminMode')}</h2>
        {masterMode ? (
          <input
            type="password"
            autoFocus
            className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 mb-2"
            placeholder={t('auth.masterTokenPlaceholder')}
            value={pwd}
            onChange={(e) => {
              setPwd(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submit();
              }
            }}
          />
        ) : (
          <>
            <input
              autoFocus
              className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 mb-2"
              placeholder={t('auth.namePlaceholder')}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
            <input
              type="password"
              className="w-full bg-bg3 border border-border rounded-lg px-3 py-2 mb-2"
              placeholder={t('auth.passwordPlaceholder')}
              value={pwd}
              onChange={(e) => {
                setPwd(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
          </>
        )}
        {error ? <div className="text-xs text-red-400 mb-2">{error}</div> : null}
        <div className="flex gap-2">
          <button className="btn flex-1" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary flex-1" disabled={busy || !canSubmit} onClick={submit}>
            {busy ? t('common.saving') : t('auth.signIn')}
          </button>
        </div>
        <button
          type="button"
          className="mt-3 text-xs text-muted hover:text-fg w-full text-center"
          onClick={() => {
            setMasterMode((m) => !m);
            setError(null);
            setPwd('');
          }}
        >
          {masterMode ? t('auth.useNamePassword') : t('auth.useMasterToken')}
        </button>
      </div>
    </div>
  );
}
