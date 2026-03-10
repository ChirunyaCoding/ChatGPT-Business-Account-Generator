# ChatGPT Account Generator

DiscordコマンドからChatGPTアカウントを自動作成できるBotです。

## 機能

- ✅ **自動ブラウザ検出** - Brave/Chromeを自動で切り替え
- ✅ **自動フォールバック** - Brave失敗時は自動でChromeに切り替え
- ✅ **VPN対応** - 各種VPNでの動作確認済み

## 必要要件

- Node.js 16以上
- 以下のブラウザいずれか1つ以上：
  - Brave Browser (推奨)
  - Google Chrome
- macOS / Windows / Linux

## セットアップ

### 1. ブラウザのインストール

**Brave** (推奨):
```bash
brew install brave-browser
```

**Chrome** (代替):
```bash
brew install google-chrome
```

または各公式サイトからダウンロード

### 2. 依存関係インストール

```bash
npm install
```

### 3. Discord Bot設定

1. [Discord Developer Portal](https://discord.com/developers/applications) で新規アプリ作成
2. BotトークンとクライアントIDを取得
3. `.env` ファイルを作成:

```env
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_server_id_here

# ブラウザパス（オプション - 自動検出されます）
# FIREFOX_PATH=/Applications/Firefox.app/Contents/MacOS/firefox
# CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome

# ヘッドレスモード（trueで画面非表示）
HEADLESS=false
```

### 4. Bot起動

```bash
node src/discord-bot.js
```

## 使い方

### コマンド

```
/create-account
```

### 自動動作

1. **ブラウザ検出** - インストールされているブラウザを自動検出
2. **Firefox優先** - Firefoxを優先的に試行
3. **自動フォールバック** - Firefox失敗時は自動でChromeに切り替え
4. **アカウント作成** - 完全自動でアカウントを作成

## 出力例

| ブラウザ | アイコン | 表示例 |
|---------|---------|--------|
| Brave | 🦁 | `使用ブラウザ: brave` |
| Chrome | 🌐 | `使用ブラウザ: chrome` |

**成功時の表示:**
```
🦁 アカウント作成完了！
📧 Email: user1234567890@dollicons.com
🔑 Password: Passxxxxxx
👤 Name: John A. Smith
使用ブラウザ: brave
```

## 自動化フロー

1. mail.tmで一時メールアドレス生成
2. ChatGPTサインアップページへ (https://chatgpt.com/auth/login)
3. 「Sign up for free」ボタンをクリック
4. メールアドレス入力
5. パスワード設定（メールと同じ）
6. 検証コードをメールから取得・入力
7. 名前と生年月日をランダム設定（20歳〜70歳未満）
8. アカウント作成完了

## トラブルシューティング

### ブラウザが見つからない

```bash
# Braveの確認
ls "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

# Chromeの確認
ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

見つからない場合はパスを `.env` に設定してください。

### 両方のブラウザで失敗

- VPNを切断して試行
- 既存のブラウザプロセスを終了: `killall firefox` / `killall "Google Chrome"`
- コンピューターを再起動

### 廃止したコマンドが表示される（Discordコマンドのキャッシュ問題）

一度実装したコマンドが、削除してもDiscord上に残り続けることがあります。

**解決策:**

1. **コマンドを全削除**
   ```bash
   # macOS/Linux
   ./clear-commands.sh
   
   # Windows
   clear-commands.bat
   ```

2. **Botを再起動**
   ```bash
   node src/discord-bot.js
   ```

3. **Discordを再起動**（Ctrl+RまたはCmd+R）

**原因:**
- Discordのグローバルコマンドは反映に最大1時間かかる
- ギルドコマンドとグローバルコマンドの混在
- Discordクライアントのキャッシュ

**予防策:**
- `.env` に `DISCORD_GUILD_ID` を設定してギルドコマンドを使用（即時反映）

## 注意事項

- `.env` ファイルは絶対に公開しないでください
- 作成したアカウントは無料プランになります
- VPN使用時は問題が発生する場合があります
