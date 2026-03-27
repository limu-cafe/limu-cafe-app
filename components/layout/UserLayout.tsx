import Navbar from '@/components/layout/Navbar';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 pb-24 md:pb-8 pt-6">
        {children}
      </main>
    </div>
  );
}
