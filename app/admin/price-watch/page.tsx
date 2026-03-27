import { createClient } from '@/lib/supabase/server';
import PriceWatchClient from './PriceWatchClient';

export default async function PriceWatchPage() {
  const supabase = await createClient();
  const { data: watches } = await supabase
    .from('price_watches')
    .select('*')
    .order('created_at', { ascending: false });

  return <PriceWatchClient watches={watches ?? []} />;
}
