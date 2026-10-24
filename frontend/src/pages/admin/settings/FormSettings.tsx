import { useRef } from 'react';
import { toast } from 'sonner';
import { CalendarClock, FileText, Image as ImageIcon, LayoutList, Upload } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { publicApi } from '@/api/public.api';
import { settingsApi } from '@/api/settings.api';
import { FormField, FormSection } from '@/components/common/Form';
import { MciLogo } from '@/components/common/MciLogo';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Input, Textarea } from '@/components/ui/input';
import type { AppSettings } from '@/types';
import type { SettingsPatch } from './SettingsPage';

export function FormSettings({ s, patch, onLogoChange }: { s: AppSettings; patch: SettingsPatch; onLogoChange: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <FormSection icon={FileText} title="Form content" description="The heading and introduction customers read when they open their link.">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Organisation name" htmlFor="orgName" help="Shown in the header, emails and “… company you deal with”.">
            <Input id="orgName" value={s.orgName} onChange={(e) => patch('orgName', e.target.value)} />
          </FormField>
          <FormField label="Form title" htmlFor="formTitle">
            <Input id="formTitle" value={s.formTitle} onChange={(e) => patch('formTitle', e.target.value)} />
          </FormField>
          <FormField label="Subtitle" htmlFor="formSubtitle">
            <Input id="formSubtitle" value={s.formSubtitle} onChange={(e) => patch('formSubtitle', e.target.value)} />
          </FormField>
          <FormField label="Introduction" htmlFor="intro" className="sm:col-span-3">
            <Textarea id="intro" rows={3} value={s.intro} onChange={(e) => patch('intro', e.target.value)} />
          </FormField>
        </div>
      </FormSection>

      <FormSection icon={CalendarClock} title="Deadline and contact" description="The due date drives the countdown on the form and the automatic reminders.">
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Due date" htmlFor="dueDate" help="Shown on the form and in emails.">
            <Input id="dueDate" type="date" value={s.dueDate ?? ''} onChange={(e) => patch('dueDate', e.target.value)} />
          </FormField>
          <FormField label="Link valid for (days)" htmlFor="lv" help="For new links. Expired links renew when you email the customer.">
            <Input id="lv" type="number" min={1} max={365} value={s.linkValidityDays} onChange={(e) => patch('linkValidityDays', Number(e.target.value))} />
          </FormField>
          <div className="hidden sm:block" />
          <FormField label="Contact name" htmlFor="cn" help="Signs the emails.">
            <Input id="cn" value={s.contactName} onChange={(e) => patch('contactName', e.target.value)} />
          </FormField>
          <FormField label="Contact email" htmlFor="ce" help="Shown to customers and used as the reply-to address.">
            <Input id="ce" type="email" value={s.contactEmail} onChange={(e) => patch('contactEmail', e.target.value)} />
          </FormField>
        </div>
      </FormSection>

      <FormSection icon={LayoutList} title="Sections" description="Company, tax, contact details and the declaration are always asked — they are what e-invoicing needs.">
        <div className="grid gap-3 sm:grid-cols-2">
          <SectionToggle
            label="Ownership and signatories"
            help="Signatory Emirates ID and passport, MOA or certificate of incumbency, UBO declaration."
            checked={s.sections.ownership}
            onChange={(v) => patch('sections', { ...s.sections, ownership: v })}
          />
          <SectionToggle
            label="Bank details"
            help="Bank, branch, IBAN (checked automatically), SWIFT and a bank contact."
            checked={s.sections.bank}
            onChange={(v) => patch('sections', { ...s.sections, bank: v })}
          />
        </div>
      </FormSection>

      <FormSection icon={ImageIcon} title="Branding" description="The app uses the MCI design system. You can replace the logo on the customer form and set the colour of email buttons.">
        <div className="grid gap-4 sm:grid-cols-3">
          <LogoField has={!!s.logo?.storedName} onChange={onLogoChange} />
          <FormField label="Email button colour" htmlFor="ac" help="Default is MCI rose, #be2f48.">
            <div className="flex gap-2">
              <input
                type="color"
                aria-label="Pick email button colour"
                value={/^#[0-9a-f]{6}$/i.test(s.accentColor) ? s.accentColor : '#be2f48'}
                onChange={(e) => patch('accentColor', e.target.value)}
                className="h-10 w-12 cursor-pointer rounded-[10px] border border-input bg-card p-1"
              />
              <Input id="ac" className="font-mono" value={s.accentColor} onChange={(e) => patch('accentColor', e.target.value)} />
            </div>
          </FormField>
        </div>
      </FormSection>
    </div>
  );
}

function SectionToggle({ label, help, checked, onChange }: { label: string; help: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-muted/40">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="font-semibold">{label}</span>
        <span className="text-sm text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}

function LogoField({ has, onChange }: { has: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    try {
      await settingsApi.uploadLogo(file);
      toast.success('Logo updated');
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function remove() {
    try {
      await settingsApi.removeLogo();
      toast.success('Logo removed — the MCI logo is shown instead');
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <FormField label="Form logo" help="PNG, JPG, SVG or WebP under 1 MB. Without one, the MCI logo is used." className="sm:col-span-2">
      <div className="flex items-center gap-3 rounded-xl border border-border p-3">
        <span className="flex h-12 w-28 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-black/5">
          {has ? <img src={publicApi.logoUrl(Date.now())} alt="Current logo" className="max-h-10 max-w-24 object-contain" /> : <MciLogo size="md" className="ring-0" />}
        </span>
        <span className="flex-1 text-sm text-muted-foreground">{has ? 'Custom logo' : 'MCI logo (default)'}</span>
        {has ? (
          <Button variant="ghost" size="sm" onClick={remove}>
            Remove
          </Button>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
          <Upload /> Upload
        </Button>
        <input ref={ref} type="file" className="hidden" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => void upload(e.target.files?.[0])} />
      </div>
    </FormField>
  );
}
