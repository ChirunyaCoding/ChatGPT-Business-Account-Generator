# Discord Interaction 安定化仕様（2026-03-10）

## スコープ
- `DeprecationWarning: ready event` を解消する。
- `DiscordAPIError[10062]: Unknown interaction` 発生時にBotがクラッシュしないようにする。
- 長時間処理コマンドでインタラクションの初期応答を安定化する。
- 回帰テスト（正常系/異常系）を追加する。

## 制約
- 既存の `/create-account` と `/paypal-login` の機能意図を変更しない。
- 秘密情報は `.env` のみを使用し、コードへハードコードしない。
- 依存追加は最小限にし、既存構成を維持する。

## 受け入れ条件
- `client.once('clientReady', ...)` へ置換され、非推奨警告が出ない。
- `Unknown interaction (code: 10062)` が発生してもプロセスが終了しない。
- 長時間処理の初期応答が `deferReply` + `editReply` で行われる。
- 追加した回帰テスト（正常系1件、異常系1件以上）が成功する。

## 対象外
- Discordコマンドの機能追加。
- Puppeteerフローやブラウザ自動化ロジックの大規模改修。
