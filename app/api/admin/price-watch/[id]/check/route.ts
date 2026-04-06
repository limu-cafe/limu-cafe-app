import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { notifyPriceDrop } from '@/lib/slack';

// Amazonの価格をKeepa APIで取得する関数
async function fetchAmazonPrice(url: string): Promise<number | null> {
  const keepaKey = process.env.KEEPA_API_KEY;
  if (!keepaKey) return null;

  // ASIN抽出
  const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
  if (!asinMatch) return null;
  const asin = asinMatch[1];

  try {
    const res = await fetch(
      `https://api.keepa.com/product?key=${keepaKey}&domain=5&asin=${asin}&stats=1`
    );
    const data = await res.json();
    const product = data.products?.[0];
    // Keepaの価格はセント単位（日本円の場合は10倍）
    const price = product?.stats?.current?.[0];
    return price && price > 0 ? Math.round(price / 10) : null;
  } catch {
    return null;
  }
}

// 楽天・Yahooはスクレイピング（簡易版）
async function fetchGenericPrice(_url: string): Promise<number | null> {
  // 実装は複雑なため、今は null を返す
  // 本番では puppeteer や cheerio を使う
  return null;
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();

  const { data: watch } = await supabase
    .from('price_watches')
    .select('*')
    .eq('id', params.id)
    .single();

  if (!watch) return NextResponse.json({ error: '監視設定が見つかりません' }, { status: 404 });

  let currentPrice: number | null = null;

  if (watch.platform === 'amazon') {
    currentPrice = await fetchAmazonPrice(watch.url);
  } else {
    currentPrice = await fetchGenericPrice(watch.url);
  }

  // 価格を更新
  await supabase
    .from('price_watches')
    .update({
      current_price: currentPrice,
      last_checked_at: new Date().toISOString(),
    })
    .eq('id', params.id);

  // 目標価格以下になったら通知
  if (currentPrice !== null && currentPrice <= watch.target_price) {
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
      .eq('id', params.id);
  }

  return NextResponse.json({ ok: true, current_price: currentPrice });
}
