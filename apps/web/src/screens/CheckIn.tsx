import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type CheckinBoard, type CheckinEntry } from '../lib/api.js';
import { useI18n, useT } from '../lib/i18n.js';
import { useCanEdit } from '../lib/auth.js';
import { useContact } from '../lib/contact.js';
import { Avatar } from '../lib/avatar.js';

const ME_KEY = 'racha.me';
const readMe = () => {
  try {
    return window.localStorage.getItem(ME_KEY);
  } catch {
    return null;
  }
};
const writeMe = (id: string | null) => {
  try {
    if (id) window.localStorage.setItem(ME_KEY, id);
    else window.localStorage.removeItem(ME_KEY);
  } catch {
    /* private mode — identity just won't persist */
  }
};

const FULL_TEAMS = 15; // three teams of five; season players can stretch it to 18

export function CheckIn() {
  const t = useT();
  const { lang } = useI18n();
  const canEdit = useCanEdit();
  const qc = useQueryClient();

  const boardQ = useQuery({ queryKey: ['checkin'], queryFn: api.checkin.get });
  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });

  const [meId, setMeId] = useState<string | null>(readMe());
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');

  const set = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'in' | 'out' | 'none' }) =>
      api.checkin.set(id, status),
    onSuccess: (board) => qc.setQueryData(['checkin'], board),
    onError: (e: any) => alert(String(e?.message ?? e)),
  });

  const board = (boardQ.data ?? { game_date: null, cap: 15, confirmed: [], waitlist: [], out: [] }) as CheckinBoard;
  // Season players must confirm; drop-ins may check in if they want to play.
  const roster = (playersQ.data ?? []).filter((p) => p.active);
  const me = meId ? roster.find((p) => p.id === meId) : undefined;

  // Season players who haven't responded yet (confirmation is expected of them).
  const respondedIds = new Set(
    [...board.confirmed, ...board.waitlist, ...board.out].map((e) => e.id)
  );
  const awaitingSeason = roster.filter((p) => p.type === 'season' && !respondedIds.has(p.id));

  const locale = lang === 'pt' ? 'pt-BR' : 'en-US';
  const dateLabel = board.game_date
    ? new Date(board.game_date + 'T12:00:00').toLocaleDateString(locale, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    : null;

  // my current status, derived from the board
  const myStatus: 'in' | 'wait' | 'out' | null = !me
    ? null
    : board.confirmed.some((e) => e.id === me.id)
      ? 'in'
      : board.waitlist.some((e) => e.id === me.id)
        ? 'wait'
        : board.out.some((e) => e.id === me.id)
          ? 'out'
          : null;

  const pickMe = (id: string) => {
    writeMe(id);
    setMeId(id);
    setPicking(false);
    setSearch('');
  };

  if (boardQ.isLoading) return <div className="p-4 text-muted">{t('common.loading')}</div>;

  if (!board.game_date) {
    return (
      <div className="p-4 pb-28 space-y-4">
        <header>
          <h1 className="title-lg">{t('checkin.title')}</h1>
        </header>
        <div className="card text-sm text-muted">{t('checkin.seasonOver')}</div>
      </div>
    );
  }

  const spotsLeft = Math.max(0, board.cap - board.confirmed.length);

  return (
    <div className="p-4 pb-28 space-y-5">
      <header>
        <h1 className="title-lg">{t('checkin.title')}</h1>
        <p className="text-sm text-muted capitalize">{dateLabel}</p>
      </header>

      {/* Your check-in */}
      {!me || picking ? (
        <NamePicker
          roster={roster.map((p) => ({ id: p.id, name: p.name }))}
          search={search}
          onSearch={setSearch}
          onPick={pickMe}
          onCancel={me ? () => setPicking(false) : undefined}
        />
      ) : (
        <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Avatar playerId={me.id} name={me.name} size={40} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{me.name}</div>
              <button
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md border border-accent/60 text-accent hover:bg-accent/10"
                onClick={() => setPicking(true)}
              >
                {t('checkin.notYou')} {t('checkin.change')} →
              </button>
            </div>
            {myStatus === 'in' ? (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/40">
                {t('checkin.youreIn')}
              </span>
            ) : myStatus === 'wait' ? (
              <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted">
                {t('checkin.youreWait')}
              </span>
            ) : myStatus === 'out' ? (
              <span className="text-xs px-2 py-0.5 rounded-full border border-border text-muted">
                {t('checkin.youreOut')}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              className={`py-2.5 rounded-xl font-medium border transition ${
                myStatus === 'in' || myStatus === 'wait'
                  ? 'bg-accent text-white border-accent'
                  : 'border-border bg-bg2 hover:border-accent'
              }`}
              disabled={set.isPending}
              onClick={() =>
                set.mutate({
                  id: me.id,
                  status: myStatus === 'in' || myStatus === 'wait' ? 'none' : 'in',
                })
              }
            >
              ✅ {t('checkin.imIn')}
            </button>
            <button
              className={`py-2.5 rounded-xl font-medium border transition ${
                myStatus === 'out'
                  ? 'bg-red-500/80 text-white border-red-500'
                  : 'border-border bg-bg2 hover:border-red-500/60'
              }`}
              disabled={set.isPending}
              onClick={() =>
                set.mutate({ id: me.id, status: myStatus === 'out' ? 'none' : 'out' })
              }
            >
              ✕ {t('checkin.cantMake')}
            </button>
          </div>
        </div>
      )}

      {canEdit ? <ReminderButton board={board} dateLabel={dateLabel ?? ''} /> : null}

      {/* Confirmed */}
      <section>
        <div className="section-head flex items-center justify-between">
          <h2 className="font-semibold">
            {t('checkin.confirmed')}{' '}
            <span className="text-muted tabular-nums">
              {board.confirmed.length}/{board.cap}
            </span>
          </h2>
          <span className="text-xs text-muted">{t('checkin.spotsLeft', { n: spotsLeft })}</span>
        </div>
        {board.confirmed.length === 0 ? (
          <div className="text-sm text-muted">{t('checkin.nobodyYet')}</div>
        ) : (
          <ol className="space-y-1.5">
            {board.confirmed.map((e, i) => (
              <li key={e.id}>
                {i === FULL_TEAMS ? (
                  <div className="text-[11px] text-muted text-center py-1 border-t border-dashed border-border">
                    {t('checkin.fullTeamsLine')}
                  </div>
                ) : null}
                <Entry entry={e} rank={i + 1} canEdit={canEdit} onSet={set.mutate} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Waitlist */}
      {board.waitlist.length > 0 ? (
        <section>
          <div className="section-head">
            <h2 className="font-semibold">
              {t('checkin.waitlist')} <span className="text-muted">{board.waitlist.length}</span>
            </h2>
          </div>
          <ol className="space-y-1.5">
            {board.waitlist.map((e, i) => (
              <li key={e.id}>
                <Entry entry={e} rank={board.confirmed.length + i + 1} canEdit={canEdit} onSet={set.mutate} />
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Out */}
      {board.out.length > 0 ? (
        <section>
          <div className="section-head">
            <h2 className="font-semibold text-muted">
              {t('checkin.out')} <span>{board.out.length}</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {board.out.map((e) => (
              <span key={e.id} className="text-sm text-muted px-2.5 py-1 rounded-full border border-border">
                {e.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/* Season players still expected to confirm */}
      {awaitingSeason.length > 0 ? (
        <section>
          <div className="section-head">
            <h2 className="font-semibold text-muted">
              {t('checkin.awaiting')} <span>{awaitingSeason.length}</span>
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {awaitingSeason.map((p) => (
              <span
                key={p.id}
                className="text-sm text-muted px-2.5 py-1 rounded-full border border-dashed border-border"
              >
                {p.name}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/* Admin: add / fix anyone not already in the lists */}
      {canEdit ? (
        <AdminManage
          roster={roster.map((p) => ({ id: p.id, name: p.name }))}
          board={board}
          onSet={set.mutate}
        />
      ) : null}
    </div>
  );
}

function Entry({
  entry,
  rank,
  canEdit,
  onSet,
}: {
  entry: CheckinEntry;
  rank: number;
  canEdit: boolean;
  onSet: (v: { id: string; status: 'in' | 'out' | 'none' }) => void;
}) {
  const t = useT();
  return (
    <div className="card flex items-center gap-3 py-2">
      <span className="w-5 text-center text-sm font-semibold text-muted tabular-nums shrink-0">{rank}</span>
      <Avatar playerId={entry.id} name={entry.name} size={30} />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{entry.name}</div>
      </div>
      {entry.type === 'dropin' ? (
        <span className="text-[10px] text-muted px-1.5 py-0.5 rounded border border-border">
          {t('checkin.dropin')}
        </span>
      ) : null}
      {canEdit ? (
        <button
          className="text-xs text-muted hover:text-red-400 px-1"
          title={t('checkin.clear')}
          onClick={() => onSet({ id: entry.id, status: 'none' })}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

function NamePicker({
  roster,
  search,
  onSearch,
  onPick,
  onCancel,
}: {
  roster: Array<{ id: string; name: string }>;
  search: string;
  onSearch: (s: string) => void;
  onPick: (id: string) => void;
  onCancel?: () => void;
}) {
  const t = useT();
  const q = search.trim().toLowerCase();
  const list = q ? roster.filter((p) => p.name.toLowerCase().includes(q)) : roster;
  return (
    <div className="rounded-2xl border border-border bg-bg2 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{t('checkin.whoAreYou')}</div>
        {onCancel ? (
          <button className="text-xs text-muted hover:text-fg" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        ) : null}
      </div>
      <p className="text-sm text-muted">{t('checkin.pickName')}</p>
      <input
        className="input"
        placeholder={t('checkin.searchName')}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        autoFocus
      />
      <div className="max-h-72 overflow-y-auto flex flex-wrap gap-2">
        {list.map((p) => (
          <button
            key={p.id}
            className="px-3 py-1.5 rounded-full border border-border bg-bg3 hover:border-accent text-sm"
            onClick={() => onPick(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminManage({
  roster,
  board,
  onSet,
}: {
  roster: Array<{ id: string; name: string }>;
  board: CheckinBoard;
  onSet: (v: { id: string; status: 'in' | 'out' | 'none' }) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const inIds = new Set([...board.confirmed, ...board.waitlist].map((e) => e.id));
  const outIds = new Set(board.out.map((e) => e.id));
  return (
    <section>
      <button
        className="text-sm text-muted hover:text-fg flex items-center gap-1"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
        {t('checkin.manage')}
      </button>
      {open ? (
        <div className="mt-2 space-y-1.5">
          {roster.map((p) => {
            const status = inIds.has(p.id) ? 'in' : outIds.has(p.id) ? 'out' : 'none';
            return (
              <div key={p.id} className="card flex items-center gap-2 py-1.5">
                <span className="flex-1 min-w-0 truncate text-sm">{p.name}</span>
                {/* Tapping the active choice again clears it (back to no response). */}
                <button
                  className={`text-xs px-2 py-1 rounded-lg border ${
                    status === 'in' ? 'bg-accent text-white border-accent' : 'border-border text-muted'
                  }`}
                  onClick={() => onSet({ id: p.id, status: status === 'in' ? 'none' : 'in' })}
                >
                  {t('checkin.imIn')}
                </button>
                <button
                  className={`text-xs px-2 py-1 rounded-lg border ${
                    status === 'out' ? 'bg-red-500/80 text-white border-red-500' : 'border-border text-muted'
                  }`}
                  onClick={() => onSet({ id: p.id, status: status === 'out' ? 'none' : 'out' })}
                >
                  {t('checkin.cantMake')}
                </button>
                <button
                  className="text-xs px-2 py-1 rounded-lg border border-border text-muted disabled:opacity-30 hover:text-fg"
                  disabled={status === 'none'}
                  onClick={() => onSet({ id: p.id, status: 'none' })}
                >
                  {t('checkin.clear')}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function ReminderButton({ board, dateLabel }: { board: CheckinBoard; dateLabel: string }) {
  const t = useT();
  const contact = useContact();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const url = contact.siteUrl.trim();
    const msg = t('checkin.reminderMsg', {
      date: dateLabel,
      n: board.confirmed.length,
      cap: board.cap,
    });
    const full = url ? `${msg}\n${url}` : msg;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      alert(full);
    }
  };
  return (
    <button className="btn w-full flex items-center justify-center gap-2" onClick={copy}>
      💬 {copied ? t('checkin.copied') : t('checkin.copyReminder')}
    </button>
  );
}
