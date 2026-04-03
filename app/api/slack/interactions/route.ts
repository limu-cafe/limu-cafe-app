import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  openSlackRequestCommentModal,
  sendSlackDirectMessage,
} from '@/lib/slack';

function verifySlackSignature(rawBody: string, timestamp: string, signature: string) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    throw new Error('SLACK_SIGNING_SECRET is not set');
  }

  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (Number(timestamp) < fiveMinutesAgo) {
    return false;
  }

  const baseString = `v0:${timestamp}:${rawBody}`;
  const expectedSignature = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex')}`;

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

async function findUserBySlackId(slackUserId: string) {
  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, name, slack_user_id')
    .eq('slack_user_id', slackUserId)
    .maybeSingle();

  return user;
}

function extractCommentValue(payload: any) {
  return payload?.view?.state?.values?.request_comment_block?.request_comment_input?.value ?? '';
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get('x-slack-request-timestamp') ?? '';
  const signature = request.headers.get('x-slack-signature') ?? '';

  try {
    if (!verifySlackSignature(rawBody, timestamp, signature)) {
      return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payloadText = new URLSearchParams(rawBody).get('payload');
  if (!payloadText) {
    return NextResponse.json({ error: 'missing_payload' }, { status: 400 });
  }

  const payload = JSON.parse(payloadText);
  const supabase = createAdminClient();

  if (payload.type === 'block_actions') {
    const action = payload.actions?.[0];
    const slackUserId = payload.user?.id;

    if (!action || !slackUserId) {
      return NextResponse.json({ ok: true });
    }

    const currentUser = await findUserBySlackId(slackUserId);
    if (!currentUser) {
      await sendSlackDirectMessage({
        slackUserId,
        text: '先にアプリへ一度ログインして、Slack アカウントをひも付けてください。',
      });
      return NextResponse.json({ ok: true });
    }

    const value = action.value ? JSON.parse(action.value) : {};
    const requestId = value.requestId as string | undefined;
    const itemName = (value.itemName as string | undefined) ?? 'この要望';

    if (!requestId) {
      return NextResponse.json({ ok: true });
    }

    if (action.action_id === 'request_vote') {
      const { data: existingVote } = await supabase
        .from('item_request_votes')
        .select('id')
        .eq('request_id', requestId)
        .eq('user_id', currentUser.id)
        .maybeSingle();

      if (existingVote) {
        await supabase.from('item_request_votes').delete().eq('id', existingVote.id);
        await sendSlackDirectMessage({
          slackUserId,
          text: `要望「${itemName}」の賛成を取り消しました。`,
        });
      } else {
        await supabase.from('item_request_votes').insert({
          request_id: requestId,
          user_id: currentUser.id,
          vote_type: 'up',
        });
        await sendSlackDirectMessage({
          slackUserId,
          text: `要望「${itemName}」に賛成しました。アプリの要望ページにも反映されます。`,
        });
      }

      revalidatePath('/request');
      revalidatePath(`/request/${requestId}`);
      revalidatePath('/admin/requests');
      return NextResponse.json({ ok: true });
    }

    if (action.action_id === 'request_comment') {
      await openSlackRequestCommentModal({
        triggerId: payload.trigger_id,
        requestId,
        itemName: value.itemName ?? '要望',
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true });
  }

  if (payload.type === 'view_submission' && payload.view?.callback_id === 'request_comment_modal') {
    const slackUserId = payload.user?.id;
    if (!slackUserId) {
      return NextResponse.json({ response_action: 'clear' });
    }

    const currentUser = await findUserBySlackId(slackUserId);
    if (!currentUser) {
      return NextResponse.json({
        response_action: 'errors',
        errors: {
          request_comment_block: '先にアプリへログインしてアカウント連携を行ってください。',
        },
      });
    }

    const privateMetadata = payload.view?.private_metadata
      ? JSON.parse(payload.view.private_metadata)
      : {};
    const requestId = privateMetadata.requestId as string | undefined;
    const body = extractCommentValue(payload).trim();

    if (!body) {
      return NextResponse.json({
        response_action: 'errors',
        errors: {
          request_comment_block: 'コメントを入力してください。',
        },
      });
    }

    if (!requestId) {
      return NextResponse.json({ response_action: 'clear' });
    }

    await supabase.from('item_request_comments').insert({
      request_id: requestId,
      user_id: currentUser.id,
      body,
      source: 'slack',
    });

    revalidatePath('/request');
    revalidatePath(`/request/${requestId}`);
    revalidatePath('/admin/requests');

    return NextResponse.json({ response_action: 'clear' });
  }

  return NextResponse.json({ ok: true });
}
