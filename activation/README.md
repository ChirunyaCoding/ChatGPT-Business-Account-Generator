# ChatGPT Activation Bot

既存のChatGPTアカウントでサブスクリプションを有効化し、すぐにキャンセルするBotです。

## 機能

- 既存アカウントへのログイン（検証コード自動取得）
- サブスクリプション有効化（無料オファー）
- PayPal支払い設定
- サブスクリプション即座にキャンセル

## ファイル構成

```
activation/
├── __init__.py              # パッケージ初期化
├── bot.py                   # Discord Botメイン
├── chatgpt_manager.py       # ChatGPT管理・キャンセル処理
├── mail_tm_extended.py      # MailTMClient拡張（ログイン機能追加）
├── config.py                # 設定（親ディレクトリのconfigをインポート）
├── start.bat                # 起動スクリプト
└── README.md                # このファイル
```

## セットアップ

1. このディレクトリ（`activation/`）に`.env`ファイルを作成し、Discord BotトークンとPayPal情報を設定
   ```bash
   cp .env.example .env
   ```
   
   `.env`ファイルの内容:
   ```
   DISCORD_TOKEN=your_activation_bot_token_here
   PAYPAL_EMAIL=your_paypal_email@example.com
   PAYPAL_PASSWORD=your_paypal_password
   ```

2. 親ディレクトリの`config.py`に請求先住所（`BILLING_INFO`）を設定（共有設定）

3. 以下のコマンドで起動
   ```bash
   cd activation
   start.bat
   ```
   または
   ```bash
   python -m activation.bot
   ```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `/paypal` | PayPalにログイン（ログイン状態を維持） |
| `/activation <メール> <パスワード>` | サブスクリプションを有効化・キャンセル |
| `/cancel_activation` | 進行中のプロセスをキャンセル |
| `/activation_status` | Botの状態を確認（PayPalログイン状態も表示） |
| `/activation_help` | ヘルプを表示 |

## 使用フロー

### 初回のみ（PayPalログイン）
1. `/paypal` を実行
2. ブラウザが開き、PayPalログインページが表示される
3. 手動でメールアドレスとパスワードを入力
4. ✅ を押すと自動でログインボタンが押される
5. PayPalログイン状態が維持される

### アクティベーション実行
1. `/activation メールアドレス パスワード` を実行
2. VPN接続を確認（✅リアクション）
3. ブラウザが開く（PayPalは既にログイン済み）
4. ChatGPTにログイン（検証コードは自動取得）
5. ワークスペースを選択
6. 無料オファーでサブスクリプション登録
7. PayPal支払い設定（自動ログイン済みのためスキップ）
8. サブスクリプションを即座にキャンセル
9. 完了メッセージを受信

## 注意事項

- mail.tmアカウントのパスワードが必要です（検証コード取得用）
- 既存の`browser_automation.py`と`mail_tm_api.py`を再利用します
- 親ディレクトリの設定ファイルを共有します
- 親Botの `/generate 1`, `/generate 2`, `/paypal` コマンドと連携可能
