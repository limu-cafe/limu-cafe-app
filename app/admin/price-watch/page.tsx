import { createAdminClient } from '@/lib/supabase/server';
import PriceWatchClient from './PriceWatchClient';

export const dynamic = 'force-dynamic';

export default async function PriceWatchPage() {
  const supabase = createAdminClient();
  const { data: watches } = await supabase
    .from('price_watches')
    .select('*')
    .order('created_at', { ascending: false });

  return <PriceWatchClient watches={watches ?? []} />;
}
