/**
 * Open Browser - ブラウザを起動するだけのスクリプト
 * Usage: node open_browser.js [chrome|brave]
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ブラウザパス検出
function detectBrowserPaths() {
    const isMac = process.platform === 'darwin';
    const paths = { brave: null, chrome: null };
    
    // Brave検出
    const bravePaths = [
        process.env.BRAVE_PATH,
        ...(isMac ? [
            '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
            '/usr/bin/brave-browser'
        ] : [
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ])
    ];
    
    for (const p of bravePaths) {
        if (p && fs.existsSync(p)) {
            paths.brave = p;
            break;
        }
    }
    
    // Chrome検出
    const chromePaths = [
        process.env.CHROME_PATH,
        ...(isMac ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/usr/bin/google-chrome'
        ] : [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ])
    ];
    
    for (const p of chromePaths) {
        if (p && fs.existsSync(p)) {
            paths.chrome = p;
            break;
        }
    }
    
    return paths;
}

// メイン処理
async function openBrowser() {
    // コマンドライン引数からブラウザタイプを取得
    const requestedBrowser = process.argv[2]?.toLowerCase();
    
    // ブラウザ検出
    const browserPaths = detectBrowserPaths();
    
    let browserType;
    let browserPath;
    
    if (requestedBrowser === 'brave') {
        if (!browserPaths.brave) {
            throw new Error('Braveブラウザが見つかりません。');
        }
        browserType = 'brave';
        browserPath = browserPaths.brave;
    } else if (requestedBrowser === 'chrome') {
        if (!browserPaths.chrome) {
            throw new Error('Chromeブラウザが見つかりません。');
        }
        browserType = 'chrome';
        browserPath = browserPaths.chrome;
    } else {
        // 指定なしの場合は自動選択（Brave優先）
        if (browserPaths.brave) {
            browserType = 'brave';
            browserPath = browserPaths.brave;
        } else if (browserPaths.chrome) {
            browserType = 'chrome';
            browserPath = browserPaths.chrome;
        } else {
            throw new Error('ブラウザが見つかりません。BraveまたはChromeをインストールしてください。');
        }
    }
    
    const headlessMode = process.env.HEADLESS === 'true';
    
    // openbrowser 専用のユーザーデータディレクトリ
    const userDataDir = path.join(__dirname, '..', '.open_browser_user_data');
    
    console.log(`🚀 ${browserType === 'brave' ? '🦁 Brave' : '🌐 Chrome'}を起動中...`);
    
    const browser = await puppeteer.launch({
        headless: headlessMode,
        executablePath: browserPath,
        userDataDir: userDataDir,  // ログイン状態を維持
        slowMo: 50,
        timeout: 120000,
        args: [
            '--width=1920',
            '--height=1080',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // ChatGPTに移動
    console.log('🌐 ChatGPTに移動します...');
    await page.goto('https://chatgpt.com', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });
    
    console.log('✅ ブラウザを起動しました');
    console.log('⏳ ブラウザは開いたままです。手動で操作してください。');
    console.log('   終了するにはブラウザウィンドウを閉じてください。');
    
    // 無期限に保持（手動で閉じるまで）
    while (true) {
        await sleep(60000); // 1分ごとにチェック（実際は何もしない）
    }
}

openBrowser()
    .then(() => {
        console.log('👋 ブラウザを閉じました');
        process.exit(0);
    })
    .catch(error => {
        console.error('❌ エラー:', error.message);
        process.exit(1);
    });
