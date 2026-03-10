# PayPalログイン維持機能

PayPalのログイン状態を維持し、次回から自動的にログイン済み状態でアクセスできる機能です。

## 機能概要

- ✅ **セッション自動保存** - ログイン後、自動的にセッションを保存
- ✅ **ログイン状態維持** - ブラウザを閉じてもログイン状態を保持（7日間）
- ✅ **自動ログイン検知** - 手動ログインを自動検知して保存
- ✅ **クッキー復元** - 保存済みクッキーを自動復元
- ✅ **Discord Bot統合** - Slash Commandで簡単操作

## 使用方法

### Discord Botコマンド

| コマンド | 説明 |
|---------|------|
| `/paypal-status` | ログイン状態を確認 |
| `/paypal-launch` | ログイン済み状態でPayPalを開く |
| `/paypal-launch force-login:true` | ログインを強制 |
| `/paypal-login` | ログインページを開く（自動保存付き） |
| `/paypal-clear` | セッションをクリア |

### コマンドライン（CLI）

#### Windows
```batch
paypal.bat status        :: 状態確認
paypal.bat launch        :: ログイン済み状態で開く
paypal.bat launch --force :: ログインを強制
paypal.bat login         :: ログインページを開く
paypal.bat clear         :: セッションクリア
```

#### macOS/Linux
```bash
./paypal.sh status        # 状態確認
./paypal.sh launch        # ログイン済み状態で開く
./paypal.sh launch --force # ログインを強制
./paypal.sh login         # ログインページを開く
./paypal.sh clear         # セッションクリア
```

### Node.jsスクリプト直接実行

```bash
# 状態確認
node src/puppeteer_paypal_persistent.js --status

# PayPalを開く（自動検出）
node src/puppeteer_paypal_persistent.js

# ログインを強制
node src/puppeteer_paypal_persistent.js --force-login

# セッションクリア
node src/puppeteer_paypal_persistent.js --clear
```

## 初回セットアップ

1. **初回ログイン**
   ```bash
   # または Discord: /paypal-login
   ./paypal.sh login
   ```

2. **ブラウザが開いたら、手動でPayPalにログイン**

3. **ログイン後、自動的にセッションが保存されます**
   - コンソールに「🎉 ログインを検知しました！」と表示
   - セッションファイルが `.paypal_sessions/` に保存

4. **次回から自動ログイン**
   ```bash
   # または Discord: /paypal-launch
   ./paypal.sh launch
   ```
   - ログイン済み状態でダッシュボードが開きます

## セッション管理

### セッション保存場所

```
.paypal_sessions/
├── session.json    # セッション情報
└── cookies.json    # クッキーデータ
```

### セッション有効期限

- **無制限**（保存され続けます）
- `/paypal-clear` で明示的に削除するまで保持されます

### セキュリティ注意事項

⚠️ **重要**: セッションファイルには機密情報が含まれる可能性があります

- `.paypal_sessions/` ディレクトリは `.gitignore` に追加済み
- セッションファイルを共有しないでください
- 不審な場合は `/paypal-clear` でセッションをクリア

## トラブルシューティング

### ログイン状態が復元されない

1. セッションをクリア
   ```bash
   ./paypal.sh clear
   ```

2. 再度ログイン
   ```bash
   ./paypal.sh login
   ```

### ブラウザが見つからない

環境変数でブラウザパスを指定:
```bash
export BRAVE_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

### セッションの手動確認

```bash
node src/puppeteer_paypal_persistent.js --status
```

### 廃止コマンドが表示される場合

Discordのコマンドが残り続ける場合：

```bash
# コマンドを全削除
./clear-commands.sh        # macOS/Linux
clear-commands.bat         # Windows

# Botを再起動
node src/discord-bot.js
```

出力例:
```
📊 PayPalセッション状態

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
セッション有効: ✅
ログイン状態:   ✅ ログイン済み
メッセージ:     ログイン済み

📋 セッション詳細
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
メール:         user@example.com
保存日時:       2026-03-10T04:00:00.000Z
経過時間:       0日 2時間 30分
有効期限まで:   6日 21時間 30分
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## ファイル構成

```
src/
├── paypal_session_manager.js      # セッション管理モジュール
├── puppeteer_paypal_persistent.js # メインスクリプト
└── discord-bot.js                 # Discord Bot（コマンド追加済み）

paypal.bat                         # Windows CLI
paypal.sh                          # macOS/Linux CLI
PAYPAL_LOGIN.md                    # このドキュメント
```

## 技術仕様

- **セッション保存**: JSON形式
- **クッキー保存**: Puppeteer準拠フォーマット
- **有効期限**: 7日間
- **自動検知間隔**: 5秒ごと（最大15分間）
- **対応ブラウザ**: Brave, Chrome
