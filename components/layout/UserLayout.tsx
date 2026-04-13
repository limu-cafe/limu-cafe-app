import Navbar from '@/components/layout/Navbar';

type LayoutUser = {
  id: string;
  name: string;
  balance: number;
};

export default function UserLayout({
  children,
  initialUser = null,
}: {
  children: React.ReactNode;
  initialUser?: LayoutUser | null;
}) {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Navbar initialUser={initialUser} />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-10 md:pt-8">
        {children}
      </main>
    </div>
  );
}
