import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Trash2, UserPlus, Users } from 'lucide-react';
import { adminsApi } from '@/api/admins.api';
import { authApi } from '@/api/auth.api';
import { errorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { FormField, FormSection } from '@/components/common/Form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdmin } from '@/context/AdminContext';
import { fmtDateTime } from '@/lib/format';
import type { AdminUser } from '@/types';

const EMPTY_USER = { name: '', email: '', password: '' };

export function UsersSettings() {
  const { admin } = useAdmin();
  const [list, setList] = useState<AdminUser[]>([]);
  const [f, setF] = useState(EMPTY_USER);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [removing, setRemoving] = useState<AdminUser | null>(null);

  const load = useCallback(() => adminsApi.list().then((r) => setList(r.admins)).catch((e: unknown) => toast.error(errorMessage(e))), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    try {
      await adminsApi.create(f);
      toast.success(`${f.email} can now sign in`, { description: 'Share the temporary password securely and ask them to change it.' });
      setF(EMPTY_USER);
      void load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function changePassword() {
    try {
      await authApi.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '' });
      toast.success('Password changed', { description: 'Any other signed-in sessions were signed out.' });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <FormSection icon={Users} title="Admin users" description="Everyone here can see all customer data and documents, send emails and change settings.">
        <div className="-mx-5 -mt-5 mb-5 border-b border-border md:-mx-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5 md:pl-6">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Last sign-in</TableHead>
                <TableHead className="pr-5 text-right md:pr-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="pl-5 font-semibold md:pl-6">
                    {a.name || '—'} {a.id === admin.id ? <Badge variant="primary">You</Badge> : null}
                  </TableCell>
                  <TableCell>{a.email}</TableCell>
                  <TableCell className="text-muted-foreground">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'Never'}</TableCell>
                  <TableCell className="pr-5 text-right md:pr-6">
                    {a.id !== admin.id ? (
                      <Button variant="ghost" size="sm" className="text-danger" onClick={() => setRemoving(a)}>
                        <Trash2 /> Remove
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField label="Name" htmlFor="un">
            <Input id="un" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </FormField>
          <FormField label="Email" htmlFor="ue">
            <Input id="ue" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </FormField>
          <FormField label="Temporary password" htmlFor="up" help="At least 10 characters.">
            <Input id="up" type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </FormField>
          <div className="flex items-start pt-7">
            <Button variant="outline" onClick={add} disabled={!f.email || f.password.length < 10}>
              <UserPlus /> Add user
            </Button>
          </div>
        </div>
      </FormSection>

      <FormSection icon={KeyRound} title="Change my password" description="Changing it signs you out everywhere else.">
        <div className="grid gap-4 sm:grid-cols-4">
          <FormField label="Current password" htmlFor="cp">
            <Input id="cp" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </FormField>
          <FormField label="New password" htmlFor="np" help="At least 10 characters.">
            <Input id="np" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </FormField>
          <div className="flex items-start pt-7">
            <Button variant="outline" onClick={changePassword} disabled={!pw.current || pw.next.length < 10}>
              Change password
            </Button>
          </div>
        </div>
      </FormSection>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.email ?? ''}?`}
        description="They are signed out straight away and can no longer sign in. Their past actions stay in the activity log."
        confirmLabel="Remove user"
        confirmVariant="danger"
        onConfirm={async () => {
          try {
            if (removing) await adminsApi.remove(removing.id);
            toast.success('User removed');
            void load();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </div>
  );
}
