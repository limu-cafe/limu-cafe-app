import fs from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function parseArgs(argv) {
  const args = {
    file: path.resolve(process.cwd(), 'tmp/legacy-export.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--file' && next) {
      args.file = path.resolve(next);
      i += 1;
    }
  }

  return args;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を読み込んでから実行してください');
  }

  const raw = await fs.readFile(args.file, 'utf8');
  const payload = JSON.parse(raw);

  const legacyUsers = Array.isArray(payload.legacyUsers) ? payload.legacyUsers : [];
  const purchaseHistory = Array.isArray(payload.purchaseHistory) ? payload.purchaseHistory : [];

  const supabase = createClient(url, serviceRoleKey);
  const legacyUserKeys = legacyUsers.map((user) => user.legacy_user_key);

  const { data: existingLegacyUsers, error: existingLegacyUsersError } = await supabase
    .from('legacy_users')
    .select('id, legacy_user_key')
    .in('legacy_user_key', legacyUserKeys);

  if (existingLegacyUsersError) {
    throw new Error(existingLegacyUsersError.message);
  }

  const existingByKey = new Map((existingLegacyUsers ?? []).map((row) => [row.legacy_user_key, row]));
  const usersToInsert = [];
  const usersToUpdate = [];

  for (const legacyUser of legacyUsers) {
    const row = {
      source: legacyUser.source ?? payload.source ?? 'cafeorder-vuetify',
      legacy_user_key: legacyUser.legacy_user_key,
      name: legacyUser.name,
      email: legacyUser.email ?? null,
      legacy_balance: Number(legacyUser.legacy_balance ?? 0),
      favorite_item_names: Array.isArray(legacyUser.favorite_item_names)
        ? legacyUser.favorite_item_names
        : [],
      notes: legacyUser.notes ?? null,
      metadata: legacyUser.metadata ?? {},
      updated_at: new Date().toISOString(),
    };

    if (existingByKey.has(legacyUser.legacy_user_key)) {
      usersToUpdate.push(row);
    } else {
      usersToInsert.push(row);
    }
  }

  for (const rows of chunk(usersToInsert, 200)) {
    const { error } = await supabase.from('legacy_users').insert(rows);
    if (error) {
      throw new Error(error.message);
    }
  }

  for (const row of usersToUpdate) {
    const { error } = await supabase
      .from('legacy_users')
      .update(row)
      .eq('legacy_user_key', row.legacy_user_key);
    if (error) {
      throw new Error(error.message);
    }
  }

  const { data: importedLegacyUsers, error: importedLegacyUsersError } = await supabase
    .from('legacy_users')
    .select('id, legacy_user_key')
    .in('legacy_user_key', legacyUserKeys);

  if (importedLegacyUsersError) {
    throw new Error(importedLegacyUsersError.message);
  }

  const legacyUserIdByKey = new Map(
    (importedLegacyUsers ?? []).map((row) => [row.legacy_user_key, row.id])
  );
  const importedLegacyUserIds = (importedLegacyUsers ?? []).map((row) => row.id);

  if (importedLegacyUserIds.length > 0) {
    const { error } = await supabase
      .from('legacy_purchase_history')
      .delete()
      .in('legacy_user_id', importedLegacyUserIds);
    if (error) {
      throw new Error(error.message);
    }
  }

  const purchaseRows = purchaseHistory
    .map((row) => {
      const legacyUserId = legacyUserIdByKey.get(row.legacy_user_key);
      if (!legacyUserId) return null;
      return {
        legacy_user_id: legacyUserId,
        source_transaction_id: row.source_transaction_id ?? null,
        purchased_at: row.purchased_at ?? null,
        item_name: row.item_name,
        quantity: Number(row.quantity ?? 1),
        subtotal: Number(row.subtotal ?? 0),
        metadata: row.metadata ?? {},
      };
    })
    .filter(Boolean);

  for (const rows of chunk(purchaseRows, 500)) {
    if (rows.length === 0) continue;
    const { error } = await supabase.from('legacy_purchase_history').insert(rows);
    if (error) {
      throw new Error(error.message);
    }
  }

  console.log(`Imported legacy users: ${legacyUsers.length}`);
  console.log(`Imported purchase history rows: ${purchaseRows.length}`);
  console.log('Next step: open /admin/legacy and verify the imported legacy users.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
