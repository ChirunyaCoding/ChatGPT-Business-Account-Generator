/**
 * PayPalログイン - 手動ログイン用ブラウザを開く
 * ログイン状態を維持したままブラウザを開く
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ブラウザパス検出
function detectBrowserPaths() {
    const paths = {
        brave: null,
        chrome: null
    };
    
    // Brave検出
    const bravePaths = [
        process.env.BRAVE_PATH,
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        '/usr/bin/brave-browser'
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
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome'
    ];
    
    for (const p of chromePaths) {
        if (p && fs.existsSync(p)) {
            paths.chrome = p;
            break;
        }
    }
    
    return paths;
}

// ブラウザ起動
async function launchPayPalBrowser() {
    const browserPaths = detectBrowserPaths();
    
    // 優先順位: Brave → Chrome
    const browserType = browserPaths.brave ? 'brave' : (browserPaths.chrome ? 'chrome' : null);
    
    if (!browserType) {
        throw new Error('使用可能なブラウザが見つかりません');
    }
    
    const executablePath = browserPaths[browserType];
    console.log(`🚀 ${browserType.toUpperCase()} でPayPalログインページを開きます...`);
    
    // ユーザーデータディレクトリ（ログイン状態を維持）
    const userDataDir = path.join(__dirname, '..', '.paypal_user_data');
    
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: executablePath,
        userDataDir: userDataDir,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080',
            '--start-maximized'
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    // PayPalログインページへ
    console.log('🌐 PayPalログインページに移動します...');
    await page.goto('https://www.paypal.com/signin', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
    });
    
    console.log('✅ PayPalログインページを開きました');
    console.log('👆 手動でログインしてください');
    console.log('💡 ブラウザは開いたまま維持されます');
    
    // ブラウザを開いたまま維持（手動操作待機）
    // ユーザーが手動でブラウザを閉じるまで維持
    await new Promise(() => {
        // 無限待機（手動で閉じるまで）
    });
}

// メイン処理
(async () => {
    try {
        await launchPayPalBrowser();
    } catch (error) {
        console.error('❌ エラー:', error.message);
        process.exit(1);
    }
})();
