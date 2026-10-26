import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Info, Lightbulb, Printer, Search, TriangleAlert } from 'lucide-react';
import { publicApi } from '@/api/public.api';
import { settingsApi } from '@/api/settings.api';
import { PageHeader } from '@/components/common/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAdmin } from '@/context/AdminContext';
import { cn } from '@/lib/utils';
import { GUIDE_GROUPS, buildGuide, topicText, type Block, type GuideFacts } from './guideContent';

/** Renders **bold** markers. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-foreground">
            {p}
          </strong>
        ) : (
          p
        )
      )}
    </>
  );
}

const CALLOUT = {
  info: { icon: Info, cls: 'border-info/25 bg-info-soft', iconCls: 'text-info' },
  warning: { icon: TriangleAlert, cls: 'border-warning/30 bg-warning-soft', iconCls: 'text-warning' },
  tip: { icon: Lightbulb, cls: 'border-primary/25 bg-primary-soft', iconCls: 'text-primary' },
};

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'h':
      return <h3 className="mt-2 text-base font-bold text-foreground">{block.text}</h3>;
    case 'p':
      return (
        <p className="leading-relaxed text-muted-foreground">
          <Rich text={block.text} />
        </p>
      );
    case 'list':
      return (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 leading-relaxed text-muted-foreground marker:text-muted-foreground/60">
          {block.items.map((item) => (
            <li key={item}>
              <Rich text={item} />
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="flex flex-col gap-4">
          {block.items.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-soft-foreground">{i + 1}</span>
              <div className="min-w-0 pt-0.5">
                <p className="font-semibold text-foreground">{s.title}</p>
                <p className="mt-0.5 leading-relaxed text-muted-foreground">
                  <Rich text={s.text} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                {block.head.map((h) => (
                  <th key={h} className="px-3 py-2 font-bold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join('|')} className="border-t border-border align-top">
                  {row.map((cell, i) => (
                    <td key={i} className={cn('px-3 py-2.5 leading-relaxed whitespace-normal', i === 0 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                      <Rich text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'callout': {
      const t = CALLOUT[block.tone];
      return (
        <div className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', t.cls)}>
          <t.icon size={18} className={cn('mt-0.5 shrink-0', t.iconCls)} aria-hidden />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-bold text-foreground">{block.title}</p>
            {block.text ? (
              <p className="leading-relaxed text-foreground/80">
                <Rich text={block.text} />
              </p>
            ) : null}
            {block.items ? (
              <ul className="flex list-disc flex-col gap-1 pl-4 leading-relaxed text-foreground/80">
                {block.items.map((i) => (
                  <li key={i}>
                    <Rich text={i} />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      );
    }
  }
}

export default function Guide() {
  const { smtpConfigured } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [facts, setFacts] = useState<GuideFacts>({
    orgName: 'MCI Middle East',
    linkValidityDays: 90,
    autoReminderDays: '7,2',
    ownership: true,
    bank: true,
    maxFileMb: 0,
    smtpConfigured,
    contactEmail: '',
  });

  useEffect(() => {
    document.title = 'Guide — MCI e-Invoicing';
    Promise.all([settingsApi.get(), publicApi.info()])
      .then(([s, p]) =>
        setFacts({
          orgName: s.settings.orgName,
          dueDate: s.settings.dueDate,
          linkValidityDays: s.settings.linkValidityDays,
          autoReminderDays: s.settings.autoReminderDays,
          ownership: s.settings.sections.ownership,
          bank: s.settings.sections.bank,
          maxFileMb: p.settings.maxFileMb,
          smtpConfigured: s.smtpConfigured,
          contactEmail: s.settings.contactEmail,
        })
      )
      .catch(() => {});
  }, []);

  const topics = useMemo(() => buildGuide(facts), [facts]);
  const q = query.trim().toLowerCase();
  const visible = q ? topics.filter((t) => topicText(t).includes(q)) : topics;
  const activeId = params.get('topic') ?? topics[0]!.id;
  const active = topics.find((t) => t.id === activeId) ?? topics[0]!;
  const index = topics.indexOf(active);
  const prev = topics[index - 1];
  const next = topics[index + 1];
  const open = (id: string) => {
    setParams({ topic: id }, { replace: true });
    document.getElementById('main-content')?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <PageHeader
        title="Guide"
        subtitle="How the e-invoicing data collection works, and how to do each task. Figures in bold come from your current settings."
        actions={
          <Button variant="outline" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start print:hidden">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="h-9 pl-9 text-sm" placeholder="Search the guide…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the guide" />
          </div>
          <nav aria-label="Guide topics" className="flex flex-col gap-4">
            {visible.length === 0 ? <p className="px-2 text-sm text-muted-foreground">No topic matches.</p> : null}
            {GUIDE_GROUPS.map((g) => {
              const items = visible.filter((t) => t.group === g.id);
              if (!items.length) return null;
              return (
                <div key={g.id} className="flex flex-col gap-0.5">
                  <p className="px-3 pb-1 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">{g.title}</p>
                  {items.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => open(t.id)}
                      aria-current={t.id === active.id ? 'page' : undefined}
                      className={cn(
                        'rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                        t.id === active.id ? 'bg-primary-soft font-bold text-primary-soft-foreground hover:bg-primary-soft' : 'text-foreground'
                      )}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </nav>
        </aside>

        <article className="flex min-w-0 flex-col gap-5 rounded-2xl border border-border bg-card p-6 md:p-8">
          <header className="flex flex-col gap-1 border-b border-border pb-5">
            <p className="text-sm font-semibold text-primary">{GUIDE_GROUPS.find((g) => g.id === active.group)?.title}</p>
            <h2 className="text-2xl font-bold">{active.title}</h2>
            <p className="text-muted-foreground">{active.summary}</p>
          </header>
          {active.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
          {active.link ? (
            <div>
              <Button variant="soft" asChild>
                <Link to={active.link.to}>
                  {active.link.label} <ArrowRight />
                </Link>
              </Button>
            </div>
          ) : null}
          <footer className="mt-2 flex flex-wrap justify-between gap-3 border-t border-border pt-5 print:hidden">
            {prev ? (
              <Button variant="ghost" onClick={() => open(prev.id)}>
                <ArrowLeft /> {prev.title}
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button variant="ghost" onClick={() => open(next.id)}>
                {next.title} <ArrowRight />
              </Button>
            ) : null}
          </footer>
        </article>
      </div>
    </>
  );
}
