import { Navigate, Route, Routes } from 'react-router-dom';
import AdminApp from '@/pages/admin/AdminApp';
import AuthCallback from '@/pages/admin/AuthCallback';
import Landing from '@/pages/public/Landing';
import PublicForm from '@/pages/public/PublicForm';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/f/:token" element={<PublicForm />} />
      <Route path="/admin/*" element={<AdminApp />} />
      {/* Microsoft sign-in returns here (ENTRA_REDIRECT_URI) */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
