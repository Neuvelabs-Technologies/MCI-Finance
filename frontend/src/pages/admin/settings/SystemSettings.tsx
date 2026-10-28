import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Database, FlaskConical, RefreshCw, Server, Trash2 } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { systemApi } from '@/api/system.api';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormSection, InfoGrid, Notice } from '@/components/common/Form';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { ToneChip } from '@/components/common/StatusChip';
import { Button } from '@/components/ui/button';
import { useAdmin } from '@/context/AdminContext';
import type { SystemInfo } from '@/types';

const uptime = (s: number) => {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
};

export function SystemSettings() {
  const { refresh } = useAdmin();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [dialog, setDialog] = useState<'load' | 'clear' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setInfo(await systemApi.info());
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!info) return <LoadingState rows={2} />;

  const yesNo = (ok: boolean, yes: string, no: string) => <ToneChip tone={ok ? 'success' : 'warning'}>{ok ? yes : no}</ToneChip>;

  return (
    <div className="flex flex-col gap-6">
      <FormSection
        icon={Server}
        title="Server"
        description="Quote the version when reporting a problem."
        actions={
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw /> Refresh
          </Button>
        }
      >
        <InfoGrid
          columns={4}
          items={[
            ['Version', <span className="font-mono">{info.version}</span>],
            ['Environment', info.environment === 'production' ? 'Live (production)' : 'Development'],
            ['Running for', uptime(info.uptimeSeconds)],
            ['Node.js', <span className="font-mono">{info.node}</span>],
            ['Database', info.inMemoryDatabase ? <ToneChip tone="warning">Temporary (in memory)</ToneChip> : yesNo(info.database === 'connected', 'Connected', 'Disconnected')],
            ['Email sending', yesNo(info.smtpConfigured, info.mailProvider === 'mailjet' ? 'Connected (Mailjet)' : 'Connected (SMTP)', 'Not connected')],
            [
              'Delivery tracking',
              info.mailProvider === 'mailjet' ? yesNo(info.deliveryWebhook, 'Live (Mailjet webhook)', 'Manual refresh only') : <ToneChip tone="neutral">Needs Mailjet</ToneChip>,
            ],
            ['Secure cookies (HTTPS)', yesNo(info.cookieSecure, 'On', 'Off')],
            ['Upload limit', info.maxFileMb > 0 ? `${info.maxFileMb} MB per file` : 'No limit (programs and scripts refused)'],
            ['Customer link address', <span className="font-mono text-sm break-all">{info.publicBaseUrl}</span>],
            ['Submission alerts go to', info.notifyEmails.length ? info.notifyEmails.join(', ') : 'Nobody (NOTIFY_EMAILS is empty)'],
          ]}
        />
        <p className="mt-4 text-sm text-muted-foreground">These come from the backend’s environment settings and can only be changed by IT. See docs/OPERATIONS.md.</p>
      </FormSection>

      <FormSection icon={FlaskConical} title="Demo data" description="Sample customers in every state — for training, demos and trying things out safely.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Database size={18} className="text-muted-foreground" aria-hidden />
            <span className="text-sm">
              {info.demo.customers ? (
                <>
                  <b>{info.demo.customers}</b> sample customers are loaded (codes start with <span className="font-mono">DEMO-</span>).
                </>
              ) : (
                'No demo data is loaded.'
              )}
            </span>
          </div>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            <li>Covers not sent, sent, opened, submitted, verified and “needs correction”, plus overseas customers, a failed email and an expired link.</li>
            <li>Sample documents are PDFs stamped “SAMPLE — DEMO DATA”.</li>
            <li>Demo customers use made-up <span className="font-mono">.example</span> addresses and are never emailed — sending is simulated.</li>
            <li>Removing demo data deletes only the sample records. Real customers and settings are not touched.</li>
          </ul>
          {!info.demo.allowed ? (
            <Notice tone="neutral">Loading demo data is turned off on this live server. IT can allow it on a staging server with ALLOW_DEMO_DATA=true.</Notice>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!info.demo.allowed} onClick={() => setDialog('load')}>
              <FlaskConical /> {info.demo.customers ? 'Reload demo data' : 'Load demo data'}
            </Button>
            <Button variant="destructive" disabled={!info.demo.customers} onClick={() => setDialog('clear')}>
              <Trash2 /> Remove demo data
            </Button>
          </div>
        </div>
      </FormSection>

      <ConfirmDialog
        open={dialog === 'load'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={info.demo.customers ? 'Reload demo data?' : 'Load demo data?'}
        description="Adds about 20 sample customers with documents and history. Any existing demo data is replaced. Nobody is emailed."
        confirmLabel="Load demo data"
        onConfirm={async () => {
          try {
            const r = await systemApi.loadDemo();
            toast.success(`${r.customers} sample customers loaded`);
            await Promise.all([load(), refresh()]);
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
      <ConfirmDialog
        open={dialog === 'clear'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Remove all demo data?"
        description="Deletes the sample customers, their documents, the sample entity and their activity. Real data is not touched."
        confirmLabel="Remove demo data"
        confirmVariant="danger"
        onConfirm={async () => {
          try {
            const r = await systemApi.clearDemo();
            toast.success(`Removed ${r.customers} sample customers`);
            await Promise.all([load(), refresh()]);
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </div>
  );
}
