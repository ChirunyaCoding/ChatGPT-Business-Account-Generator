# 仕様書: puppeteer_activation 構文エラーホットフィックス

## 背景
- `src/puppeteer_activation.js` の実行時に `Identifier 'context' has already been declared` が発生し、スクリプトが起動できない。
- 同一関数スコープ内で `const context` が重複宣言されている。

## 目的
- `src/puppeteer_activation.js` が Node.js で正しくパースされ、実行開始できる状態に戻す。

## スコープ
- `src/puppeteer_activation.js` の重複変数宣言を解消する。
- 構文回帰テストを `tests/` に追加する。
- バージョンをパッチ更新する。

## 非スコープ
- Workspace有効化フローの挙動変更。
- PayPalやStripeの操作ロジック変更。

## 受け入れ基準
- `node --check src/puppeteer_activation.js` が成功する。
- 追加した回帰テストが直接実行で成功する。
- バージョンが `1.0.5` から `1.0.6` に更新される。

## テスト
- `node --check src/puppeteer_activation.js`
- `node tests/puppeteer-activation-syntax.test.js`
