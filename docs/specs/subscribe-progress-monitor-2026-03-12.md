# Subscribe後の進行判定改善仕様（2026-03-12）

## スコープ
- `src/puppeteer_activation.js` の `monitorAndRetryError()` を、エラー監視だけでなく進行判定も行う形に変更する。
- PayPal遷移、確認ボタン表示、Subscribeボタン消失や無効化を「進行」として扱う。
- 進行判定ロジックを `src/utils/checkout-progress.js` に分離する。
- 回帰テストを追加する。
- `package.json` と `package-lock.json` を `PATCH` 更新する。

## 制約
- 既存の全体フロー順序は変えない。
- 依存関係は追加しない。
- 秘密情報はコードに埋め込まない。

## 受け入れ基準
- Subscribeクリック後、PayPal遷移やConfirm表示を検出したら2分待機せず次へ進む。
- 不明なエラー検出時のリトライ挙動は維持される。
- 回帰テストが成功する。

## 対象外
- PayPal認証自体の完全自動化。
- 決済フロー全体の設計変更。
