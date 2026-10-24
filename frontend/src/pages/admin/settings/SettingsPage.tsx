import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { settingsApi } from '@/api/settings.api';
import { PageHeader } from '@/components/common/PageHeader';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/menu';
import type { AppSettings } from '@/types';
import { EmailSettings } from './EmailSettings';
import { FormSettings } from './FormSettings';
import { SystemSettings } from './SystemSettings';
import { UsersSettings } from './UsersSettings';

const TABS = ['form', 'emails', 'users', 'system'] as const;
type Tab = (typeof TABS)[number];

export type SettingsPatch = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => void;

export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'form';
  const [s, setS] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await settingsApi.get();
      // The date input wants yyyy-mm-dd
      const next = { ...r.settings, dueDate: r.settings.dueDate ? r.settings.dueDate.slice(0, 10) : '' };
      setS(next);
      setSaved(JSON.stringify(next));
      setSmtpConfigured(r.smtpConfigured);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    document.title = 'Settings — MCI e-Invoicing';
    void load();
  }, [load]);

  const dirty = !!s && JSON.stringify(s) !== saved;

  // Warn before leaving the page with unsaved changes
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const patch: SettingsPatch = (k, v) => setS((x) => (x ? { ...x, [k]: v } : x));

  async function save() {
    if (!s) return;
    setBusy(true);
    try {
      await settingsApi.update(s);
      toast.success('Settings saved');
      await load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const savable = tab === 'form' || tab === 'emails';

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="What customers see on the form and in emails, who can sign in, and the state of this server."
        actions={
          savable ? (
            <Button onClick={save} disabled={busy || !dirty}>
              <Save /> {busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
            </Button>
          ) : null
        }
      />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="form">Form</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>
        {error ? (
          <ErrorState error={error} onRetry={load} />
        ) : !s ? (
          <LoadingState rows={3} />
        ) : (
          <>
            <TabsContent value="form">
              <FormSettings s={s} patch={patch} onLogoChange={load} />
            </TabsContent>
            <TabsContent value="emails">
              <EmailSettings s={s} patch={patch} smtpConfigured={smtpConfigured} />
            </TabsContent>
          </>
        )}
        <TabsContent value="users">
          <UsersSettings />
        </TabsContent>
        <TabsContent value="system">
          <SystemSettings />
        </TabsContent>
      </Tabs>
      {dirty && savable ? (
        <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-3 rounded-full border border-border bg-popover py-2 pr-2 pl-5 shadow-xl">
          <span className="text-sm font-semibold">You have unsaved changes</span>
          <Button size="sm" variant="ghost" onClick={() => s && setS(JSON.parse(saved) as AppSettings)}>
            Discard
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            Save
          </Button>
        </div>
      ) : null}
    </>
  );
}
