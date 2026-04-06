import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FIRESTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

function parseArgs(argv) {
  const args = {
    credentials: '',
    project: '',
    out: path.resolve(process.cwd(), 'tmp/legacy-export-prod.json'),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--credentials' && next) {
      args.credentials = path.resolve(next);
      i += 1;
    } else if (arg === '--project' && next) {
      args.project = next;
      i += 1;
    } else if (arg === '--out' && next) {
      args.out = path.resolve(next);
      i += 1;
    }
  }

  return args;
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function createJwt({ clientEmail, privateKey }) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  const payload = {
    iss: clientEmail,
    scope: FIRESTORE_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();
  const signature = signer.sign(privateKey);
  const encodedSignature = signature
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

async function getAccessToken(credentials) {
  const assertion = createJwt({
    clientEmail: credentials.client_email,
    privateKey: credentials.private_key,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  return payload.access_token;
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
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map((entry) => decodeFirestoreValue(entry));
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

async function listDocuments({ project, accessToken, collectionPath }) {
  const documents = [];
  let pageToken = null;

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collectionPath}`
    );
    url.searchParams.set('pageSize', '1000');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${collectionPath}: ${response.status} ${await response.text()}`);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.credentials) {
    throw new Error('--credentials に service account JSON のパスを指定してください');
  }

  const credentials = JSON.parse(await fs.readFile(args.credentials, 'utf8'));
  const project = args.project || credentials.project_id;

  if (!project) {
    throw new Error('project_id が特定できません。--project を指定してください');
  }

  await fs.mkdir(path.dirname(args.out), { recursive: true });

  const accessToken = await getAccessToken(credentials);
  const [users, items, authUsers, transactions] = await Promise.all([
    listDocuments({ project, accessToken, collectionPath: 'users' }),
    listDocuments({ project, accessToken, collectionPath: 'items' }),
    listDocuments({ project, accessToken, collectionPath: 'authUsers' }).catch(() => []),
    listDocuments({ project, accessToken, collectionPath: 'transactions' }),
  ]);

  const itemNameById = new Map(items.map((item) => [item.id, item.name]).filter(([, name]) => Boolean(name)));
  const authUserByLegacyUserId = new Map(
    authUsers.filter((authUser) => authUser.user).map((authUser) => [String(authUser.user), authUser])
  );

  const legacyUsers = users.map((user) => {
    const favoriteFlags = user.favorites && typeof user.favorites === 'object' ? user.favorites : {};
    const favoriteItemIds = Object.entries(favoriteFlags)
      .filter(([, enabled]) => enabled === true)
      .map(([itemId]) => itemId);
    const favoriteItemNames = favoriteItemIds
      .map((itemId) => itemNameById.get(itemId) ?? itemId)
      .filter(Boolean);

    const authUser = authUserByLegacyUserId.get(user.id) ?? null;

    return {
      source: 'cafeorder-vuetify-firestore',
      legacy_user_key: user.id,
      name: user.name ?? user.id,
      email: authUser?.email ?? null,
      legacy_balance: Number(user.balance ?? 0),
      favorite_item_names: favoriteItemNames,
      notes: user.enable === false ? '旧システムで無効化済みユーザー' : null,
      metadata: {
        extracted_from: 'firestore-production',
        legacy_user_id: user.id,
        raw_user: user,
        auth_user: authUser,
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
      project,
      accessToken,
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
    source: 'cafeorder-vuetify-firestore',
    extracted_at: new Date().toISOString(),
    project_id: project,
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

  console.log(`Legacy production export written to ${args.out}`);
  console.log(`Users: ${legacyUsers.length}`);
  console.log(`Purchase transactions: ${purchaseTransactions.length}`);
  console.log(`Purchase items: ${purchaseHistory.length}`);
  console.log(`Set transactions: ${setTransactions.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
