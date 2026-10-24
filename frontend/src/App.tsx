import { Navigate, Route, Routes } from 'react-router-dom';
import AdminApp from '@/pages/admin/AdminApp';
import Landing from '@/pages/public/Landing';
import PublicForm from '@/pages/public/PublicForm';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/f/:token" element={<PublicForm />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
