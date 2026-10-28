import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlarmClock, CheckCircle2, Mail, MailWarning, Send } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { settingsApi } from '@/api/settings.api';
import { FormField, FormSection, Notice } from '@/components/common/Form';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Input, Textarea } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/menu';
import { useAdmin } from '@/context/AdminContext';
import type { AppSettings, EmailKind, EmailTemplates, RenderedEmail } from '@/types';
import type { SettingsPatch } from './SettingsPage';

const PLACEHOLDERS: [string, string][] = [
  ['code', 'Customer code'],
  ['customerName', 'Customer name'],
  ['dueDate', 'Due date'],
  ['button', '“Open the form” button'],
  ['link', 'Form link'],
  ['orgName', 'Organisation name'],
  ['contactName', 'Contact name'],
  ['contactEmail', 'Contact email'],
];

export function EmailSettings({ s, patch, smtpConfigured }: { s: AppSettings; patch: SettingsPatch; smtpConfigured: boolean }) {
  const { admin } = useAdmin();
  const [kind, setKind] = useState<EmailKind>('invite');
  const [preview, setPreview] = useState<RenderedEmail | null>(null);
  const [testTo, setTestTo] = useState(admin.email);
  const [sending, setSending] = useState(false);

  const setEmail = <K extends keyof EmailTemplates>(k: K, v: EmailTemplates[K]) => patch('email', { ...s.email, [k]: v });

  // Re-render the preview shortly after typing stops
  useEffect(() => {
    const t = setTimeout(() => {
      settingsApi
        .previewEmail(kind, s.email, {
          orgName: s.orgName,
          contactName: s.contactName,
          contactEmail: s.contactEmail,
          accentColor: s.accentColor,
          dueDate: s.dueDate || undefined,
        })
        .then(setPreview)
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [kind, s.email, s.orgName, s.contactName, s.contactEmail, s.accentColor, s.dueDate]);

  const subjKey = kind === 'invite' ? 'inviteSubject' : 'reminderSubject';
  const bodyKey = kind === 'invite' ? 'inviteBody' : 'reminderBody';

  async function sendTest() {
    setSending(true);
    try {
      const r = await settingsApi.testEmail(testTo);
      if (r.smtpConfigured) toast.success(`Test email sent to ${testTo}`);
      else toast.info('Written to the server log — the email server is not connected');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {smtpConfigured ? (
        <Notice tone="success" icon={CheckCircle2} title="Email sending is connected">
          Invites, reminders and confirmations are sent from the configured sender address.
        </Notice>
      ) : (
        <Notice tone="warning" icon={MailWarning} title="Email sending is not connected">
          Until IT adds the Mailjet API key and secret key to the backend’s <code className="font-mono">.env</code> file, emails are only written to the server log.
        </Notice>
      )}

      <FormSection
        icon={Send}
        title="Test the connection"
        description="Sends a short test email so you can check delivery and the sender address."
        actions={
          <Button variant="outline" size="sm" onClick={sendTest} disabled={sending}>
            <Send /> {sending ? 'Sending…' : 'Send test'}
          </Button>
        }
      >
        <FormField label="Send the test to" htmlFor="testTo" className="max-w-md">
          <Input id="testTo" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
        </FormField>
      </FormSection>

      <FormSection icon={Mail} title="Email wording" description="Edit the invite and reminder. The preview on the right updates as you type.">
        <Tabs value={kind} onValueChange={(v) => setKind(v as EmailKind)} className="gap-4">
          <TabsList variant="default">
            <TabsTrigger value="invite">Invite</TabsTrigger>
            <TabsTrigger value="reminder">Reminder</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          <div className="flex flex-col gap-4">
            <FormField label="Subject" htmlFor="subj">
              <Input id="subj" value={s.email[subjKey]} onChange={(e) => setEmail(subjKey, e.target.value)} />
            </FormField>
            <FormField label="Body" htmlFor="body">
              <Textarea id="body" className="min-h-80 font-mono text-[13px]" value={s.email[bodyKey]} onChange={(e) => setEmail(bodyKey, e.target.value)} />
            </FormField>
            <div className="rounded-xl bg-muted/60 p-3">
              <p className="mb-2 text-xs font-bold text-muted-foreground">Placeholders — replaced for each customer</p>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                {PLACEHOLDERS.map(([k, label]) => (
                  <div key={k} className="flex gap-2">
                    <dt className="font-mono text-foreground">{`{{${k}}}`}</dt>
                    <dd className="text-muted-foreground">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Preview</p>
            {preview ? (
              <>
                <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Subject:</span> <b>{preview.subject}</b>
                </p>
                <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[560px] w-full rounded-xl border border-border bg-white" />
              </>
            ) : (
              <div className="h-[560px] animate-pulse rounded-xl bg-muted" />
            )}
          </div>
        </div>
      </FormSection>

      <FormSection icon={AlarmClock} title="Automatic emails">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="Automatic reminders (days before the due date)"
            htmlFor="ard"
            help="e.g. 7,2 — only to invited customers who haven’t submitted. Needs email sending and a due date. Leave empty to turn off."
          >
            <Input id="ard" value={s.autoReminderDays} onChange={(e) => patch('autoReminderDays', e.target.value)} placeholder="7,2" />
          </FormField>
          <label className="flex cursor-pointer items-start gap-3 self-start rounded-xl border border-border p-4 sm:col-span-2">
            <Switch checked={!!s.email.sendConfirmation} onCheckedChange={(v) => setEmail('sendConfirmation', v)} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">Confirm each submission by email</span>
              <span className="text-sm text-muted-foreground">The customer gets a receipt with their TRN, TIN and PEPPOL ID after they submit.</span>
            </span>
          </label>
        </div>
      </FormSection>
    </div>
  );
}
