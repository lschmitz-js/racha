import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SKILLS, type Player, ImportEnvelope } from '@racha/shared';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useCanEdit } from '../lib/auth.js';
import { Avatar, resizeImageToBlob } from '../lib/avatar.js';

type Editing = {
  id?: string;
  name: string;
  type: 'season' | 'dropin';
  role: 'player' | 'gk';
  skills: number[];
  pendingAvatar?: Blob | null;
  removeAvatar?: boolean;
  avatarPreviewUrl?: string | null;
  avatarVersion?: number;
};

const EMPTY: Editing = {
  name: '',
  type: 'dropin',
  role: 'player',
  skills: [3, 3, 3, 3, 3, 3, 3, 3],
};

export function PlayerDB() {
  const qc = useQueryClient();
  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [emergencyFor, setEmergencyFor] = useState<Player | null>(null);
  const t = useT();
  const canEdit = useCanEdit();
  const emergencyStatusQ = useQuery({
    queryKey: ['emergency-status'],
    queryFn: api.players.emergencyStatus,
    enabled: canEdit,
  });

  const save = useMutation({
    mutationFn: async (e: Editing) => {
      const body = { name: e.name, type: e.type, role: e.role, skills: e.skills };
      const saved = e.id ? await api.players.update(e.id, body) : await api.players.create(body);
      if (e.pendingAvatar) {
        await api.players.uploadAvatar(saved.id, e.pendingAvatar);
      } else if (e.removeAvatar && e.id) {
        await api.players.deleteAvatar(e.id);
      }
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['players'] });
      setEditing(null);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.players.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['players'] }),
  });

  async function handleImport(file: File) {
    const text = await file.text();
    const parsed = ImportEnvelope.parse(JSON.parse(text));
    await api.players.import(parsed);
    qc.invalidateQueries({ queryKey: ['players'] });
    alert(t('players.imported', { n: parsed.db.length }));
  }

  async function handleExport() {
    const env = await api.players.export();
    const blob = new Blob([JSON.stringify(env, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `racha_de_segunda_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  async function handleExportEmergency() {
    try {
      const csv = await api.players.emergencyExportCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `emergency_contacts_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      alert(t('emergency.exportFailed', { msg: err?.message ?? '' }));
    }
  }

  if (playersQ.isLoading) return <div className="p-4 text-muted">{t('common.loading')}</div>;
  const players = (playersQ.data ?? []).filter((p) => p.active);

  return (
    <div className="p-4 pb-32 space-y-3">
      <header className="space-y-3">
        <h1 className="text-xl font-bold pr-24">{t('players.title')}</h1>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={handleExport}>
            {t('common.export')}
          </button>
          {canEdit ? (
            <>
              <button className="btn" onClick={handleExportEmergency}>
                🚨 {t('emergency.exportCsv')}
              </button>
              <label className="btn cursor-pointer">
                {t('common.import')}
                <input
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f).catch((err) => alert(t('players.importFailed', { msg: err.message })));
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <button className="btn-primary" onClick={() => setEditing({ ...EMPTY })}>
                {t('common.new')}
              </button>
            </>
          ) : null}
        </div>
      </header>
      {!canEdit ? (
        <div className="text-xs text-muted">{t('auth.adminOnly')}</div>
      ) : null}

      <div className="space-y-2">
        {players.map((p) => (
          <div key={p.id} className="card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar playerId={p.id} name={p.name} size={40} />
              <div className="min-w-0">
                <div className="font-medium truncate">{p.name}</div>
                <div className="text-xs text-muted truncate">
                  {p.type === 'season' ? t('players.season') : t('players.dropin')} ·{' '}
                  {p.role === 'gk' ? t('players.gk') : t('players.player')} ·{' '}
                  {t('players.avg', { n: avg(p.skills) })}
                </div>
                {canEdit && emergencyStatusQ.data && !emergencyStatusQ.data[p.id] ? (
                  <div className="text-xs text-red-400 mt-0.5">{t('emergency.missingBadge')}</div>
                ) : null}
              </div>
            </div>
            {canEdit ? (
              <div className="flex gap-2">
                <button
                  className="btn"
                  title={t('players.emergency')}
                  aria-label={t('players.emergency')}
                  onClick={() => setEmergencyFor(p)}
                >
                  🚨
                </button>
                <button className="btn" onClick={() => setEditing(toEditing(p))}>
                  {t('common.edit')}
                </button>
                <button
                  className="btn-danger"
                  onClick={() => {
                    if (confirm(t('players.confirmRemove', { name: p.name }))) remove.mutate(p.id);
                  }}
                >
                  ×
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {editing ? (
        <Modal
          editing={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => save.mutate(editing)}
          saving={save.isPending}
        />
      ) : null}

      {emergencyFor ? (
        <EmergencyPanel player={emergencyFor} onClose={() => setEmergencyFor(null)} />
      ) : null}
    </div>
  );
}

function EmergencyPanel({ player, onClose }: { player: Player; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['emergency-admin', player.id],
    queryFn: () => api.players.emergencyAdmin(player.id),
  });
  const rotate = useMutation({
    mutationFn: () => api.players.emergencyRotate(player.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['emergency-admin', player.id] }),
    onError: (e: any) => alert(t('emergency.rotateFailed', { msg: e?.message ?? '' })),
  });
  const [copied, setCopied] = useState(false);

  const link = q.data
    ? `${window.location.origin}/e/${q.data.token}`
    : '';

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — select-to-copy fallback.
      window.prompt(t('emergency.copyLink'), link);
    }
  }

  const c = q.data?.contact ?? null;
  const rows: Array<[string, string | null | undefined]> = [
    [t('emergency.playerPhone'), c?.player_phone],
    [t('emergency.contactName'), c?.contact_name],
    [t('emergency.contactPhone'), c?.contact_phone],
    [t('emergency.relationship'), c?.relationship],
    [t('emergency.medicalNotes'), c?.medical_notes],
  ];
  const hasDetails = rows.some(([, v]) => v && String(v).trim());

  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-bg2 border border-border rounded-t-xl sm:rounded-xl p-4 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">
          🚨 {t('emergency.adminTitle', { name: player.name })}
        </h2>

        {q.isLoading ? (
          <div className="text-muted text-sm py-4">{t('common.loading')}</div>
        ) : (
          <div className="space-y-4">
            {link ? (
              <div className="flex flex-col items-center gap-2">
                <div className="rounded-xl bg-white p-3">
                  <QRCodeSVG value={link} size={192} marginSize={0} level="M" />
                </div>
                <p className="text-xs text-muted">{t('emergency.scanHint')}</p>
              </div>
            ) : null}
            <div className="space-y-2">
              <p className="text-xs text-muted">{t('emergency.shareHint', { name: player.name })}</p>
              <div className="flex gap-2">
                <input className="input font-mono text-xs" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn shrink-0" onClick={copy}>
                  {copied ? t('emergency.copied') : t('emergency.copyLink')}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent no-underline"
                >
                  {t('emergency.openForm')} ↗
                </a>
                <button
                  className="btn-danger text-xs py-1"
                  disabled={rotate.isPending}
                  onClick={() => {
                    if (confirm(t('emergency.rotateConfirm', { name: player.name }))) rotate.mutate();
                  }}
                >
                  🔄 {t('emergency.rotate')}
                </button>
              </div>
            </div>

            <div className="border-t border-border pt-3">
              <div className="text-sm font-medium mb-2">
                {hasDetails ? `✅ ${t('emergency.submitted')}` : `⚠️ ${t('emergency.notSubmitted')}`}
              </div>
              {hasDetails ? (
                <dl className="space-y-1.5">
                  {rows.map(([k, v]) =>
                    v && String(v).trim() ? (
                      <div key={k} className="flex gap-3 text-sm">
                        <dt className="w-28 shrink-0 text-muted">{k}</dt>
                        <dd className="font-medium text-fg whitespace-pre-wrap">{v}</dd>
                      </div>
                    ) : null
                  )}
                </dl>
              ) : (
                <p className="text-sm text-muted">{t('emergency.noDetails')}</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <button className="btn w-full" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
}

function toEditing(p: Player): Editing {
  return { id: p.id, name: p.name, type: p.type, role: p.role, skills: [...p.skills] };
}

function avg(skills: number[]): number {
  return Math.round((skills.reduce((a, b) => a + b, 0) / skills.length) * 10) / 10;
}

function Modal({
  editing,
  onChange,
  onClose,
  onSave,
  saving,
}: {
  editing: Editing;
  onChange: (e: Editing) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const t = useT();

  async function handlePickPhoto(file: File) {
    try {
      const blob = await resizeImageToBlob(file, 512);
      const previewUrl = URL.createObjectURL(blob);
      onChange({
        ...editing,
        pendingAvatar: blob,
        removeAvatar: false,
        avatarPreviewUrl: previewUrl,
      });
    } catch (err: any) {
      alert(err?.message ?? 'Could not process image');
    }
  }

  function handleRemovePhoto() {
    onChange({
      ...editing,
      pendingAvatar: null,
      removeAvatar: true,
      avatarPreviewUrl: null,
    });
  }

  const showExistingAvatar =
    !!editing.id && !editing.pendingAvatar && !editing.removeAvatar;
  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-bg2 border border-border rounded-t-xl sm:rounded-xl p-4 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-3">
          {editing.id ? t('players.editTitle') : t('players.newTitle')}
        </h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {editing.avatarPreviewUrl ? (
              <img
                src={editing.avatarPreviewUrl}
                alt=""
                className="w-16 h-16 rounded-full object-cover bg-bg3 border border-border"
              />
            ) : showExistingAvatar ? (
              <Avatar
                playerId={editing.id!}
                name={editing.name}
                size={64}
                version={editing.avatarVersion}
              />
            ) : (
              <span className="w-16 h-16 rounded-full bg-bg3 border border-border inline-flex items-center justify-center text-base text-muted">
                {(editing.name?.charAt(0) ?? '?').toUpperCase()}
              </span>
            )}
            <div className="flex flex-col gap-1">
              <label className="btn cursor-pointer text-sm">
                {t('players.changePhoto')}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handlePickPhoto(f);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              {(editing.pendingAvatar ||
                (editing.id && !editing.removeAvatar)) ? (
                <button
                  type="button"
                  className="btn-danger text-sm"
                  onClick={handleRemovePhoto}
                >
                  {t('players.removePhoto')}
                </button>
              ) : null}
            </div>
          </div>
          <input
            className="w-full bg-bg3 border border-border rounded-lg px-3 py-2"
            placeholder={t('players.namePlaceholder')}
            value={editing.name}
            onChange={(e) => onChange({ ...editing, name: e.target.value })}
          />
          <div className="flex gap-2">
            <select
              className="flex-1 bg-bg3 border border-border rounded-lg px-3 py-2"
              value={editing.type}
              onChange={(e) =>
                onChange({ ...editing, type: e.target.value as 'season' | 'dropin' })
              }
            >
              <option value="season">{t('players.season')}</option>
              <option value="dropin">{t('players.dropin')}</option>
            </select>
            <select
              className="flex-1 bg-bg3 border border-border rounded-lg px-3 py-2"
              value={editing.role}
              onChange={(e) =>
                onChange({ ...editing, role: e.target.value as 'player' | 'gk' })
              }
            >
              <option value="player">{t('players.player')}</option>
              <option value="gk">{t('players.gk')}</option>
            </select>
          </div>
          <div className="space-y-2">
            {SKILLS.map((label, i) => (
              <SkillRow
                key={label}
                label={t(`skill.${label}` as any)}
                value={editing.skills[i] ?? 3}
                onChange={(v) => {
                  const next = [...editing.skills];
                  next[i] = v;
                  onChange({ ...editing, skills: next });
                }}
              />
            ))}
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn flex-1" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-primary flex-1"
            disabled={saving || !editing.name.trim()}
            onClick={onSave}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm w-20">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`w-8 h-8 rounded-md text-sm border ${
              value === n
                ? 'bg-accent text-black border-accent'
                : 'bg-bg3 border-border text-muted'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
