import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Building2, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { entitiesApi } from '@/api/entities.api';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormField, Notice } from '@/components/common/Form';
import { PageHeader } from '@/components/common/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EMIRATES } from '@/lib/rules';
import type { Entity } from '@/types';

const EMPTY: Entity = {
  key: '', name: '', licensedBy: '', licenceType: 'Trade licence', issuingAuthority: '', licenceNo: '', tin: '', trn: '',
  peppolId: '', address: '', emirate: '', freeZone: false, contactName: '', contactEmail: '', sortOrder: 0, active: true,
};

export default function Entities() {
  const [list, setList] = useState<Entity[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [edit, setEdit] = useState<Entity | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setList((await entitiesApi.list()).entities);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    document.title = 'Our entities — MCI e-Invoicing';
    void load();
  }, [load]);

  const add = () => setEdit({ ...EMPTY, sortOrder: (list?.length ?? 0) + 1 });

  return (
    <>
      <PageHeader
        title="Our entities"
        subtitle="MCI’s own legal entities. Customers tick the ones they deal with and see these e-invoicing details at the top of their form — so they must match the trade licence and TRN certificate exactly."
        actions={
          <Button onClick={add}>
            <Plus /> Add entity
          </Button>
        }
      />
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !list ? (
        <LoadingState rows={2} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No entities yet"
          description="Add each MCI legal entity that invoices customers."
          action={
            <Button onClick={add}>
              <Plus /> Add entity
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((e) => (
            <article key={e._id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
              <header className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <Building2 size={19} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold leading-snug">{e.name}</h2>
                  <p className="text-sm text-muted-foreground">{e.licensedBy || e.issuingAuthority}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {!e.active ? (
                      <Badge variant="neutral">
                        <EyeOff /> Hidden from the form
                      </Badge>
                    ) : (
                      <Badge variant="success">Shown on the form</Badge>
                    )}
                    {e.freeZone ? <Badge variant="info">Free zone</Badge> : null}
                    {e.demo ? <Badge variant="warning">Demo</Badge> : null}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEdit(e)}>
                  <Pencil /> Edit
                </Button>
              </header>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <Fact label="TRN" value={e.trn} />
                <Fact label="TIN" value={e.tin} />
                <Fact label="PEPPOL ID" value={e.peppolId} />
                <Fact label="Licence no." value={e.licenceNo} />
              </dl>
              {e.address ? <p className="border-t border-border pt-3 text-sm text-muted-foreground">{e.address}</p> : null}
            </article>
          ))}
        </div>
      )}
      <EntityDialog
        entity={edit}
        onClose={() => setEdit(null)}
        onSaved={() => {
          setEdit(null);
          void load();
        }}
      />
    </>
  );
}

function Fact({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-[13px] font-semibold">{value || '—'}</dd>
    </div>
  );
}

function EntityDialog({ entity, onClose, onSaved }: { entity: Entity | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Entity>(EMPTY);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (entity) {
      setF({ ...EMPTY, ...entity });
      setErr('');
    }
  }, [entity]);

  const set = <K extends keyof Entity>(k: K, val: Entity[K]) =>
    setF((x) => {
      const n = { ...x, [k]: val };
      // Keep the PEPPOL ID in step with the TIN unless it was edited by hand
      if (k === 'tin' && typeof val === 'string' && /^\d{10}$/.test(val) && (!x.peppolId || x.peppolId === `0235:${x.tin}`)) n.peppolId = `0235:${val}`;
      return n;
    });

  async function save() {
    setBusy(true);
    setErr('');
    try {
      if (entity?._id) await entitiesApi.update(entity._id, f);
      else await entitiesApi.create(f);
      toast.success(entity?._id ? 'Entity updated' : 'Entity added');
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const text = (k: 'name' | 'key' | 'licensedBy' | 'licenceType' | 'issuingAuthority' | 'licenceNo' | 'trn' | 'tin' | 'peppolId' | 'contactName' | 'contactEmail', extra: { mono?: boolean; type?: string; inputMode?: 'numeric' } = {}) => (
    <Input
      id={`e-${k}`}
      type={extra.type}
      inputMode={extra.inputMode}
      className={extra.mono ? 'font-mono' : undefined}
      value={f[k] ?? ''}
      onChange={(e) => set(k, e.target.value)}
    />
  );

  return (
    <>
      <Dialog open={!!entity} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{entity?._id ? `Edit ${entity.name}` : 'Add an entity'}</DialogTitle>
            <DialogDescription>Copy these exactly from the trade licence and the FTA certificates — customers load them into their supplier records.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Legal name" required htmlFor="e-name" className="sm:col-span-2">
              {text('name')}
            </FormField>
            <FormField label="Short label" optional htmlFor="e-key" help="Internal, e.g. LLC">
              {text('key')}
            </FormField>
            <FormField label="Line under the name" htmlFor="e-licensedBy" help="e.g. “Licensed by Dubai DET”">
              {text('licensedBy')}
            </FormField>
            <FormField label="Licence / document type" htmlFor="e-licenceType">
              {text('licenceType')}
            </FormField>
            <FormField label="Licence issuing authority" htmlFor="e-issuingAuthority">
              {text('issuingAuthority')}
            </FormField>
            <FormField label="Licence number" htmlFor="e-licenceNo">
              {text('licenceNo', { mono: true })}
            </FormField>
            <FormField label="TRN" htmlFor="e-trn" help="15 digits">
              {text('trn', { mono: true, inputMode: 'numeric' })}
            </FormField>
            <FormField label="TIN" htmlFor="e-tin" help="10 digits">
              {text('tin', { mono: true, inputMode: 'numeric' })}
            </FormField>
            <FormField label="PEPPOL ID" htmlFor="e-peppolId" help="0235: followed by the TIN — filled in for you">
              {text('peppolId', { mono: true })}
            </FormField>
            <FormField label="Emirate" htmlFor="e-emirate">
              <Select value={f.emirate || 'none'} onValueChange={(v) => set('emirate', v === 'none' ? '' : v)}>
                <SelectTrigger id="e-emirate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {[...EMIRATES, ...(f.emirate && !EMIRATES.includes(f.emirate) ? [f.emirate] : [])].map((x) => (
                    <SelectItem key={x} value={x}>
                      {x}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <ToggleField label="Free zone based" checked={!!f.freeZone} onChange={(v) => set('freeZone', v)} />
            <FormField label="Full address" htmlFor="e-address" className="sm:col-span-3">
              <Textarea id="e-address" rows={2} value={f.address} onChange={(e) => set('address', e.target.value)} />
            </FormField>
            <FormField label="Contact name" htmlFor="e-contactName">
              {text('contactName')}
            </FormField>
            <FormField label="Contact email" htmlFor="e-contactEmail">
              {text('contactEmail', { type: 'email' })}
            </FormField>
            <FormField label="Display order" htmlFor="e-sortOrder">
              <Input id="e-sortOrder" type="number" value={f.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />
            </FormField>
            <ToggleField label="Show on the customer form" checked={!!f.active} onChange={(v) => set('active', v)} help="Hide an entity instead of deleting it once customers have picked it." />
            {err ? (
              <Notice tone="danger" className="sm:col-span-3">
                {err}
              </Notice>
            ) : null}
          </div>
          <DialogFooter>
            {entity?._id ? (
              <Button variant="destructive" className="sm:mr-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Delete
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${entity?.name ?? 'entity'}?`}
        description="Only possible while no customer has picked it. Otherwise switch off “Show on the customer form” instead."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={async () => {
          try {
            if (entity?._id) await entitiesApi.remove(entity._id);
            toast.success('Entity deleted');
            onSaved();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </>
  );
}

function ToggleField({ label, checked, onChange, help }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 self-end rounded-xl border border-border px-3 py-2.5">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{label}</span>
        {help ? <span className="text-xs text-muted-foreground">{help}</span> : null}
      </span>
    </label>
  );
}
