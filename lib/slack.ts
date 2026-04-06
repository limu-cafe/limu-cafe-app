const WEBHOOK_ORDERS = process.env.SLACK_WEBHOOK_ORDERS!;
const WEBHOOK_ADMIN = process.env.SLACK_WEBHOOK_ADMIN!;
const REQUESTS_CHANNEL_ID = process.env.SLACK_REQUESTS_CHANNEL_ID ?? '';
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

async function callSlackApi(method: string, payload: object) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) {
    console.warn(`[Slack] Bot token not set, skipping ${method}`);
    return null;
  }

  try {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error(`[Slack] ${method} failed:`, data);
      return null;
    }
    return data;
  } catch (error) {
    console.error(`[Slack] ${method} failed:`, error);
    return null;
  }
}

export async function sendSlackDirectMessage(params: {
  slackUserId: string;
  text: string;
  blocks?: any[];
}) {
  return callSlackApi('chat.postMessage', {
    channel: params.slackUserId,
    text: params.text,
    blocks: params.blocks,
  });
}

export async function sendSlackDirectMessages(params: {
  slackUserIds: string[];
  text: string;
  blocks?: any[];
}) {
  const uniqueSlackUserIds = Array.from(
    new Set(params.slackUserIds.map((id) => id.trim()).filter(Boolean))
  );

  for (const slackUserId of uniqueSlackUserIds) {
    await sendSlackDirectMessage({
      slackUserId,
      text: params.text,
      blocks: params.blocks,
    });
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function buildRequestBlocks(params: {
  requestId: string;
  userName: string;
  itemName: string;
  desiredPrice?: number | null;
  reason?: string | null;
}): any[] {
  const detailPath = `/request/${params.requestId}`;

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `📝 *新しい商品要望*\n` +
          `*投稿者:* ${params.userName}\n` +
          `*商品名:* ${params.itemName}` +
          (params.desiredPrice ? `\n*希望価格:* ¥${params.desiredPrice.toLocaleString()}` : '') +
          (params.reason ? `\n*理由:* ${params.reason}` : ''),
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '賛成する',
          },
          style: 'primary',
          action_id: 'request_vote',
          value: JSON.stringify({ requestId: params.requestId, itemName: params.itemName }),
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'コメントする',
          },
          action_id: 'request_comment',
          value: JSON.stringify({ requestId: params.requestId, itemName: params.itemName }),
        },
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'アプリで見る',
          },
          url: APP_BASE_URL ? `${APP_BASE_URL}${detailPath}` : undefined,
          action_id: APP_BASE_URL ? undefined : 'request_open_app',
          value: APP_BASE_URL ? undefined : JSON.stringify({ requestId: params.requestId }),
        },
      ].filter(Boolean),
    },
  ];
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
  requestId: string;
  userName: string;
  itemName: string;
  desiredPrice?: number | null;
  reason?: string | null;
  slackUserIds?: string[];
}) {
  await sendWebhook(WEBHOOK_ADMIN, {
    blocks: buildRequestBlocks(params).concat({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: appLink('/admin/requests', '管理画面で要望を見る'),
        },
      ],
    }),
  });

  if (params.slackUserIds?.length) {
    await sendSlackDirectMessages({
      slackUserIds: params.slackUserIds,
      text: `新しい商品要望: ${params.itemName}`,
      blocks: buildRequestBlocks(params),
    });
  } else if (REQUESTS_CHANNEL_ID) {
    await callSlackApi('chat.postMessage', {
      channel: REQUESTS_CHANNEL_ID,
      text: `新しい商品要望: ${params.itemName}`,
      blocks: buildRequestBlocks(params),
    });
  }
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
  requestId?: string;
}) {
  await sendSlackDirectMessage({
    slackUserId: params.slackUserId,
    text:
      `✅ 商品要望「${params.itemName}」が採用されました！近日中に購入できるようになります🎉\n` +
      (APP_BASE_URL ? `${APP_BASE_URL}/request/${params.requestId ?? ''}` : ''),
  });
}

export async function notifyRequestRejected(params: {
  slackUserId: string;
  itemName: string;
  requestId?: string;
  adminNote?: string | null;
}) {
  await sendSlackDirectMessage({
    slackUserId: params.slackUserId,
    text:
      `📝 商品要望「${params.itemName}」は今回は見送りになりました。` +
      (params.adminNote ? `\n管理者メモ: ${params.adminNote}` : '') +
      (APP_BASE_URL ? `\n${APP_BASE_URL}/request/${params.requestId ?? ''}` : ''),
  });
}

export async function notifyRequestComment(params: {
  slackUserId: string;
  itemName: string;
  commenterName: string;
  commentBody: string;
  requestId?: string;
}) {
  await sendSlackDirectMessage({
    slackUserId: params.slackUserId,
    text:
      `💬 要望「${params.itemName}」に ${params.commenterName} さんからコメントが付きました。\n` +
      `${params.commentBody}\n` +
      (APP_BASE_URL ? `${APP_BASE_URL}/request/${params.requestId ?? ''}` : ''),
  });
}

export async function notifyChargeReviewed(params: {
  slackUserId: string;
  amount: number;
  status: 'approved' | 'rejected';
}) {
  const statusLabel = params.status === 'approved' ? '承認' : '却下';
  await sendSlackDirectMessage({
    slackUserId: params.slackUserId,
    text:
      `💴 チャージ申請（¥${params.amount.toLocaleString()}）が${statusLabel}されました。` +
      (APP_BASE_URL ? `\n${APP_BASE_URL}/mypage` : ''),
  });
}

export async function notifyLegacyTransferReviewed(params: {
  slackUserId: string;
  status: 'completed' | 'rejected';
  reason?: string | null;
}) {
  await sendSlackDirectMessage({
    slackUserId: params.slackUserId,
    text:
      (params.status === 'completed'
        ? '📚 旧データの引き継ぎが完了しました。'
        : `📚 旧データの引き継ぎ申請は却下されました。${params.reason ? `\n理由: ${params.reason}` : ''}`) +
      (APP_BASE_URL ? `\n${APP_BASE_URL}/mypage` : ''),
  });
}

export async function openSlackRequestCommentModal(params: {
  triggerId: string;
  requestId: string;
  itemName: string;
}) {
  return callSlackApi('views.open', {
    trigger_id: params.triggerId,
    view: {
      type: 'modal',
      callback_id: 'request_comment_modal',
      private_metadata: JSON.stringify({ requestId: params.requestId }),
      title: {
        type: 'plain_text',
        text: '要望コメント',
      },
      submit: {
        type: 'plain_text',
        text: '送信',
      },
      close: {
        type: 'plain_text',
        text: '閉じる',
      },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${params.itemName}* へのコメントを入力してください。`,
          },
        },
        {
          type: 'input',
          block_id: 'request_comment_block',
          label: {
            type: 'plain_text',
            text: 'コメント',
          },
          element: {
            type: 'plain_text_input',
            action_id: 'request_comment_input',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text: '賛同や補足を書けます',
            },
          },
        },
      ],
    },
  });
}

export async function sendSlackEphemeralMessage(params: {
  channel: string;
  user: string;
  text: string;
}) {
  return callSlackApi('chat.postEphemeral', {
    channel: params.channel,
    user: params.user,
    text: params.text,
  });
}

// 定期精算リマインド
export async function notifyMonthlySettlement(params: {
  users: { slackUserId: string; name: string; amount: number }[];
}) {
  for (const user of params.users) {
    await sendSlackDirectMessage({
      slackUserId: user.slackUserId,
      text:
        `📅 定期精算のお知らせ\n` +
        `${user.name}さんの現在の後払い残高は ¥${user.amount.toLocaleString()} です。\n` +
        `LIMU喫茶で精算をお願いします。\n` +
        (APP_BASE_URL ? `${APP_BASE_URL}/mypage` : ''),
    });
    await new Promise((r) => setTimeout(r, 200));
  }
}
