import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { errorMessage } from '@/api/client';
import { customersApi } from '@/api/customers.api';
import { Notice } from '@/components/common/Form';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ImportResult } from '@/types';

export function ImportModal({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const reset = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setFile(null);
      setRes(null);
      setErr('');
    }
  };

  async function go() {
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      setRes(await customersApi.import(file));
      onDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import customers</DialogTitle>
          <DialogDescription>
            An Excel (.xlsx) or CSV file with the columns <b>Code</b>, <b>Company name</b>, <b>Email</b> and optionally <b>Contact name</b>. Codes already on the list are updated; new codes are added.
          </DialogDescription>
        </DialogHeader>

        {!res ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                setFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
                drag ? 'border-primary bg-primary-soft' : 'border-input hover:border-foreground/30 hover:bg-muted/40'
              )}
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
                {file ? <FileSpreadsheet size={22} /> : <Upload size={22} />}
              </span>
              {file ? (
                <>
                  <span className="font-semibold">{file.name}</span>
                  <span className="text-sm text-muted-foreground">Click to choose a different file</span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Drop the file here, or click to choose</span>
                  <span className="text-sm text-muted-foreground">.xlsx or .csv, up to 5 MB</span>
                </>
              )}
            </button>
            <input ref={input} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <a href={customersApi.importTemplateUrl()} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-primary hover:underline">
              <Download size={15} /> Download the template
            </a>
            {err ? <Notice tone="danger">{err}</Notice> : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Notice tone="success" icon={CheckCircle2} title="Import finished">
              <b>{res.created}</b> added, <b>{res.updated}</b> updated.
            </Notice>
            {res.errors.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold">{plural(res.errors.length, 'row')} skipped</p>
                <ul className="max-h-52 overflow-auto rounded-xl border border-border text-sm">
                  {res.errors.map((e, i) => (
                    <li key={i} className="flex gap-3 border-b border-border px-3 py-2 last:border-0">
                      <span className="w-14 shrink-0 text-muted-foreground">Row {e.row}</span>
                      <span>{e.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {res ? (
            <Button onClick={() => reset(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => reset(false)}>
                Cancel
              </Button>
              <Button disabled={!file || busy} onClick={go}>
                {busy ? 'Importing…' : 'Import'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
