# 仕様書: Stripe住所フォーム検出の強化

## 背景
- 住所入力フォームが検出できず、入力が 0/5 のまま進まない事象が発生している。
- 提供されたHTMLでは `billingAddress-*` のIDを持つ入力が存在するため、正しいiframeを選定できていない可能性が高い。

## 目的
- Stripe住所フォームのiframeを確実に特定し、主要入力欄へ自動入力できるようにする。

## スコープ
- `src/puppeteer_activation.js` にiframe検出のロジックを追加・強化する。
- `src/utils/stripe-address.js` に住所フォーム検出用セレクタ一覧を追加する。
- `tests/stripe-address-selectors.test.js` に回帰テストを追加する。
- `package.json` / `package-lock.json` のバージョンをパッチ更新する。

## 非スコープ
- PayPalログイン手順や支払いフローの全面的な変更。
- `bc/` 配下の旧スクリプトの更新。
- Discordコマンド仕様の変更。

## 制約
- 有料API/有料サービスは使用しない。
- 機密情報は `.env` から読み込む。
- ユーザー向けログは日本語を維持する。

## 受け入れ基準
- `billingAddress-*` を含むStripe住所フォームを検出できる。
- 住所入力で 3項目以上が自動入力される（name/country/line1/postal/city のいずれか）。
- 追加したテストが `node --test` で成功する。
- バージョンが 1.0.4 → 1.0.5 に更新されている。

## テスト
- `node --test tests/stripe-address-selectors.test.js`
