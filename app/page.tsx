import UserLayout from '@/components/layout/UserLayout';
import ItemCard from '@/components/user/ItemCard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Item, Category } from '@/types';
import ItemListClient from './ItemListClient';

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 承認確認
  const { data: profile } = await supabase
    .from('users')
    .select('is_approved')
    .eq('id', user.id)
    .single();

  if (!profile?.is_approved) redirect('/pending');

  const [{ data: items }, { data: categories }] = await Promise.all([
    supabase
      .from('items')
      .select('*, category:categories(*)')
      .eq('is_available', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('categories')
      .select('*')
      .order('sort_order'),
  ]);

  return (
    <UserLayout>
      <ItemListClient
        items={(items ?? []) as Item[]}
        categories={(categories ?? []) as Category[]}
      />
    </UserLayout>
  );
}
