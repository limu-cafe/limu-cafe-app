import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_PROJECT_ID = 'limu-caffe-terminal';
const DEFAULT_HOST = 'http://127.0.0.1:8080';

function parseArgs(argv) {
  const args = {
    host: DEFAULT_HOST,
    project: DEFAULT_PROJECT_ID,
    oldRepo: '',
    out: path.resolve(process.cwd(), 'tmp/legacy-export.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--host' && next) {
      args.host = next;
      i += 1;
    } else if (arg === '--project' && next) {
      args.project = next;
      i += 1;
    } else if (arg === '--old-repo' && next) {
      args.oldRepo = path.resolve(next);
      i += 1;
    } else if (arg === '--out' && next) {
      args.out = path.resolve(next);
      i += 1;
    }
  }

  return args;
}

function decodeFirestoreValue(value) {
  if (!value) return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields ?? {});
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map((entry) => decodeFirestoreValue(entry));
  }
  if ('referenceValue' in value) return value.referenceValue;
  if ('geoPointValue' in value) return value.geoPointValue;
  if ('bytesValue' in value) return value.bytesValue;
  return null;
}

function decodeFirestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)])
  );
}

function decodeDocument(document) {
  return {
    id: document.name.split('/').pop(),
    ...decodeFirestoreFields(document.fields ?? {}),
  };
}

async function listDocuments({ host, project, collectionPath }) {
  const documents = [];
  let pageToken = null;

  do {
    const url = new URL(
      `/v1/projects/${project}/databases/(default)/documents/${collectionPath}`,
      host
    );
    url.searchParams.set('pageSize', '1000');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to fetch ${collectionPath}: ${response.status} ${body}`);
    }

    const payload = await response.json();
    documents.push(...(payload.documents ?? []).map(decodeDocument));
    pageToken = payload.nextPageToken ?? null;
  } while (pageToken);

  return documents;
}

function toIsoString(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function readAccountsJson(oldRepo) {
  if (!oldRepo) return [];
  const accountsPath = path.join(
    oldRepo,
    'firebase',
    'emulator_export',
    'auth_export',
    'accounts.json'
  );

  try {
    const raw = await fs.readFile(accountsPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed.users ?? [];
  } catch {
    return [];
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await fs.mkdir(path.dirname(args.out), { recursive: true });

  const [users, items, authUsers, transactions, authAccounts] = await Promise.all([
    listDocuments({ host: args.host, project: args.project, collectionPath: 'users' }),
    listDocuments({ host: args.host, project: args.project, collectionPath: 'items' }),
    listDocuments({ host: args.host, project: args.project, collectionPath: 'authUsers' }).catch(() => []),
    listDocuments({ host: args.host, project: args.project, collectionPath: 'transactions' }),
    readAccountsJson(args.oldRepo),
  ]);

  const itemNameById = new Map(items.map((item) => [item.id, item.name]).filter(([, name]) => Boolean(name)));
  const authUserByLegacyUserId = new Map(
    authUsers
      .filter((authUser) => authUser.user)
      .map((authUser) => [String(authUser.user), authUser.id])
  );
  const authAccountByUid = new Map(
    authAccounts
      .filter((account) => account.localId)
      .map((account) => [String(account.localId), account])
  );

  const legacyUsers = users.map((user) => {
    const favoriteFlags = user.favorites && typeof user.favorites === 'object' ? user.favorites : {};
    const favoriteItemIds = Object.entries(favoriteFlags)
      .filter(([, enabled]) => enabled === true)
      .map(([itemId]) => itemId);
    const favoriteItemNames = favoriteItemIds
      .map((itemId) => itemNameById.get(itemId) ?? itemId)
      .filter(Boolean);

    const authUid = authUserByLegacyUserId.get(user.id) ?? null;
    const authAccount = authUid ? authAccountByUid.get(authUid) ?? null : null;

    return {
      source: 'cafeorder-vuetify',
      legacy_user_key: user.id,
      name: user.name ?? user.id,
      email: authAccount?.email ?? null,
      legacy_balance: Number(user.balance ?? 0),
      favorite_item_names: favoriteItemNames,
      notes: user.enable === false ? '旧システムで無効化済みユーザー' : null,
      metadata: {
        extracted_from: 'firebase-emulator',
        legacy_user_id: user.id,
        auth_uid: authUid,
        raw_user: user,
        favorite_item_ids: favoriteItemIds,
      },
    };
  });

  const purchaseTransactions = transactions.filter((transaction) => transaction.type === 'purchase');
  const setTransactions = transactions
    .filter((transaction) => transaction.type === 'set')
    .map((transaction) => ({
      legacy_user_key: transaction.user,
      source_transaction_id: transaction.id,
      happened_at: toIsoString(transaction.timestamp),
      value: Number(transaction.value ?? 0),
      metadata: {
        raw_transaction: transaction,
      },
    }));

  const purchaseHistory = [];

  for (const transaction of purchaseTransactions) {
    const itemsInTransaction = await listDocuments({
      host: args.host,
      project: args.project,
      collectionPath: `transactions/${transaction.id}/items`,
    }).catch(() => []);

    for (const item of itemsInTransaction) {
      purchaseHistory.push({
        legacy_user_key: transaction.user,
        source_transaction_id: transaction.id,
        purchased_at: toIsoString(transaction.timestamp),
        item_name: item.name ?? item.id,
        quantity: Number(item.quantity ?? 1),
        subtotal: Number(item.subtotal ?? 0),
        metadata: {
          transaction_value: Number(transaction.value ?? 0),
          raw_transaction: transaction,
          raw_item: item,
        },
      });
    }
  }

  const output = {
    source: 'cafeorder-vuetify',
    extracted_at: new Date().toISOString(),
    project_id: args.project,
    counts: {
      users: legacyUsers.length,
      purchase_transactions: purchaseTransactions.length,
      purchase_items: purchaseHistory.length,
      set_transactions: setTransactions.length,
    },
    legacyUsers,
    purchaseHistory,
    setTransactions,
  };

  await fs.writeFile(args.out, JSON.stringify(output, null, 2));

  console.log(`Legacy export written to ${args.out}`);
  console.log(`Users: ${legacyUsers.length}`);
  console.log(`Purchase transactions: ${purchaseTransactions.length}`);
  console.log(`Purchase items: ${purchaseHistory.length}`);
  console.log(`Set transactions: ${setTransactions.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
