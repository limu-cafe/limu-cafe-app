# LIMU喫茶

研究室メンバー向けのオンライン購買アプリです。  
商品購入、残高管理、後払い管理、要望投稿、旧システムデータ引き継ぎ、管理者向け運用画面をひとつにまとめています。

アプリURL
- 本番: [https://limucafe-app.vercel.app/](https://limucafe-app.vercel.app/)

---

## 現在のシステム概要

このアプリでできること
- 商品購入
- 前払い残高の利用
- 後払い残高の管理
- チャージ申請
- 商品要望の投稿、賛成、コメント
- 旧システムデータの引き継ぎ申請
- 管理者による在庫、注文、返金、金庫、精算、ユーザー承認の管理

現在の運用メモ
- ログインは Slack OAuth を利用
- ユーザー画面は日本語 / 英語切り替えに対応
- クレジットカード決済 UI はありますが、本運用ではまだ未使用
- Slack 通知は `SLACK_WEBHOOK_ADMIN` と Bot DM を利用
- 返金、要望、旧データ引き継ぎ、精算通知まで管理画面と Slack を連携

---

## 技術スタック

| 役割 | サービス |
|---|---|
| フロント・バックエンド | Next.js 14 (App Router) |
| データベース・認証 | Supabase (PostgreSQL / Auth) |
| ログイン | Slack OAuth |
| 通知 | Slack Webhook / Slack Bot |
| ホスティング | Vercel |
| 価格監視 | Keepa API |

---

## リポジトリ運用

現在の運用方針
- `main`: 本番用
- `debug`: デバッグ用
- その他のブランチ: 作業用

基本フロー
1. ローカルで編集する
2. 作業ブランチへ commit する
3. GitHub に push する
4. Vercel Preview で確認する
5. 問題なければ PR を出す
6. 最終確認後に `main` へ merge する

補足
- `main` は branch protection で保護する前提
- 公開リポジトリなので、外部の人は fork + PR で提案可能
- 最終確認者は `CODEOWNERS` で管理する

---

## 本番 / デバッグ環境の分け方

このプロジェクトは、本番とデバッグで外部サービスを分けて運用します。

| 用途 | Git branch | Vercel project | Supabase | Slack App / Workspace |
|---|---|---|---|---|
| 本番 | `main` | `limucafe-app` | 本番用 | 本番用 |
| デバッグ | `debug` | `limucafe-app-debug` | デバッグ用 | デバッグ用 |

大事な考え方
- 本番とデバッグで Supabase を分ける
- 本番とデバッグで Slack App も分ける
- 本番とデバッグで `APP_BASE_URL` を分ける
- 本番とデバッグで `ALLOWED_SLACK_WORKSPACE_ID` を分ける

理由
- Slack App の `Interactivity Request URL` は 1 本しか設定できない
- 本番通知とデバッグ通知を混ぜないため
- 本番データを触りながらデバッグしないため

---

## 必要な外部サービス

セットアップ時に必要なもの
- GitHub repository
- Vercel projects
- Supabase projects
- Slack Apps

推奨構成
- GitHub repository: `limu-cafe/limu-cafe-app`
- Vercel projects:
  - `limucafe-app`
  - `limucafe-app-debug`
- Supabase projects:
  - 本番用 1 つ
  - デバッグ用 1 つ
- Slack Apps:
  - 本番用 1 つ
  - デバッグ用 1 つ

---

## ローカル開発セットアップ

### 1. clone

```bash
git clone https://github.com/limu-cafe/limu-cafe-app.git
cd limu-cafe-app
npm install
```

### 2. 環境変数ファイル

秘密情報はリポジトリ内に置かず、外部ファイルで管理します。

推奨ファイル
- デバッグ用: `~/.config/limu-cafe/env`
- 本番用: `~/.config/limu-cafe/prod-env`

必要な変数

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_BASE_URL=

SLACK_WEBHOOK_ADMIN=
SLACK_BOT_TOKEN=
SLACK_SIGNING_SECRET=
SLACK_REQUESTS_CHANNEL_ID=
ALLOWED_SLACK_WORKSPACE_ID=

ADMIN_PASSWORD=
CRON_SECRET=
KEEPA_API_KEY=
```

補足
- 実運用で最低限必要なのは `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_BASE_URL`, `SLACK_WEBHOOK_ADMIN`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `ALLOWED_SLACK_WORKSPACE_ID`, `ADMIN_PASSWORD`, `CRON_SECRET`
- `SLACK_REQUESTS_CHANNEL_ID` と `KEEPA_API_KEY` は未使用でも通常運用は可能

### 3. ローカル起動

デバッグ環境での通常起動

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
set -a
source ~/.config/limu-cafe/env
set +a
npm run dev
```

本番用設定で動かしたいとき

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
set -a
source ~/.config/limu-cafe/prod-env
set +a
npm run dev
```

---

## Supabase セットアップ

### 実行する migration

`supabase/migrations` の SQL を以下の順番で実行します。

必須
1. `001_initial_schema.sql`
2. `002_rpc_functions.sql`
3. `003_cashbox_management.sql`
4. `005_favorites.sql`
5. `006_legacy_transfer.sql`
6. `007_admin_audit_logs.sql`
7. `008_atomic_balance_updates.sql`
8. `009_item_showcase_controls.sql`
9. `010_purchase_runs.sql`
10. `011_request_discussion.sql`
11. `012_immediate_charge_to_deferred.sql`
12. `013_settlement_reminder_settings.sql`
13. `014_misc_cashbox_expenses.sql`
14. `015_order_cancellation.sql`
15. `016_item_english_name.sql`
16. `017_fix_users_admin_policy.sql`
17. `018_order_deferred_settlement_method.sql`
18. `019_refund_workflows.sql`

条件付き
- `004_cashbox_backfill.sql`
  - 既存の過去現金履歴から金庫台帳を復元したいときだけ使う

### Supabase から取得する値

`Settings > API`
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` → `SUPABASE_SERVICE_ROLE_KEY`

### Auth 設定

`Authentication > URL Configuration`

本番 Supabase
- `Site URL`: 本番 Vercel URL
- `Redirect URLs`:
  - `http://localhost:3000/**`
  - `https://limucafe-app.vercel.app/**`

デバッグ Supabase
- `Site URL`: デバッグ Vercel URL
- `Redirect URLs`:
  - `http://localhost:3000/**`
  - デバッグ Vercel URL + `/**`

### Slack Provider 設定

`Authentication > Providers > Slack`

ここに Slack App の
- Client ID
- Client Secret
を入れます。

本番 Supabaseには本番 Slack App、デバッグ Supabase にはデバッグ Slack App を対応させます。

---

## Slack App セットアップ

必要な scope
- Bot Token Scopes:
  - `chat:write`
- User Token Scopes:
  - `openid`
  - `profile`
  - `email`

必要な値
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_WEBHOOK_ADMIN`
- `ALLOWED_SLACK_WORKSPACE_ID`

設定場所
- `OAuth & Permissions`
  - `Bot User OAuth Token`
- `Basic Information`
  - `Signing Secret`
  - `Client ID`
  - `Client Secret`
- `Incoming Webhooks`
  - 管理者通知用 webhook
- `Interactivity & Shortcuts`
  - `Request URL`

本番 Slack App
- `Request URL`: `https://limucafe-app.vercel.app/api/slack/interactions`

デバッグ Slack App
- `Request URL`: `https://<debug-url>/api/slack/interactions`

workspace ID の取得

```bash
curl -H "Authorization: Bearer xoxb-..." https://slack.com/api/auth.test
```

返ってきた `team_id` を `ALLOWED_SLACK_WORKSPACE_ID` に使います。

注意
- Slack App を再インストールしたり webhook を作り直すと URL が変わることがある
- 通知が急に来なくなったら `SLACK_WEBHOOK_ADMIN` を最優先で見直す

---

## Vercel セットアップ

Vercel projects
- 本番: `limucafe-app`
- デバッグ: `limucafe-app-debug`

Git の対応
- `limucafe-app` の Production Branch: `main`
- `limucafe-app-debug` の Production Branch: `debug`

Environment Variables
- 本番 project には本番 Supabase / 本番 Slack の値
- デバッグ project にはデバッグ Supabase / デバッグ Slack の値

大事な値
- `APP_BASE_URL`
  - 本番: 本番 URL
  - デバッグ: デバッグ URL

Deployment Protection
- Slack 連携を安定させるには `Vercel Authentication` を OFF にするのが安全
- ON でもログインだけ通ることはあるが、Slack の interactivity が詰まりやすい

---

## 旧システムデータ引き継ぎ

### 概要

旧システムの残高や履歴は、Firestore から JSON に書き出して、新システムの Supabase に取り込みます。

### 書き出し

本番 Firestore から書き出す例

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
mkdir -p tmp
npm run legacy:extract:prod -- \
  --credentials /path/to/firebase-adminsdk.json \
  --out /Users/miyoshishouhei/Documents/dev/limu-cafe-app/tmp/legacy-export-prod.json
```

### 取り込み

本番 DB に取り込む例

```bash
cd /Users/miyoshishouhei/Documents/dev/limu-cafe-app
set -a
source ~/.config/limu-cafe/prod-env
set +a
npm run legacy:import -- --file /Users/miyoshishouhei/Documents/dev/limu-cafe-app/tmp/legacy-export-prod.json
```

### 取り込み確認

Supabase SQL Editor で確認

```sql
select count(*) from public.legacy_users;
select count(*) from public.legacy_purchase_history;
```

### アプリ上での運用

ユーザー
- `/mypage` から旧データ引き継ぎ申請を出す

管理者
- `/admin/legacy` で申請を確認
- Slack ユーザーと旧データを照合して承認する

---

## 日常の運用フロー

### 商品を追加したい
1. `/admin/items` で追加
2. ユーザー側トップに反映されるか確認
3. 必要なら英語名も設定

### 在庫や仕入れを更新したい
1. `/admin/stock`
2. 追加個数を入れる
3. 仕入れ合計額を入れる
4. 必要なら同じ画面で雑費も入力する

### 注文やチャージを取り消したい
- 注文一覧: 返金処理 / キャンセル処理
- チャージ記録: 返金処理

### 金庫確認
- `/admin/cashbox`
- 紙幣 / 硬貨の枚数を入力すると合計が自動計算される

### 要望対応
- `/request` でユーザー投稿
- `/admin/requests` で採用 / 却下
- Slack DM でも賛成 / コメントが動く

---

## 引き継ぎ手順

このセクションがいちばん重要です。  
新しい担当者は、基本的に「ローカルで編集 → GitHub に push → Vercel で確認 → 問題なければ `main` へ反映」という流れで運用します。

### 1. 引き継ぎで渡すべき権限

新担当者に渡すもの
- GitHub repository へのアクセス
- Vercel projects へのアクセス
- Supabase projects へのアクセス
- Slack Apps へのアクセス
- Firebase 旧データ書き出し用 credentials

最低限確認するもの
- GitHub で repository に入れる
- Vercel で `limucafe-app`, `limucafe-app-debug` が見える
- Supabase で本番 / デバッグ両方が見える
- Slack API Dashboard で本番 / デバッグ両方の App が見える

### 2. 新担当者が最初にやること

1. リポジトリを clone
2. `npm install`
3. デバッグ用 env を作る
4. ローカルで `npm run dev`
5. `/login`, `/`, `/mypage`, `/request`, `/admin` を開いて基本動作確認

### 3. 開発の進め方

おすすめ手順
1. `main` を最新にする
2. 作業ブランチを切る
3. ローカルで修正する
4. `npx tsc --noEmit --incremental false --skipLibCheck`
5. GitHub へ push
6. Vercel Preview で確認
7. 問題なければ PR を作る
8. 最終確認後に `main` へ merge

例

```bash
git switch main
git pull
git switch -c feature/update-request-copy
```

### 4. デバッグ環境の使い方

デバッグで使うもの
- branch: `debug`
- Vercel: `limucafe-app-debug`
- Supabase: デバッグ用
- Slack: デバッグ用 App / workspace

使いどころ
- 本番に影響を出したくないとき
- Slack の interactivity や通知を試したいとき
- データを壊す可能性がある実験をしたいとき

手順
1. `debug` ベースで作業する、または `debug` に寄せて確認する
2. デバッグ用 env を読み込んでローカル確認
3. `limucafe-app-debug` のデプロイで確認

### 5. 本番環境の使い方

本番で使うもの
- branch: `main`
- Vercel: `limucafe-app`
- Supabase: 本番用
- Slack: 本番用 App / workspace

本番で確認すること
- Slack ログイン
- 商品追加反映
- 注文
- チャージ
- 要望投稿
- 管理者画面
- Slack 通知

### 6. 引き継ぎ時に特に確認する項目

GitHub
- branch protection が有効か
- `CODEOWNERS` が現在の担当者を向いているか

Vercel
- `main` / `debug` の Production Branch 設定
- Environment Variables
- `APP_BASE_URL`

Supabase
- migration が 019 まで入っているか
- Slack Provider が正しい App を向いているか
- `Site URL` と `Redirect URLs`

Slack
- `Bot User OAuth Token`
- `Signing Secret`
- `Incoming Webhooks`
- `Interactivity Request URL`
- `team_id`

### 7. 担当者交代時に変更するもの

担当者が変わるたびに必ず見直すもの
- `.github/CODEOWNERS`
- GitHub collaborators
- Vercel project members
- Supabase project members
- Slack App 管理権限

`CODEOWNERS` は今回のように個人アカウントで始めても問題ありません。  
将来の担当者に変わったら、その GitHub ユーザー名に差し替えるだけです。

---

## よくあるトラブル

### Supabase にはデータがあるのに画面に出ない
- Vercel の `NEXT_PUBLIC_SUPABASE_URL` が別環境を向いていないか
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` が対応する環境のものか
- 再デプロイ済みか

### Slack ログインできない
- Supabase の Slack Provider が正しいか
- Slack App の Redirect URL が正しいか
- `ALLOWED_SLACK_WORKSPACE_ID` が正しいか
- 別 workspace に先にログインしていないか

### Slack 通知が届かない
- `SLACK_WEBHOOK_ADMIN` が古くなっていないか
- Slack App を再インストールしていないか
- Vercel の env を更新したあと再デプロイしたか

### 要望投稿で policy エラー
- `017_fix_users_admin_policy.sql` が入っているか

### 注文作成に失敗する
- `018_order_deferred_settlement_method.sql` が入っているか

### 返金処理が動かない
- `019_refund_workflows.sql` が入っているか

---

## 主要ファイル

重要な場所
- `app/`
  - ユーザー画面 / 管理画面 / API
- `components/`
  - UI コンポーネント
- `lib/`
  - Supabase, Slack, 金庫, 旧データ引き継ぎなどの共通処理
- `supabase/migrations/`
  - DB schema / functions
- `scripts/`
  - 旧システムデータの書き出し / 取り込み
- `vercel.json`
  - Cron 設定

---

## 補足

今後の改善余地
- GitHub Actions に `typecheck` を追加
- branch protection で status checks を必須化
- 将来的に `CODEOWNERS` を team 運用へ移行

現時点では、まず
- ローカルで修正
- push
- Vercel Preview で確認
- PR
- `main` に merge

この運用を守るのがいちばん安全です。
