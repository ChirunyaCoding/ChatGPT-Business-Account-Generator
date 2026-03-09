# Discord Bot 依存解決仕様（2026-03-09）

## スコープ
- `node src/discord-bot.js` 実行時の `Cannot find module 'discord.js'` を解消する。
- 依存導入を阻害している `puppeteer-firefox` 由来の `npm install` 失敗を回避する。
- 依存解決後にモジュール読み込み検証を行う。

## 制約
- 既存機能の挙動を変えない。
- 秘密情報は `.env` のみを利用し、ソースへハードコードしない。
- 無料で完結する範囲で修正する（有料API/有料サービス不使用）。

## 受け入れ条件
- `npm install` がエラー終了しない。
- `node -e "require('discord.js')"` が成功する。
- `node -e "require('dotenv')"` が成功する。
- `package.json` / `package-lock.json` の依存状態が整合している。

## 対象外
- Discord Botの機能追加やコマンド仕様変更。
- Puppeteerの実行フロー改善やブラウザ自動化ロジック改修。
