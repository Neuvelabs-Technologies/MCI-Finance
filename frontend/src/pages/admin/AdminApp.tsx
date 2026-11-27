import { useCallback, useEffect, useMemo, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { authApi } from '@/api/auth.api';
import { Spinner } from '@/components/ui/controls';
import { AdminContext } from '@/context/AdminContext';
import { AdminLayout } from '@/layout/AdminLayout';
import type { MeResponse } from '@/types';
import Activity from './Activity';
import Emails from './Emails';
import Entities from './Entities';
import Guide from './guide/Guide';
import Login from './Login';
import NotFound from './NotFound';
import Overview from './Overview';
import CustomerDetail from './customers/CustomerDetail';
import CustomersList from './customers/CustomersList';
import SettingsPage from './settings/SettingsPage';
import TallyDashboard from './tally/TallyDashboard';

/** Admin panel: checks the session, then shows the sidebar and pages. */
export default function AdminApp() {
  // undefined = still checking, null = signed out
  const [me, setMe] = useState<MeResponse | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setMe(await authApi.me());
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setMe(null);
  }, []);

  const ctx = useMemo(() => (me ? { ...me, refresh, signOut } : null), [me, refresh, signOut]);

  if (me === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label="Loading" />
      </div>
    );
  }
  if (!ctx) return <Login onDone={refresh} />;

  return (
    <AdminContext.Provider value={ctx}>
      <AdminLayout>
        <Routes>
          <Route index element={<Overview />} />
          {/* key: switching between the two lists starts fresh (filters, selection, page) */}
          <Route path="customers" element={<CustomersList key="customer" type="customer" />} />
          <Route path="customers/:id" element={<CustomerDetail />} />
          <Route path="vendors" element={<CustomersList key="vendor" type="vendor" />} />
          <Route path="vendors/:id" element={<CustomerDetail />} />
          <Route path="emails" element={<Emails />} />
          <Route path="entities" element={<Entities />} />
          <Route path="activity" element={<Activity />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="guide" element={<Guide />} />
          {/* Only for admins given Tally access; the API refuses everyone else too */}
          {ctx.admin.tally ? <Route path="tally" element={<TallyDashboard />} /> : null}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AdminLayout>
    </AdminContext.Provider>
  );
}
