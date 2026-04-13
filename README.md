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
   - `supabase/migrations/003_cashbox_management.sql`
   - `supabase/migrations/005_favorites.sql`
   - `supabase/migrations/006_legacy_transfer.sql`
   - `supabase/migrations/007_admin_audit_logs.sql`
   - `supabase/migrations/004_cashbox_backfill.sql` は、現システムの過去現金履歴を復元したいときだけ後から実行
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
5. **Incoming Webhooks** で管理者通知用のWebhook URLを作成：
   - `#limu-admin` → `SLACK_WEBHOOK_ADMIN`
6. **Bot Token** をコピー → `SLACK_BOT_TOKEN`

注意:
- Slack アプリを再インストールしたり、Webhook を作り直した場合は URL が変わることがあります
- 通知が急に来なくなった場合は、まず `SLACK_WEBHOOK_ADMIN` を再確認してください

### 4. Stripe のセットアップ（クレカ払いを使う場合）

1. [stripe.com](https://stripe.com) でアカウント作成
2. **Developers → API keys** からキーを取得
3. テスト環境で動作確認後、本番キーに切り替え

現在の運用:
- Stripe はまだ本格運用していません
- UI には「開発中」と表示されます
- 実運用は現金チャージを利用してください

### 4.5 Keepa について

現在の運用:
- Keepa API は本格運用していません
- 管理画面の価格監視は「開発中」の予告枠です
- API キーを未設定でも通常運用は可能です

### 5. 環境変数の設定

このリポジトリでは、秘密情報をプロジェクト内に置かない運用を推奨します。

1. プロジェクト内の [`.env.example`](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/.env.example) を見ながら、プロジェクト外に env ファイルを作成  
   例: `~/.config/limu-cafe/env`
2. 実際の秘密情報はその外部ファイルにだけ書く
3. [`.env.local`](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/.env.local) は空のままにする

外部 env ファイルの例:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_BASE_URL=...
SLACK_WEBHOOK_ADMIN=...
SLACK_BOT_TOKEN=...
ADMIN_PASSWORD=...
ALLOWED_SLACK_WORKSPACE_ID=...
CRON_SECRET=...
KEEPA_API_KEY=...
```

### 6. 開発サーバーの起動

```bash
cd /path/to/limu-cafe-app
set -a
source ~/.config/limu-cafe/env
set +a
npm run dev
# → http://localhost:3000
```

毎回の起動を簡単にしたい場合は、リポジトリ外に起動スクリプトを作ると運用しやすいです。

例: `~/bin/limu-cafe-dev`

```bash
#!/bin/zsh
cd /path/to/limu-cafe-app || exit 1
set -a
source ~/.config/limu-cafe/env
set +a
npm run dev
```

以後は `~/bin/limu-cafe-dev` だけで起動できます。

### 7. Vercel へのデプロイ

```bash
# Vercel CLI
npx vercel

# または GitHub連携で自動デプロイ
```

Vercel ダッシュボード → **Settings → Environment Variables** で、外部 env ファイルと同じ値を登録。

### 8. PWA の使い方

このアプリはスマホやPCで「ホーム画面に追加」して使えるようにしています。

- iPhone / iPad:
  - Safari で開く
  - 共有ボタン
  - `ホーム画面に追加`
- Android:
  - Chrome で開く
  - メニュー
  - `ホーム画面に追加` または `アプリをインストール`

研究室内で日常的に使う場合は、この使い方がいちばん楽です。

---

## Git運用ルール

このプロジェクトでは、以下のブランチ運用を基本ルールにします。

- `main`: 本番用
- `dev`: 開発内容を集約するブランチ
- `feature/*`: 機能追加
- `fix/*`: バグ修正
- `docs/*`: README や手順書など文章修正

### 基本の考え方

- `main` には、動作確認が終わった内容だけを入れます
- 普段の作業は `dev` から分岐して進めます
- 直接 `main` で作業しません
- 大きな変更は、できるだけ `dev` に直接コミットせず、作業ブランチを切ります

### 作業の流れ

1. `dev` を最新にする
2. 作業内容に応じたブランチを作る
3. そのブランチで修正する
4. 修正後に `dev` に戻す
5. `dev` で動作確認する
6. 問題なければ `main` に反映する

### ブランチ名の例

- `feature/add-admin-notification`
- `feature/improve-order-flow`
- `fix/login-callback`
- `fix/admin-orders-refresh`
- `docs/update-handoff-guide`

### 例: バグ修正の始め方

```bash
git switch dev
git pull
git switch -c fix/admin-orders-refresh
```

### 例: README 修正の始め方

```bash
git switch dev
git pull
git switch -c docs/update-readme
```

### Vercel との対応

- `main` → 本番デプロイ
- `dev` → 開発確認用
- `feature/*` / `fix/*` / `docs/*` → 必要に応じて Preview

---

## 日常運用メモ

### 普段の起動方法

```bash
cd /path/to/limu-cafe-app
set -a
source ~/.config/limu-cafe/env
set +a
npm run dev
```

### よく使う確認項目

- ユーザー側の商品一覧が見えるか
- 管理者画面にログインできるか
- 商品追加が管理画面とユーザー画面の両方に反映されるか
- 注文 / 要望 / チャージ申請が Supabase に入り、管理画面にも反映されるか
- Slack 通知が `#limu-admin` と `#limu-orders` に届くか

### 変更後に見ておくと安心な画面

- `/`
- `/mypage`
- `/request`
- `/charge`
- `/admin`
- `/admin/items`
- `/admin/orders`
- `/admin/charge`
- `/admin/stock`
- `/admin/requests`
- `/admin/cashbox`

### デバッグ中の DB 運用おすすめ方針

デバッグをまだ続ける予定なら、いちばん安全なのは次のどちらかです。

1. **おすすめ:** Supabase を `開発用` と `運用開始用` で分ける
2. 1つの Supabase を使い続けるなら、運用開始前に初期化して正式データを入れ直す

おすすめ理由:

- デバッグ中の注文やチャージ申請が本番データに混ざらない
- 何度でもやり直せる
- 旧データ移行を落ち着いて検証できる

もし 1つの Supabase を使い続ける場合は、運用開始直前に以下を行ってください。

1. 旧システムデータの JSON を保存しておく
2. [prelaunch_reset_preserve_master.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/manual/prelaunch_reset_preserve_master.sql) を実行する
3. 必要なら Supabase Authentication のデバッグ用ユーザーを手動削除する
4. `001` `002` `003` `005` `006` の migration 状態を確認する
5. `legacy:import` を実行する
6. その後に実際のユーザーで引き継ぎ申請と承認を行う

補足:

- [prelaunch_reset_preserve_master.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/manual/prelaunch_reset_preserve_master.sql) は `items` と `categories` を残します
- 商品マスタまで作り直したい場合は、この SQL をそのまま使わず、先に方針を決めてください
- `tmp/legacy-export.json` は Git に含まれないようにしています

### 金庫管理の導入手順

金庫管理を導入するときは、以下の順番で進めます。

1. `supabase/migrations/003_cashbox_management.sql` を実行して金庫管理テーブルを作成する
2. `supabase/migrations/004_cashbox_backfill.sql` を **1回実行** して、現システムに残っている過去の現金履歴を復元する
3. `/admin/cashbox` を開いて、バックフィル済みの案内が出ていることを確認する
4. 以前のシステムから引き継ぐ金庫残高がある場合は、「手動調整」から初期値を1件入力する
5. `supabase/migrations/005_favorites.sql` を実行して、お気に入り機能を有効にする
6. 旧システム移行も使う場合は `supabase/migrations/006_legacy_transfer.sql` を実行して、旧データ保管と引き継ぎ申請のテーブルを作る
7. `supabase/migrations/007_admin_audit_logs.sql` を実行して、管理者の承認・精算・調整ログを記録できるようにする

補足:

- `004_cashbox_backfill.sql` は再実行しても、`order_id` / `charge_request_id` / `settlement_id` の重複を避ける設計です
- バックフィル対象は「現システムDBに残っている現金注文・現金チャージ承認・現金精算」のみです
- 旧システム分は自動では入らないため、初期値として `manual_in` / `manual_out` で入力してください
- `APP_BASE_URL` を設定すると、Slack 通知から管理画面やマイページへ直接飛べます

### 旧システムデータ移行の考え方

- 旧システムの生データは、まず `legacy_users` と `legacy_purchase_history` に保存します
- ユーザー本人はマイページから「旧データ引き継ぎ申請」を出します
- 管理者は `/admin/legacy` で Slack ユーザーと旧データを対応付けて承認します
- 承認時に、旧残高は現在の `users.balance` / `users.deferred_balance` に反映されます
- 旧お気に入りは、商品名が一致するものだけ現在の `favorite_items` に引き継がれます
- 旧購入履歴は、いったん参照用として `legacy_purchase_history` に保持します

おすすめ手順:

1. 先に新DBを初期化する
2. `001` `002` `003` `005` `006` を実行する
3. 旧システムデータを `legacy_users` / `legacy_purchase_history` に投入する
4. Slack ログイン済みユーザーから引き継ぎ申請を出してもらう
5. 管理者が `/admin/legacy` で照合して承認する
6. 旧データ移植方針が固まるまで `004_cashbox_backfill.sql` は実行しない

### 旧システム移行の実作業手順

この章は、「旧システムの Firestore データを、新システムの旧データ保管テーブルへ移す」ための手順です。
一度に全部やらず、順番に進めてください。

#### 前提

- 旧システムのリポジトリがローカルにある
  例: `/Users/miyoshishouhei/Documents/dev/cafeorder-vuetify`
- 新システムのリポジトリがローカルにある
  例: `/Users/miyoshishouhei/Documents/dev/limu-cafe-app`
- 新システム側の env が読み込める
- 旧システムの `firebase/emulator_export/` が手元にある

#### 1. 旧システム側で必要なものを入れる

旧システムの Firestore export はそのままでは読みにくいため、Firebase Emulator に読み込ませて JSON に変換します。

必要なもの:

- Node.js
- Java
- Firebase CLI

Firebase CLI がまだ無い場合:

```bash
npm install -g firebase-tools
```

Java が入っていない場合は、Mac ならまず `java -version` を実行して確認してください。
エラーになる場合は Java をインストールします。

#### 2. 旧システムの依存関係を入れる

別ターミナルを開いて、旧システムのフォルダで実行します。

```bash
cd /Users/miyoshishouhei/Documents/dev/cafeorder-vuetify
yarn install
```

#### 3. 旧システムの Emulator を起動する

同じ旧システム側ターミナルで次を実行します。

```bash
cd /Users/miyoshishouhei/Documents/dev/cafeorder-vuetify
sh start_emulator.sh
```

このコマンドは、`firebase/emulator_export/` のデータを読み込んで Emulator を起動します。
起動中はこのターミナルを閉じないでください。

起動確認:

- Firestore Emulator: `http://127.0.0.1:8080`
- Emulator UI: `http://127.0.0.1:4000`

#### 4. 新システム側で旧データを JSON に変換する

新しく別ターミナルを開いて、新システム側で次を実行します。

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
mkdir -p tmp
npm run legacy:extract -- \
  --old-repo /Users/miyoshishouhei/Documents/dev/cafeorder-vuetify \
  --out /Users/miyoshishouhei/Documents/dev/limu-cafe-app/tmp/legacy-export.json
```

このコマンドで次の情報を抽出します。

- 旧ユーザー一覧
- 旧残高
- 旧お気に入り
- 旧購入履歴
- `set` 履歴

出力先:

`/Users/miyoshishouhei/Documents/dev/limu-cafe-app/tmp/legacy-export.json`

#### 5. 抽出できた JSON を軽く確認する

まず件数を確認します。

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
node -e "const data=require('./tmp/legacy-export.json'); console.log(data.counts)"
```

必要なら先頭だけ見ます。

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
node -e "const data=require('./tmp/legacy-export.json'); console.log(data.legacyUsers.slice(0,3)); console.log(data.purchaseHistory.slice(0,5));"
```

ここで見るポイント:

- `legacyUsers` が空ではないか
- `name` と `legacy_balance` が入っているか
- `favorite_item_names` が入っていそうか
- `purchaseHistory` が空ではないか

#### 5.5 実際の Firebase 本番データを使う場合

GitHub 内の `firebase/emulator_export/` がテストデータだった場合は、こちらを使います。

1. Firebase コンソールで `limu-caffe-terminal` のサービスアカウント鍵を作成する
2. JSON を安全な場所に置く
   例:

```bash
/Users/miyoshishouhei/.config/limu-cafe/limu-caffe-terminal-firebase-adminsdk-p7zoq-2746e20ce5.json
```

3. 新システム側で以下を実行する

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
mkdir -p tmp
npm run legacy:extract:prod -- \
  --credentials /Users/miyoshishouhei/.config/limu-cafe/limu-caffe-terminal-firebase-adminsdk-p7zoq-2746e20ce5.json \
  --out /Users/miyoshishouhei/Documents/dev/limu-cafe-app/tmp/legacy-export-prod.json
```

4. 件数確認

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
node -e "const data=require('./tmp/legacy-export-prod.json'); console.log(data.counts)"
```

5. 新システムへ投入するときは、`legacy-export.json` ではなく `legacy-export-prod.json` を使う

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
set -a
source ~/.config/limu-cafe/env
set +a
npm run legacy:import -- --file /Users/miyoshishouhei/Documents/dev/limu-cafe-app/tmp/legacy-export-prod.json
```

おすすめ:

- 実際の移行では、Emulator 版ではなく **本番 Firestore から書き出した `legacy-export-prod.json`** を使ってください
- `tmp/` は Git に含まれないので、そのまま置いて大丈夫です

#### 6. 新システム側の Supabase を初期化して migration を入れる

本番運用前に初期化する前提なら、ここで新DBを空にしてから進めます。

いま使っている Supabase をそのまま使う場合は、先に
[prelaunch_reset_preserve_master.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/manual/prelaunch_reset_preserve_master.sql)
を実行してください。

入れる migration:

1. `001_initial_schema.sql`
2. `002_rpc_functions.sql`
3. `003_cashbox_management.sql`
4. `005_favorites.sql`
5. `006_legacy_transfer.sql`
6. `007_admin_audit_logs.sql`

この段階では **`004_cashbox_backfill.sql` をまだ実行しません**。

#### 7. 新システム側で env を読み込む

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
set -a
source ~/.config/limu-cafe/env
set +a
```

#### 8. 旧データを新システムに投入する

同じ新システム側ターミナルで次を実行します。

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
npm run legacy:import -- --file /Users/miyoshishouhei/Documents/dev/limu-cafe-app/tmp/legacy-export.json
```

この処理で、次のテーブルにデータが入ります。

- `legacy_users`
- `legacy_purchase_history`

#### 9. Supabase で投入確認をする

SQL Editor で以下を確認します。

```sql
select id, legacy_user_key, name, email, legacy_balance, transferred_at
from public.legacy_users
order by name;
```

```sql
select legacy_user_id, item_name, quantity, subtotal, purchased_at
from public.legacy_purchase_history
order by purchased_at desc nulls last
limit 50;
```

#### 10. Web アプリで引き継ぎフローを確認する

確認順:

1. ユーザーでログイン
2. `/mypage` を開く
3. 「旧システムデータ引き継ぎ」カードから申請する
4. 管理者で `/admin/legacy` を開く
5. 旧ユーザーを選んで承認する
6. 承認後にユーザー残高とお気に入りが反映されるか確認する

#### 11. その後に考えること

- 旧システムの `set` 履歴をどう扱うか
- 金庫管理の初期値をどう入れるか
- 必要ならその時点で `004_cashbox_backfill.sql` を実行するか

#### よくある詰まりポイント

- `legacy:extract` が失敗する
  - 旧システム Emulator が起動しているか確認する
  - `http://127.0.0.1:8080` にアクセスできるか確認する
  - Java と Firebase CLI が入っているか確認する

- `legacy:import` が失敗する
  - `NEXT_PUBLIC_SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` を読み込んでいるか確認する
  - `006_legacy_transfer.sql` を実行済みか確認する

- お気に入りが引き継がれない
  - 旧システムと新システムで商品名が一致しているか確認する
  - `005_favorites.sql` を実行済みか確認する

---

## 年次引き継ぎ手順

この章は「新しい担当者が、ほぼゼロからでも運用を引き継げる」ことを目的にしています。

### まず把握しておくこと

- ローカル開発では、秘密情報をリポジトリ内に置きません
- 本物の秘密情報は `~/.config/limu-cafe/env` に置きます
- 管理者画面のログインは `ADMIN_PASSWORD` です
- 本番環境の設定は Vercel / Supabase / Slack に分かれています
- 通知が来ない場合、原因は Slack Webhook URL の期限切れ・差し替わりが多いです
- Git の基本運用は `main` / `dev` / `feature/*` / `fix/*` / `docs/*` です

### 引き継ぎの全体像

1. GitHub / Vercel / Supabase / Slack の権限を新担当者に渡す
2. ローカル開発用の env ファイルを新担当者に渡す
3. `ADMIN_PASSWORD` を新しいものに変更する
4. ローカルで起動して動作確認する
5. Slack通知・商品登録・注文・チャージ承認まで一通り確認する

### 手順1. 新担当者のPCで env ファイルを用意する

新担当者のMacで以下を実行します。

```bash
mkdir -p ~/.config/limu-cafe
touch ~/.config/limu-cafe/env
```

その `~/.config/limu-cafe/env` に、旧担当者から受け取った環境変数を書きます。
キーの一覧は [`.env.example`](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/.env.example) を参照してください。

### 手順2. ローカルで起動する

```bash
cd /path/to/limu-cafe-app
set -a
source ~/.config/limu-cafe/env
set +a
npm install
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

### 手順3. 管理者パスワードを変更する

1. Vercel ダッシュボードを開く
2. 対象プロジェクト → **Settings**
3. **Environment Variables**
4. `ADMIN_PASSWORD` を新しい値に変更
5. 再デプロイを待つ

### 手順4. 権限を移譲する

`Supabase`
- Organization Settings → Members
- 新担当者を追加
- 必要なら Owner に変更
- SQL Editor と Table Editor が使えることを確認
- Authentication → Providers が見られることを確認

`Vercel`
- Team Settings → Members
- 新担当者を追加
- Project Settings → Environment Variables が編集できることを確認

`Slack`
- Slack API Dashboard → Your Apps → LIMU喫茶bot
- Collaborators に新担当者を追加
- Incoming Webhooks が見られることを確認
- OAuth & Permissions が見られることを確認

`GitHub`
- Repository Settings → Collaborators
- 新担当者を追加
- `dev` ブランチに push できることを確認

### 手順5. Slack Webhook を必ず確認する

とても重要です。Slack アプリを再インストールしたり Webhook を作り直すと、Webhook URL が変わることがあります。

確認する場所:
- Slack API Dashboard → LIMU喫茶bot → **Incoming Webhooks**

確認する内容:
- `#limu-admin` 用の Webhook URL

変わっていた場合:
1. 新しい URL をコピー
2. `~/.config/limu-cafe/env` の `SLACK_WEBHOOK_ADMIN` を更新
3. Vercel の Environment Variables も同じ値に更新
4. `npm run dev` を再起動

### 手順6. Supabase の SQL を確認する

初回構築時または新環境を作り直したときは、必ず以下を実行します。

1. [supabase/migrations/001_initial_schema.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/001_initial_schema.sql)
2. [supabase/migrations/002_rpc_functions.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/002_rpc_functions.sql)
3. [supabase/migrations/003_cashbox_management.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/003_cashbox_management.sql)
4. [supabase/migrations/004_cashbox_backfill.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/004_cashbox_backfill.sql)
5. [supabase/migrations/005_favorites.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/005_favorites.sql)
6. [supabase/migrations/006_legacy_transfer.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/006_legacy_transfer.sql)
7. [supabase/migrations/007_admin_audit_logs.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/007_admin_audit_logs.sql)

RLS やポリシー周りで不具合があった場合は、別途 SQL Editor で修正 SQL を実行することがあります。

### 手順7. どのサービスで何を管理しているかを把握する

`Supabase`
- データベース本体
- Slack ログイン用の認証設定
- users / items / orders などのデータ確認

`Slack App`
- Bot Token
- Incoming Webhooks
- DM 通知
- チャンネル通知

`Vercel`
- 本番デプロイ
- 本番環境変数
- Cron 実行

`GitHub`
- ソースコード
- ブランチ運用
- 変更履歴の管理

### 引き継ぎ後の確認チェックリスト

以下を上から順番に確認してください。

- [ ] `/login` から Slack ログインできる
- [ ] ユーザー側で商品一覧が見える
- [ ] ユーザー側で要望送信ができる
- [ ] ユーザー側で現金チャージ申請ができる
- [ ] ユーザー側で現金払い / 後払い注文ができる
- [ ] 管理者画面にログインできる
- [ ] `商品管理` で商品一覧が見える
- [ ] `在庫入力` で在庫追加が反映される
- [ ] `注文一覧` に現金注文が表示される
- [ ] `チャージ承認` にチャージ申請が表示される
- [ ] `商品要望` に要望が表示される
- [ ] `#limu-orders` に注文通知が届く
- [ ] `#limu-admin` に要望・チャージ申請・現金注文確認待ちの通知が届く

### 困ったときの優先確認ポイント

1. `npm run dev` のログに 500 エラーが出ていないか
2. Supabase の Table Editor でデータ自体は入っているか
3. Slack Webhook URL が古くなっていないか
4. `~/.config/limu-cafe/env` と Vercel の環境変数が一致しているか
5. ブラウザをリロードしたか、必要なら再ログインしたか
6. どの画面で、何を押したときに起きたかを言語化できるか

### よくある実際のトラブル

`Slack 通知が届かない`
- Webhook URL が古い
- Slack アプリを再インストールして URL が変わった
- `npm run dev` を再起動していない

`Supabase にはデータがあるのに画面に出ない`
- 再取得や再描画が足りていない
- 管理画面側の一覧クエリが失敗している
- ブラウザが古い状態を表示している

`ログインできない`
- Supabase の Slack Provider 設定ミス
- Redirect URL の設定ミス
- 環境変数が読み込まれていない

### 別のPCに移すための完全チェックリスト

この手順を上から順番に進めれば、新しいPCでもほぼ同じ状態で開発やデバッグを続けられます。

#### 事前に用意するもの

- GitHub のリポジトリURL
- 旧PCの `~/.config/limu-cafe/env`
- Supabase に入れるアカウント
- Slack App を見られる権限
- Vercel を見られる権限

#### 1. Node.js を確認する

```bash
node -v
npm -v
```

入っていなければ Node.js の LTS 版をインストールします。

#### 2. リポジトリをクローンする

```bash
cd ~/Documents/dev
git clone <リポジトリURL>
cd limu-cafe-app
git fetch
git switch feature/cashbox-management
npm install
```

今日の最終版を再現したい場合は、`feature/cashbox-management` を使います。  
`main` や `dev` ではなく、このブランチに切り替えてから作業を始めてください。

#### 3. 外部 env ファイルを作る

```bash
mkdir -p ~/.config/limu-cafe
touch ~/.config/limu-cafe/env
```

#### 4. env を移す

旧PCの `~/.config/limu-cafe/env` の中身を、新PCの同じ場所にコピーします。

場所:

```bash
~/.config/limu-cafe/env
```

キーの一覧は [`.env.example`](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/.env.example) を参照してください。

#### 5. 開発サーバーを起動する

```bash
cd /path/to/limu-cafe-app
set -a
source ~/.config/limu-cafe/env
set +a
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。

#### 6. Slack ログインを試す

- `/login` を開く
- Slack でログインする
- 商品一覧が見えるか確認する

#### 7. 管理画面に入る

- `/admin/login` を開く
- `ADMIN_PASSWORD` を入力する
- 管理画面が開くか確認する

#### 8. 最低限の動作確認をする

以下を順番に確認します。

- `/` で商品一覧が見える
- `/request` で要望送信できる
- `/charge` で現金チャージ申請できる
- 注文できる
- `/admin/orders` に注文が出る
- `/admin/charge` にチャージ申請が出る
- `/admin/requests` に要望が出る
- `/admin/stock` で在庫追加が反映される
- `/admin/cashbox` が開く
- `/admin/cashbox` にバックフィル済みの案内が出る

#### 9. Slack通知を確認する

見る場所:

- `#limu-orders`
- `#limu-admin`

確認内容:

- 注文通知が `#limu-orders` に届く
- 要望・チャージ申請・現金注文確認待ちが `#limu-admin` に届く

#### 10. 通知が来ないとき

Slack アプリを再インストールしたり Webhook を作り直した場合、Webhook URL が変わることがあります。

確認する場所:

- Slack API Dashboard
- 対象アプリ
- **Incoming Webhooks**

確認する値:

- `#limu-orders` 用 URL
- `#limu-admin` 用 URL

変わっていた場合:

1. `~/.config/limu-cafe/env` を更新
2. Vercel の Environment Variables も更新
3. `npm run dev` を再起動

#### 11. Supabase を確認する

見る場所:

- Table Editor
- SQL Editor

確認したいテーブル:

- `users`
- `items`
- `orders`
- `charge_requests`
- `item_requests`
- `stock_history`
- `cashbox_entries`
- `cashbox_counts`
- `cashbox_backfill_runs`

#### 12. 今日の最終版を別PCで再現する最短手順

今日の作業内容まで含めて再現したい場合は、次の順番で進めます。

1. GitHub から `feature/cashbox-management` を取得して切り替える
2. `~/.config/limu-cafe/env` を旧PCと同じ内容で用意する
3. Supabase の SQL Editor で以下を順番に実行する
   - [supabase/migrations/001_initial_schema.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/001_initial_schema.sql)
   - [supabase/migrations/002_rpc_functions.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/002_rpc_functions.sql)
   - [supabase/migrations/003_cashbox_management.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/003_cashbox_management.sql)
   - [supabase/migrations/004_cashbox_backfill.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/004_cashbox_backfill.sql)
   - [supabase/migrations/005_favorites.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/005_favorites.sql)
   - [supabase/migrations/006_legacy_transfer.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/006_legacy_transfer.sql)
   - [supabase/migrations/007_admin_audit_logs.sql](/Users/miyoshishouhei/Documents/dev/limu-cafe-app/supabase/migrations/007_admin_audit_logs.sql)
4. `npm install` を実行する
5. `npm run dev` で起動する
6. `/admin/cashbox` を開き、金庫管理が見えることを確認する

注意:

- 金庫管理はコードを pull しただけでは使えません。`003` と `004` の SQL 実行が必須です
- `004_cashbox_backfill.sql` は現システム内の過去の現金履歴を復元します
- 旧システムから持ってくる初期残高は `/admin/cashbox` の「手動調整」から入れます

#### 13. Vercel を確認する

見る場所:

- Project Settings
- Environment Variables

ローカルの `~/.config/limu-cafe/env` と同じ値が入っているか確認します。

#### 14. 引き継ぎ完了の目安

- ローカルで起動できる
- Slack ログインできる
- 管理画面に入れる
- 商品・注文・要望・チャージの流れを確認できる
- Slack通知が届く
- GitHub / Supabase / Slack / Vercel に入れる

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
→ 外部 env ファイルの `SLACK_WEBHOOK_ADMIN` が正しいか確認。
Slack アプリを再インストールした場合は Webhook URL が変わっていることがあります。

### 管理者画面に入れない
→ `ADMIN_PASSWORD` 環境変数が設定されているか確認。
Vercel に環境変数を追加した後は再デプロイが必要。

---

## ライセンス

MIT
