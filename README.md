# ☕ LIMU喫茶

研究室メンバー向けオンライン購買システム。

---

## 技術スタック

| 役割 | サービス |
|---|---|
| フロント・バックエンド | Next.js 14 (App Router) |
| データベース・認証 | Supabase (PostgreSQL) |
| ログイン | Slack OAuth |
| 決済 | Stripe |
| 通知 | Slack Webhook / Bot |
| ホスティング | Vercel |
| 価格監視 | Keepa API (Amazon) |

---

## 初回セットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/yourorg/limu-cafe.git
cd limu-cafe
npm install
```

### 2. Supabase のセットアップ

1. [supabase.com](https://supabase.com) でプロジェクトを作成
2. **SQL Editor** で以下を順番に実行：
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rpc_functions.sql`
3. **Project Settings → API** から以下をコピー：
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` キー → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` キー → `SUPABASE_SERVICE_ROLE_KEY`

### 3. Slack アプリのセットアップ

1. [api.slack.com/apps](https://api.slack.com/apps) で新規アプリを作成
2. **OAuth & Permissions** で以下のスコープを追加：
   - `openid`, `profile`, `email`（OIDC用）
   - `chat:write`（DM送信用）
3. **Redirect URLs** に追加：
   ```
   https://your-supabase-project.supabase.co/auth/v1/callback
   ```
4. Supabase ダッシュボード → **Authentication → Providers → Slack** で
   Client ID / Secret を設定
5. **Incoming Webhooks** でチャンネルごとにWebhook URLを作成：
   - `#limu-orders` → `SLACK_WEBHOOK_ORDERS`
   - `#limu-admin` → `SLACK_WEBHOOK_ADMIN`
6. **Bot Token** をコピー → `SLACK_BOT_TOKEN`

### 4. Stripe のセットアップ（クレカ払いを使う場合）

1. [stripe.com](https://stripe.com) でアカウント作成
2. **Developers → API keys** からキーを取得
3. テスト環境で動作確認後、本番キーに切り替え

### 5. 環境変数の設定

```bash
cp .env.local.example .env.local
# .env.local を編集して各値を設定
```

### 6. 開発サーバーの起動

```bash
npm run dev
# → http://localhost:3000
```

### 7. Vercel へのデプロイ

```bash
# Vercel CLI
npx vercel

# または GitHub連携で自動デプロイ
```

Vercel ダッシュボード → **Settings → Environment Variables** で `.env.local` の内容をすべて登録。

---

## 年次引き継ぎ手順

### 管理者アカウントの引き継ぎ

1. **環境変数 `ADMIN_PASSWORD` を変更**
   - Vercel ダッシュボード → Settings → Environment Variables
   - `ADMIN_PASSWORD` の値を新しいパスワードに変更
   - Vercel で再デプロイ（自動）

2. **Supabase のオーナー移譲**
   - Supabase ダッシュボード → Organization Settings → Members
   - 新管理者をメンバーに追加 → Ownerに変更

3. **Vercel のオーナー移譲**
   - Vercel ダッシュボード → Team Settings → Members
   - 新管理者を追加

4. **Slack アプリの管理者追加**
   - Slack API ダッシュボード → Collaborators
   - 新管理者のSlackアカウントを追加

5. **GitHub リポジトリの移譲**
   - Settings → Collaborators → 新管理者を追加

### 引き継ぎ時の確認事項チェックリスト

- [ ] 新管理者が管理者画面にログインできる
- [ ] Slack通知が届く
- [ ] 商品の追加・編集ができる
- [ ] チャージ申請の承認ができる
- [ ] 後払い残高がすべて精算済み

---

## ディレクトリ構成

```
limu-cafe/
├── app/
│   ├── page.tsx              # 商品一覧（トップ）
│   ├── cart/                 # カート
│   ├── checkout/             # 購入確認
│   ├── charge/               # チャージ
│   ├── mypage/               # マイページ
│   ├── request/              # 商品要望
│   ├── login/                # Slackログイン
│   ├── admin/                # 管理者画面
│   │   ├── page.tsx          # ダッシュボード
│   │   ├── items/            # 商品管理
│   │   ├── stock/            # 在庫入力
│   │   ├── orders/           # 注文一覧
│   │   ├── charge/           # チャージ承認
│   │   ├── settlement/       # 精算管理
│   │   ├── users/            # ユーザー管理
│   │   ├── requests/         # 商品要望管理
│   │   └── price-watch/      # 価格監視
│   └── api/                  # APIルート
│       ├── auth/callback/    # OAuth callback
│       ├── items/            # 商品 CRUD
│       ├── orders/           # 注文作成
│       ├── charge/           # チャージ申請
│       ├── requests/         # 要望送信
│       ├── admin/            # 管理者API
│       └── cron/             # 定期実行
├── components/
│   ├── layout/               # Navbar, レイアウト
│   ├── user/                 # ユーザー向けコンポーネント
│   └── admin/                # 管理者向けコンポーネント
├── lib/
│   ├── supabase/             # Supabaseクライアント
│   ├── store/                # Zustandストア（カート）
│   └── slack.ts              # Slack通知
├── types/
│   └── index.ts              # TypeScript型定義
├── supabase/
│   └── migrations/           # DBマイグレーション
├── styles/
│   └── globals.css           # グローバルCSS
└── vercel.json               # Vercel Cron設定
```

---

## よくあるトラブル

### Slackログインができない
→ Supabase の Auth Providers で Slack (OIDC) が有効になっているか確認。
Redirect URL が Supabase のものになっているか確認。

### 在庫が減らない
→ Supabase SQL Editor で `002_rpc_functions.sql` が実行されているか確認。

### Slack通知が来ない
→ `.env.local` の `SLACK_WEBHOOK_ORDERS` / `SLACK_WEBHOOK_ADMIN` が正しいか確認。

### 管理者画面に入れない
→ `ADMIN_PASSWORD` 環境変数が設定されているか確認。
Vercel に環境変数を追加した後は再デプロイが必要。

---

## ライセンス

MIT
