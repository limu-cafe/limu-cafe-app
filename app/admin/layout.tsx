import AdminAuthGuard from './AdminAuthGuard';
import AdminSidebar from './AdminSidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthGuard>
      <div className="min-h-screen flex bg-gray-950">
        <AdminSidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </AdminAuthGuard>
  );
}
