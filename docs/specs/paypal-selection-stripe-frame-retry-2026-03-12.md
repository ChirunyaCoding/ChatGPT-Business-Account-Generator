# Stripe PayPalタブ選択のフレーム再探索仕様（2026-03-12）

## スコープ
- `src/puppeteer_activation.js` の `Step 4: PayPal Selection` で、最初の1つのStripe iframeに依存しない探索へ変更する。
- Stripe系フレームの優先順位付けと PayPal タブ用セレクタを `src/utils/stripe-payment.js` に切り出す。
- Stripeフレーム内の `shadow DOM` を含めて PayPal タブを探索できるようにする。
- `universal-link-modal` より `elements-inner-payment` を優先し、PayPal タブの実在で payment iframe を選ぶ。
- Stripeフレーム検査にタイムアウトを付け、1フレームで探索全体が停止しないようにする。
- Step 4 の開始直後は URL/名前ベースで Stripe 候補を即時列挙し、重い probe より先に上位フレームへ直接クリックを試みる。
- 深い `evaluate()` 探索は通常の handle 探索で見つからなかった場合の最終フォールバックに限定する。
- 回帰テストを追加し、PayPal支払い用フレームが住所用フレームより優先されることを検証する。
- `package.json` と `package-lock.json` を `PATCH` 更新する。

## 制約
- 既存の無料オファー有効化フローの大枠は変えない。
- 依存関係は追加しない。
- 機密情報は `.env` を前提とし、コードへハードコードしない。
- 既存の日本語ログ方針を維持する。

## 受け入れ基準
- Stripe iframe 検出後に、複数フレームを再探索して PayPal タブ選択を継続できる。
- PayPal タブが shadow DOM 配下でも探索対象になる。
- 支払い系Stripeフレームが住所系Stripeフレームより高優先で探索される。
- `button[data-testid="paypal"]` / `#paypal-tab` を持つ payment iframe が modal iframe より優先される。
- フレーム検査がタイムアウトしても Step 4 全体は継続する。
- Step 4 開始直後に Stripe 候補の列挙ログが出て、probe 評価待ちで無音停止しない。
- 通常 DOM 上にある `button[data-testid="paypal"]` は深い evaluate に入る前に handle クリックで選択できる。
- 追加した回帰テストが `node --test` で成功する。
- バージョンが `1.0.13` から `1.0.14` に更新される。

## 対象外
- PayPal認証そのものの自動化仕様変更。
- 住所入力ロジックの全面改修。
- `bc/` 配下のバックアップ用スクリプト整理。
