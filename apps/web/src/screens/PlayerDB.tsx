import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SKILLS, type Player, ImportEnvelope } from '@racha/shared';
import { useState } from 'react';
import { api } from '../lib/api.js';
import { useT } from '../lib/i18n.js';
import { useCanEdit } from '../lib/auth.js';

type Editing = {
  id?: string;
  name: string;
  type: 'season' | 'dropin';
  role: 'player' | 'gk';
  skills: number[];
};

const EMPTY: Editing = {
  name: '',
  type: 'season',
  role: 'player',
  skills: [3, 3, 3, 3, 3, 3, 3, 3],
};

export function PlayerDB() {
  const qc = useQueryClient();
  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });
  const [editing, setEditing] = useState<Editing | null>(null);
  const t = useT();
  const canEdit = useCanEdit();

  const save = useMutation({
    mutationFn: async (e: Editing) => {
      const body = { name: e.name, type: e.type, role: e.role, skills: e.skills };
      if (e.id) return api.players.update(e.id, body);
      return api.players.create(body);
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

  if (playersQ.isLoading) return <div className="p-4 text-muted">{t('common.loading')}</div>;
  const players = (playersQ.data ?? []).filter((p) => p.active);

  return (
    <div className="p-4 pb-32 space-y-3">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('players.title')}</h1>
        <div className="flex gap-2">
          <button className="btn" onClick={handleExport}>
            {t('common.export')}
          </button>
          {canEdit ? (
            <>
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
          <div key={p.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted">
                {p.type === 'season' ? t('players.season') : t('players.dropin')} ·{' '}
                {p.role === 'gk' ? t('players.gk') : t('players.player')} ·{' '}
                {t('players.avg', { n: avg(p.skills) })}
              </div>
            </div>
            {canEdit ? (
              <div className="flex gap-2">
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
  return (
    <div className="fixed inset-0 bg-black/70 z-40 flex items-end sm:items-center justify-center">
      <div className="bg-bg2 border border-border rounded-t-xl sm:rounded-xl p-4 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-3">
          {editing.id ? t('players.editTitle') : t('players.newTitle')}
        </h2>
        <div className="space-y-3">
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
