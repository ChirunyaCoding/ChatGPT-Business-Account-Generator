# Discord Interaction 二重ACK(40060)対策仕様（2026-03-11）

## スコープ
- `/create-account` など長時間コマンドで発生する `Interaction has already been acknowledged (40060)` を安全に処理する。
- `safeDeferReply` が二重ACKを検知し、処理を継続できるようにする。
- 回帰テストを追加する。

## 制約
- 既存コマンドの機能や出力を変更しない。
- 依存関係は追加しない。
- 秘密情報は `.env` のみを使用し、コードへハードコードしない。

## 受け入れ条件
- `DiscordAPIError[40060]` が発生しても例外で停止しない。
- `safeDeferReply` が `interaction.deferred` / `interaction.replied` を考慮し、不要な `deferReply` を行わない。
- 追加したテスト（正常系1件、異常系1件の回帰）が成功する。

## 対象外
- 新規コマンド追加。
- Puppeteer自動化ロジックの大規模変更。
