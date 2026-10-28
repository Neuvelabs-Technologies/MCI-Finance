import { Link } from 'react-router-dom';
import { InfoGrid } from '@/components/common/Form';
import { MailStatusChip } from '@/components/common/StatusChip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MAIL_KIND_LABEL, MAIL_STATUS_HELP, eventLabel } from '@/lib/emails';
import { fmtDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { EmailMessage } from '@/types';

/** Problem events, including "refresh:hardbounced" etc. from a manual refresh. */
const isProblemEvent = (type: string) => /bounce|blocked|spam|failed/.test(type);

/** Everything known about one email: who, what, and each delivery event Mailjet reported. */
export function EmailDetailDialog({ email, onOpenChange }: { email: EmailMessage | null; onOpenChange: (open: boolean) => void }) {
  const c = email?.customer && typeof email.customer === 'object' ? email.customer : null;
  const events = email ? [...email.events].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()) : [];
  return (
    <Dialog open={!!email} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {email ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex flex-wrap items-center gap-2">
                {MAIL_KIND_LABEL[email.kind]} email <MailStatusChip status={email.status} />
              </DialogTitle>
              <DialogDescription>{MAIL_STATUS_HELP[email.status]}</DialogDescription>
            </DialogHeader>
            {email.detail ? (
              <p className={cn('rounded-xl border px-4 py-3 text-sm', ['bounced', 'blocked', 'spam', 'failed'].includes(email.status) ? 'border-danger/25 bg-danger-soft text-danger' : 'border-border bg-muted')}>
                {email.detail}
              </p>
            ) : null}
            <InfoGrid
              columns={2}
              items={[
                ['To', email.to],
                [
                  'Customer',
                  c ? (
                    <Link to={`/admin/customers/${c._id}`} className="text-primary hover:underline">
                      {c.code} · {c.name}
                    </Link>
                  ) : undefined,
                ],
                ['Subject', email.subject],
                ['Sent', fmtDateTime(email.at)],
                ['Status updated', fmtDateTime(email.statusAt)],
                ['Sent through', email.provider === 'mailjet' ? 'Mailjet' : email.provider === 'smtp' ? 'SMTP (no tracking)' : 'Not sent — log only'],
              ]}
            />
            <div>
              <p className="mb-2 text-[13px] text-muted-foreground">Delivery events</p>
              {events.length ? (
                <ol className="relative flex flex-col gap-3 border-l border-border pl-5">
                  {events.map((e, i) => {
                    const bad = isProblemEvent(e.type);
                    return (
                      <li key={`${e.at}-${i}`} className="relative">
                        <span className={cn('absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-background', bad ? 'bg-danger' : 'bg-primary/70')} aria-hidden />
                        <p className={cn('text-sm', bad && 'font-semibold text-danger')}>{eventLabel(e.type)}</p>
                        {e.detail ? <p className="text-xs break-words text-muted-foreground">{e.detail}</p> : null}
                        <p className="text-xs text-muted-foreground">{fmtDateTime(e.at)}</p>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {email.provider === 'mailjet' ? 'No news from Mailjet yet. Statuses usually arrive within a minute.' : 'Delivery events are only available for emails sent through Mailjet.'}
                </p>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
