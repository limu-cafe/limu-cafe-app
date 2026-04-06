import Navbar from '@/components/layout/Navbar';

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-10 md:pt-8">
        {children}
      </main>
    </div>
  );
}
