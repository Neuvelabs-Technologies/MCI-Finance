import { useEffect, useState, type ChangeEvent } from 'react';
import { errorMessage } from '@/api/client';
import { customersApi, type CustomerInput } from '@/api/customers.api';
import { FormField, Notice } from '@/components/common/Form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { partyLabels } from '@/lib/party';
import type { CustomerSummary, PartyType } from '@/types';

interface Props {
  /** Customer or vendor; when editing, the record's own type is used. */
  type?: PartyType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Leave out to add a new customer. */
  customer?: Pick<CustomerSummary, 'id' | 'type' | 'code' | 'name' | 'emails' | 'contactName' | 'notes'>;
  onSaved: (c: CustomerSummary) => void;
}

const fromCustomer = (c?: Props['customer']): CustomerInput => ({
  code: c?.code ?? '',
  name: c?.name ?? '',
  emails: (c?.emails ?? []).join(', '),
  contactName: c?.contactName ?? '',
  notes: c?.notes ?? '',
});

export function CustomerModal({ type, open, onOpenChange, customer, onSaved }: Props) {
  const L = partyLabels(customer?.type ?? type);
  const [f, setF] = useState<CustomerInput>(() => fromCustomer(customer));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // Start from the current record each time the dialog opens
  useEffect(() => {
    if (open) {
      setF(fromCustomer(customer));
      setErr('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: keyof CustomerInput) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    setBusy(true);
    setErr('');
    try {
      const r = customer ? await customersApi.update(customer.id, f) : await customersApi.create({ ...f, type: L.type });
      onSaved(r.customer);
      onOpenChange(false);
      if (!customer) setF(fromCustomer());
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customer ? `Edit ${L.singular}` : `Add a ${L.singular}`}</DialogTitle>
          <DialogDescription>
            {customer ? `Changes apply to the ${L.singular} record, not to what they submitted.` : 'A personal form link is created straight away. Nothing is emailed until you send the invite.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormField
            label={`${L.Singular} code`}
            required
            htmlFor="cc"
            help={`Your ERP ${L.singular} code. Shown in the email subject. Must not be used by another customer or vendor.`}
          >
            <Input id="cc" className="font-mono uppercase" value={f.code} onChange={set('code')} autoFocus={!customer} />
          </FormField>
          <FormField label="Company name" required htmlFor="nm" className="sm:col-span-2">
            <Input id="nm" value={f.name} onChange={set('name')} />
          </FormField>
          <FormField label="Email address(es)" htmlFor="em" className="sm:col-span-2" help="Where the invite goes. Separate several with commas.">
            <Input id="em" value={f.emails} onChange={set('emails')} placeholder="accounts@company.ae, finance@company.ae" />
          </FormField>
          <FormField label="Contact name" optional htmlFor="cn">
            <Input id="cn" value={f.contactName} onChange={set('contactName')} />
          </FormField>
          <FormField label="Internal notes" optional htmlFor="no" className="sm:col-span-3" help="Only the finance team sees these.">
            <Textarea id="no" value={f.notes} onChange={set('notes')} rows={3} />
          </FormField>
          {err ? (
            <Notice tone="danger" className="sm:col-span-3">
              {err}
            </Notice>
          ) : null}
          <button type="submit" hidden />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : customer ? 'Save changes' : `Add ${L.singular}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
