import Navbar from '@/components/layout/Navbar';
import { createAdminClient, createClient } from '@/lib/supabase/server';

export default async function UserLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let initialUser = null;

  if (user) {
    const adminClient = createAdminClient();
    const { data: profile } = await adminClient
      .from('users')
      .select('id, name, balance')
      .eq('id', user.id)
      .maybeSingle();

    initialUser =
      profile ?? {
        id: user.id,
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'LIMUメンバー',
        balance: 0,
      };
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Navbar initialUser={initialUser} />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:pb-10 md:pt-8">
        {children}
      </main>
    </div>
  );
}
