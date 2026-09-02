import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useI18n, useT } from '../lib/i18n.js';
import { api } from '../lib/api.js';
import { useContact } from '../lib/contact.js';
import { rulesDoc, type Block } from './rules-content.js';

// `roster` is the live season roster from the database; chips blocks render it
// so the "Official Season Roster" stays in sync with the Players tab instead of
// a hardcoded list. Falls back to the block's built-in items until data loads.
function BlockView({
  block,
  roster,
  sub,
  renderP,
}: {
  block: Block;
  roster: string[];
  sub: (s: string) => string;
  renderP: (s: string) => ReactNode;
}) {
  const rosterEmpty = useT()('rules.rosterEmpty');
  switch (block.t) {
    case 'p':
      return <p className="text-sm text-fg/90 leading-relaxed">{renderP(block.text)}</p>;

    case 'list':
      return block.ordered ? (
        <ol className="list-decimal pl-5 space-y-1 text-sm text-fg/90 leading-relaxed marker:text-muted">
          {block.items.map((it, i) => (
            <li key={i}>{sub(it)}</li>
          ))}
        </ol>
      ) : (
        <ul className="space-y-1.5 text-sm text-fg/90 leading-relaxed">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-accent mt-px">›</span>
              <span>{sub(it)}</span>
            </li>
          ))}
        </ul>
      );

    case 'sub':
      return (
        <div className="space-y-2 border-l-2 border-border pl-3">
          <h4 className="text-sm font-semibold text-fg">{sub(block.title)}</h4>
          {block.blocks.map((b, i) => (
            <BlockView key={i} block={b} roster={roster} sub={sub} renderP={renderP} />
          ))}
        </div>
      );

    case 'callout': {
      const warn = block.tone === 'warn';
      return (
        <div
          className={`rounded-lg border px-3 py-2 text-sm leading-relaxed ${
            warn
              ? 'border-red-500/40 bg-red-500/10 text-red-200'
              : 'border-accent/40 bg-accent/10 text-fg/90'
          }`}
        >
          <span className="mr-1">{warn ? '⚠️' : 'ℹ️'}</span>
          {sub(block.text)}
        </div>
      );
    }

    case 'kv':
      return (
        <dl className="space-y-1.5">
          {block.rows.map((r, i) => (
            <div key={i} className="flex gap-3 text-sm">
              <dt className="w-28 shrink-0 text-muted">{sub(r.k)}</dt>
              <dd className="font-medium text-fg">{sub(r.v)}</dd>
            </div>
          ))}
        </dl>
      );

    case 'chips': {
      // Live season roster from the Players tab. No hardcoded fallback.
      if (roster.length === 0) {
        return <p className="text-sm text-muted italic">{rosterEmpty}</p>;
      }
      return (
        <div className="flex flex-wrap gap-2">
          {roster.map((name, i) => (
            <span
              key={i}
              className="rounded-full border border-border bg-bg3 px-3 py-1 text-sm text-fg"
            >
              <span className="text-muted mr-1">{i + 1}.</span>
              {name}
            </span>
          ))}
        </div>
      );
    }

    case 'code':
      return (
        <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-bg3 px-3 py-2 text-xs text-fg/90 font-mono leading-relaxed">
          {sub(block.text)}
        </pre>
      );

    default:
      return null;
  }
}

export function Rules() {
  const { lang } = useI18n();
  const t = useT();
  const doc = rulesDoc[lang] ?? rulesDoc.en;

  // Live "Official Season Roster" — season, active players from the Players tab.
  const playersQ = useQuery({ queryKey: ['players'], queryFn: api.players.list });
  const roster = (playersQ.data ?? [])
    .filter((p) => p.type === 'season' && p.active)
    .map((p) => p.name);

  // Contact/payment copy comes from settings (DB), not source. Fill the
  // {siteUrl} / {etransfer} tokens in the rules text, with neutral fallbacks
  // until the organizer sets them in the app.
  const contact = useContact();
  const vars: Record<string, string> = {
    siteUrl: contact.siteUrl.trim() || t('rules.thisApp'),
    etransfer: contact.etransfer.trim() || t('rules.askOrganizer'),
  };
  const sub = (s: string) =>
    s.replace(/\{(siteUrl|etransfer)\}/g, (_, k) => vars[k] ?? `{${k}}`);

  // Rich paragraph renderer: turns the {siteUrl} token into a highlighted,
  // clickable link (the URL itself stays in settings, not in source). Other
  // tokens fall back to the plain `sub` substitution.
  const rawSite = contact.siteUrl.trim();
  const siteHref = rawSite && /^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`;
  const renderP = (s: string): ReactNode => {
    if (!s.includes('{siteUrl}')) return sub(s);
    const segments = s.split('{siteUrl}');
    return segments.map((seg, i) => (
      <span key={i}>
        {sub(seg)}
        {i < segments.length - 1 &&
          (rawSite ? (
            <a
              href={siteHref}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent underline underline-offset-2 hover:text-accent/80 break-words"
            >
              {rawSite}
            </a>
          ) : (
            <span className="font-semibold text-accent">{t('rules.thisApp')}</span>
          ))}
      </span>
    ));
  };

  return (
    <div className="p-4 pb-32 space-y-4 max-w-2xl mx-auto">
      <header className="pt-6 pb-1 text-center">
        <div className="text-4xl mb-1">⚽</div>
        <h1 className="text-2xl font-bold">{t('rules.title')}</h1>
        <p className="text-sm text-muted mt-1">{t('rules.subtitle')}</p>
      </header>

      {doc.map((section, i) => (
        <details key={i} className="card group" open={i === 0}>
          <summary className="flex items-center gap-3 cursor-pointer list-none select-none">
            <span className="text-xl">{section.icon}</span>
            <span className="font-semibold flex-1">{section.title}</span>
            <span className="text-muted transition-transform group-open:rotate-90">›</span>
          </summary>
          <div className="mt-3 space-y-3">
            {section.blocks.map((b, j) => (
              <BlockView key={j} block={b} roster={roster} sub={sub} renderP={renderP} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
