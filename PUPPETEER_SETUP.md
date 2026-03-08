# Puppeteer Extra + Stealth Plugin セットアップ手順

## 概要
最強の検出回避構成：
- ✅ Puppeteer Extra（Stealth Plugin）
- ✅ 実際のChromeプロファイル使用
- ✅ 人間らしい動作（マウス移動、タイピング）

## インストール手順

### 1. Node.jsのインストール（まだなら）
```bash
# https://nodejs.org/ から LTS版をダウンロードしてインストール
# バージョン16以上が必要
```

### 2. 依存関係のインストール
```bash
# プロジェクトフォルダで実行
cd "i:\Programming\PF\2026\3\ChatGPT Business Account Generator"
npm install
```

### 3. Chromeプロファイルの確認
```javascript
// puppeteer_extra_bot.js のこの部分を確認
const YOUR_USERNAME = os.userInfo().username;  // 自動で取得
const CHROME_USER_DATA_DIR = `C:\\Users\\${YOUR_USERNAME}\\AppData\\Local\\Google\\Chrome\\User Data`;
```

**重要:**
- 実行前にChromeを**完全に閉じる**（すべてのウィンドウ）
- プロファイルパスが存在するか確認

### 4. 実行
```bash
node puppeteer_extra_bot.js
```

## 仕組み

### なぜ実Chromeプロファイルが強い？

| 要素 | Playwright（新規プロファイル） | 実Chromeプロファイル |
|-----|---------------------------|------------------|
| **Cookie履歴** | なし（真っ白） | Googleログイン済み等 |
| **キャッシュ** | なし | 実際の閲覧履歴あり |
| **拡張機能** | なし | 実際にインストール済みのもの |
| **LocalStorage** | 空 | 各サイトの保存データあり |
| **信頼スコア** | 低い | **高い** |

### Stealth Pluginの効果

```javascript
// 以下を自動で回避
- navigator.webdriver
- Chromeの自動化フラグ
- Pluginsの不一致
- WebGL/vendor偽装
- Canvasフィンガープリント
```

## トラブルシューティング

### 「Chromeが既に開いています」エラー
```bash
# Chromeを完全に終了してから実行
taskkill /F /IM chrome.exe
```

### Turnstileが無限ループする
1. 同じプロファイルを**継続使用**（信頼スコア向上）
2. VPNを切り替える
3. 1日置いて再試行

### メールが届かない
- mail.tmの確認を待つ（最大5分）
- スパムフォルダを確認

## 成功のコツ

1. **初回は手動でTurnstileを突破** → 同じプロファイルを使い続ける
2. **同じIPで継続** → 信頼スコアが蓄積
3. **急がない** → 人間らしい遅延を入れる

## 料金

**完全無料**（Node.js + Puppeteerはオープンソース）
