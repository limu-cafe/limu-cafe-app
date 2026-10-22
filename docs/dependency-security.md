# 依存関係の更新と検証

インストールには `npm ci` を使い、開発用を含む監査は `npm audit`、回帰検証は `npm run verify` で実行します。

Tailwind CSSとPostCSSプラグインは4.3.3に固定しています。従来の配色は `styles/globals.css` のtheme変数に保持し、旧クラスの名前変更は公式の移行ツールに合わせています。PostCSSの設定で `tailwindcss` を直接プラグインとして使わず、`@tailwindcss/postcss` を使用してください。

Next.js本体は15.5.28です。静的解析用の `eslint-config-next` は公式の14.2.35を使用し、その `@next/eslint-plugin-next` に限って `glob` を10.5.0へ固定しています。15・16系のLintプラグインに含まれるfast-glob→micromatch→braces経由の未修正脆弱性を避け、globの修正も取り込むためです。これはNext.js本体のダウングレードではありません。更新時にはlockfileの監査とLintの動作も確認してください。

Tailwind 4の対応ブラウザはSafari 16.4以降、Chrome 111以降、Firefox 128以降です。[公式の移行ガイド](https://tailwindcss.com/docs/upgrade-guide)を参照してください。
