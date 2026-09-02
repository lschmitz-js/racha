import { useState } from 'react';
import { useAuth, useCanEdit } from '../lib/auth.js';
import { useT } from '../lib/i18n.js';
import { SignInModal } from './SignInModal.js';

// Shown on the session / match screens to anyone who can't yet run the game.
// They can join by entering the day's 4-digit code (operator), or an organizer
// can sign in as admin. Hides itself once they can edit.
export function AccessBar() {
  const t = useT();
  const canEdit = useCanEdit();
  const { enterCode } = useAuth();
  const [code, setCode] = useState('');
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signIn, setSignIn] = useState(false);

  if (canEdit) return null;

  const submit = async () => {
    if (code.trim().length !== 4 || busy) return;
    setBusy(true);
    const ok = await enterCode(code.trim());
    setBusy(false);
    if (!ok) {
      setErr(true);
      setCode('');
    }
  };

  return (
    <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/40 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-amber-200">🎮 {t('access.enterCode')}</span>
      <input
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        value={code}
        onChange={(e) => {
          setErr(false);
          setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder="0000"
        aria-label={t('access.enterCode')}
        className="w-20 text-center tracking-[0.3em] font-mono text-lg rounded-lg border border-border bg-bg3 px-2 py-1"
      />
      <button className="btn-primary py-1.5" disabled={code.length !== 4 || busy} onClick={submit}>
        {t('access.join')}
      </button>
      {err ? <span className="text-red-400 text-xs">{t('access.badCode')}</span> : null}
      <button
        className="text-xs text-muted underline ml-auto shrink-0"
        onClick={() => setSignIn(true)}
      >
        {t('access.adminSignIn')}
      </button>
      {signIn ? <SignInModal onClose={() => setSignIn(false)} /> : null}
    </div>
  );
}
