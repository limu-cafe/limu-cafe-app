import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notifyPriceDrop } from '@/lib/slack';

// Vercel Cron: 毎日朝9時に実行
// vercel.json で "schedule": "0 0 * * *" を設定
export async function GET(request: Request) {
  // Cron認証（Vercel自動付与のAuthorizationヘッダーで確認）
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: watches } = await supabase
    .from('price_watches')
    .select('*')
    .eq('is_active', true);

  if (!watches || watches.length === 0) {
    return NextResponse.json({ ok: true, checked: 0 });
  }

  let checkedCount = 0;
  let droppedCount = 0;

  for (const watch of watches) {
    try {
      // Amazon価格チェック（Keepa API）
      let currentPrice: number | null = null;

      if (watch.platform === 'amazon') {
        const keepaKey = process.env.KEEPA_API_KEY;
        if (keepaKey) {
          const asinMatch = watch.url.match(/\/dp\/([A-Z0-9]{10})/);
          if (asinMatch) {
            const res = await fetch(
              `https://api.keepa.com/product?key=${keepaKey}&domain=5&asin=${asinMatch[1]}&stats=1`
            );
            const data = await res.json();
            const price = data.products?.[0]?.stats?.current?.[0];
            currentPrice = price && price > 0 ? Math.round(price / 10) : null;
          }
        }
      }

      await supabase
        .from('price_watches')
        .update({
          current_price: currentPrice,
          last_checked_at: new Date().toISOString(),
        })
        .eq('id', watch.id);

      checkedCount++;

      // 目標価格以下で、直近24時間に通知していない場合
      if (currentPrice !== null && currentPrice <= watch.target_price) {
        const lastNotified = watch.notified_at ? new Date(watch.notified_at) : null;
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        if (!lastNotified || lastNotified < oneDayAgo) {
          await notifyPriceDrop({
            itemName: watch.item_name,
            currentPrice,
            targetPrice: watch.target_price,
            url: watch.url,
            platform: watch.platform,
          });
          await supabase
            .from('price_watches')
            .update({ notified_at: new Date().toISOString() })
            .eq('id', watch.id);
          droppedCount++;
        }
      }

      // APIレート制限対策
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[PriceWatch] Error checking ${watch.item_name}:`, err);
    }
  }

  return NextResponse.json({ ok: true, checked: checkedCount, dropped: droppedCount });
}
