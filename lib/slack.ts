const WEBHOOK_ORDERS = process.env.SLACK_WEBHOOK_ORDERS!;
const WEBHOOK_ADMIN = process.env.SLACK_WEBHOOK_ADMIN!;
const APP_BASE_URL =
  process.env.APP_BASE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  '';

function appLink(path: string, label: string) {
  if (!APP_BASE_URL) return `*${label}:* ${path}`;
  return `*${label}:* <${APP_BASE_URL}${path}|${label}>`;
}

async function sendWebhook(webhookUrl: string, payload: object) {
  if (!webhookUrl) {
    console.warn('[Slack] Webhook URL not set, skipping notification');
    return;
  }
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[Slack] Failed to send notification:', err);
  }
}

// 注文が入ったとき
export async function notifyNewOrder(params: {
  userName: string;
  items: { name: string; quantity: number; price: number }[];
  total: number;
  paymentMethod: string;
}) {
  const itemList = params.items
    .map(i => `• ${i.name} × ${i.quantity} (¥${i.price.toLocaleString()})`)
    .join('\n');

  const methodLabel: Record<string, string> = {
    balance: '残高払い',
    deferred: '後払い',
    cash: '現金',
    stripe: 'クレカ',
  };

  await sendWebhook(WEBHOOK_ORDERS, {
    text: `🛒 *新しい注文が入りました！*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🛒 *新しい注文が入りました！*\n*注文者:* ${params.userName}\n*支払い方法:* ${methodLabel[params.paymentMethod] ?? params.paymentMethod}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `*注文内容:*\n${itemList}\n\n` +
            `*合計: ¥${params.total.toLocaleString()}*\n` +
            `${appLink('/admin/orders', '注文一覧を開く')}`,
        },
      },
    ],
  });
}

// 現金チャージ申請が来たとき
export async function notifyCashChargeRequest(params: {
  userName: string;
  amount: number;
  requestId: string;
}) {
  await sendWebhook(WEBHOOK_ADMIN, {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `💴 *現金チャージ申請が届きました*\n` +
            `*申請者:* ${params.userName}\n` +
            `*金額:* ¥${params.amount.toLocaleString()}\n\n` +
            `管理者画面から承認してください。\n` +
            `${appLink('/admin/charge', 'チャージ承認を開く')}`,
        },
      },
    ],
  });
}

// 商品要望が来たとき
export async function notifyNewItemRequest(params: {
  userName: string;
  itemName: string;
  desiredPrice?: number | null;
  reason?: string | null;
}) {
  await sendWebhook(WEBHOOK_ADMIN, {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `📝 *新しい商品要望が届きました*\n` +
            `*申請者:* ${params.userName}\n` +
            `*商品名:* ${params.itemName}` +
            (params.desiredPrice ? `\n*希望価格:* ¥${params.desiredPrice.toLocaleString()}` : '') +
            (params.reason ? `\n*理由:* ${params.reason}` : '') +
            `\n\n${appLink('/admin/requests', '商品要望を開く')}`,
        },
      },
    ],
  });
}

// 現金注文の確認待ち
export async function notifyCashOrderPending(params: {
  userName: string;
  total: number;
  items: { name: string; quantity: number }[];
}) {
  const itemList = params.items
    .map((item) => `• ${item.name} × ${item.quantity}`)
    .join('\n');

  await sendWebhook(WEBHOOK_ADMIN, {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `💵 *現金払い注文の確認待ちがあります*\n` +
            `*注文者:* ${params.userName}\n` +
            `*合計:* ¥${params.total.toLocaleString()}\n\n` +
            `*注文内容:*\n${itemList}\n\n` +
            `管理者画面で受け取り確認をしてください。\n` +
            `${appLink('/admin/orders', '注文一覧を開く')}`,
        },
      },
    ],
  });
}

// 在庫アラート
export async function notifyLowStock(params: {
  itemName: string;
  currentStock: number;
  threshold: number;
}) {
  await sendWebhook(WEBHOOK_ADMIN, {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `⚠️ *在庫が少なくなっています*\n` +
            `*商品:* ${params.itemName}\n` +
            `*現在の在庫:* ${params.currentStock}個（アラート閾値: ${params.threshold}個）\n\n` +
            `入荷の手配をご検討ください。\n` +
            `${appLink('/admin/stock', '在庫入力を開く')}`,
        },
      },
    ],
  });
}

// 価格が目標以下になったとき
export async function notifyPriceDrop(params: {
  itemName: string;
  currentPrice: number;
  targetPrice: number;
  url: string;
  platform: string;
}) {
  await sendWebhook(WEBHOOK_ADMIN, {
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            `💸 *価格が目標額を下回りました！*\n` +
            `*商品:* ${params.itemName}\n` +
            `*現在価格:* ¥${params.currentPrice.toLocaleString()}\n` +
            `*目標価格:* ¥${params.targetPrice.toLocaleString()}\n` +
            `*プラットフォーム:* ${params.platform}\n` +
            `*URL:* ${params.url}\n\n` +
            `${appLink('/admin/price-watch', '価格監視を開く')}`,
        },
      },
    ],
  });
}

// 商品要望が採用されたとき（Slack DM用 - Bot Token必要）
export async function notifyRequestApproved(params: {
  slackUserId: string;
  itemName: string;
}) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return;

  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${botToken}`,
      },
        body: JSON.stringify({
          channel: params.slackUserId,
          text:
            `✅ 商品要望「${params.itemName}」が採用されました！近日中に購入できるようになります🎉\n` +
            (APP_BASE_URL ? `${APP_BASE_URL}/` : ''),
        }),
      });
  } catch (err) {
    console.error('[Slack] Failed to send DM:', err);
  }
}

// 月次精算リマインド
export async function notifyMonthlySettlement(params: {
  users: { slackUserId: string; name: string; amount: number }[];
}) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return;

  for (const user of params.users) {
    try {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${botToken}`,
        },
        body: JSON.stringify({
          channel: user.slackUserId,
          text:
            `📅 月次精算のお知らせ\n` +
            `${user.name}さんの今月の後払い残高は ¥${user.amount.toLocaleString()} です。\n` +
            `LIMU喫茶で精算をお願いします。\n` +
            (APP_BASE_URL ? `${APP_BASE_URL}/mypage` : ''),
        }),
      });
      // レート制限対策で少し待つ
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.error(`[Slack] Failed to send DM to ${user.name}:`, err);
    }
  }
}
