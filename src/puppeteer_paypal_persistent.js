/**
 * PayPalログイン維持機能
 * 
 * 機能:
 * 1. セッション確認 - 既存のログイン状態を確認
 * 2. クッキー復元 - 保存済みクッキーを復元
 * 3. 自動ログイン検知 - ログイン成功を自動検知して保存
 * 4. ログイン状態維持 - ブラウザを閉じてもログイン状態を保持
 * 
 * 使い方:
 *   通常起動（自動検出）: node puppeteer_paypal_persistent.js
 *   ログイン強制:          node puppeteer_paypal_persistent.js --force-login
 *   セッションクリア:      node puppeteer_paypal_persistent.js --clear
 *   ステータス確認:        node puppeteer_paypal_persistent.js --status
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const {
    loadSession,
    loadCookies,
    saveSession,
    checkSession,
    clearSession,
    updateLoginStatus
} = require('./paypal_session_manager');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ブラウザパス検出
function detectBrowserPaths() {
    const paths = {
        brave: null,
        chrome: null
    };
    
    const isMac = process.platform === 'darwin';
    
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

// メールアドレスを抽出（複数の方法を試行）
async function extractEmail(page) {
    try {
        // 方法1: ページ内のテキストからメールアドレスを探す
        const emailFromText = await page.evaluate(() => {
            const text = document.body.innerText;
            const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
            const match = text.match(emailRegex);
            return match ? match[0] : null;
        });
        
        if (emailFromText) return emailFromText;
        
        // 方法2: localStorageから取得を試行
        const emailFromStorage = await page.evaluate(() => {
            // PayPal特有のキーを確認
            const keys = ['login_email', 'user_email', 'account_email', 'lastLoginEmail'];
            for (const key of keys) {
                const value = localStorage.getItem(key) || sessionStorage.getItem(key);
                if (value && value.includes('@')) return value;
            }
            return null;
        });
        
        if (emailFromStorage) return emailFromStorage;
        
        // 方法3: クッキーから取得（スクリプト側で処理）
        const cookies = await page.cookies();
        const emailCookie = cookies.find(c => 
            c.name.toLowerCase().includes('email') || 
            c.name.toLowerCase().includes('login') ||
            c.name.toLowerCase().includes('user')
        );
        
        if (emailCookie && emailCookie.value.includes('@')) {
            return decodeURIComponent(emailCookie.value);
        }
        
        return null;
    } catch (error) {
        return null;
    }
}

// ログイン状態を確認（ページ内評価）
async function checkLoginStatus(page) {
    try {
        // PayPalのログイン状態を確認する複数の指標
        const indicators = await page.evaluate(() => {
            const results = {
                hasUserMenu: false,
                hasLoginButton: false,
                hasUserName: false,
                userName: null,
                emailFromPage: null,
                currentUrl: window.location.href
            };
            
            // ユーザーメニューの存在確認
            results.hasUserMenu = !!document.querySelector('[data-testid="user-menu"], .user-menu, [data-name="userMenu"]');
            
            // ログインボタンの存在確認
            results.hasLoginButton = !!document.querySelector('a[href*="/signin"], button[data-testid="login-button"]');
            
            // ユーザー名の表示確認
            const userNameEl = document.querySelector('[data-testid="user-name"], .user-name, .account-name');
            if (userNameEl) {
                results.hasUserName = true;
                results.userName = userNameEl.textContent?.trim();
            }
            
            // メールアドレスを探す（settings/profileページなど）
            const bodyText = document.body.innerText;
            const emailMatch = bodyText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (emailMatch) {
                results.emailFromPage = emailMatch[1];
            }
            
            return results;
        });
        
        // ダッシュボードURLかどうかも確認
        const isDashboard = page.url().includes('/summary') || 
                           page.url().includes('/home') ||
                           page.url().includes('/myaccount');
        
        // メールアドレスを抽出
        const extractedEmail = await extractEmail(page);
        
        return {
            isLoggedIn: indicators.hasUserMenu || (isDashboard && !indicators.hasLoginButton),
            userName: indicators.userName,
            email: extractedEmail || indicators.emailFromPage,
            url: page.url(),
            details: indicators
        };
    } catch (error) {
        console.error('❌ ログイン状態確認エラー:', error.message);
        return { isLoggedIn: false, userName: null, email: null, url: page.url(), error: error.message };
    }
}

// ブラウザ起動（セッション復元対応）
async function launchPayPalBrowser(options = {}) {
    const { forceLogin = false, headless = false, action = 'launch' } = options;
    
    // ステータス確認のみ
    if (action === 'status') {
        const status = checkSession();
        const stats = require('./paypal_session_manager').getSessionStats();
        
        console.log('\n📊 PayPalセッション状態\n');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`セッション有効: ${status.isValid ? '✅' : '❌'}`);
        console.log(`ログイン状態:   ${status.isLoggedIn ? '✅ ログイン済み' : '❌ 未ログイン'}`);
        console.log(`メッセージ:     ${status.message}`);
        
        if (stats.exists) {
            console.log('\n📋 セッション詳細');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`メール:         ${stats.email || '不明'}`);
            console.log(`保存日時:       ${stats.savedAt}`);
            console.log(`経過時間:       ${stats.age.days}日 ${stats.age.hours}時間 ${stats.age.minutes}分`);
            console.log(`有効期限:       無制限`);
            if (stats.lastChecked) {
                console.log(`最終確認:       ${stats.lastChecked}`);
            }
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        return { action: 'status', status, stats };
    }
    
    // セッションクリア
    if (action === 'clear') {
        clearSession();
        console.log('✅ セッションをクリアしました');
        return { action: 'clear', success: true };
    }
    
    // セッション確認
    const sessionCheck = checkSession();
    const savedCookies = loadCookies();
    
    if (!forceLogin && sessionCheck.isValid && sessionCheck.isLoggedIn) {
        console.log('✅ 有効なセッションが見つかりました');
        console.log(`📧 アカウント: ${sessionCheck.details?.email || '不明'}`);
        console.log('🚀 ログイン済み状態でPayPalを開きます...\n');
    } else if (!forceLogin) {
        console.log('⚠️ セッションが見つからないか、有効期限が切れています');
        console.log('👤 手動でログインしてください\n');
    } else {
        console.log('🔑 ログインを強制します\n');
    }
    
    // ブラウザパス検出
    const browserPaths = detectBrowserPaths();
    const browserType = browserPaths.brave ? 'brave' : (browserPaths.chrome ? 'chrome' : null);
    
    if (!browserType) {
        throw new Error('使用可能なブラウザが見つかりません');
    }
    
    const executablePath = browserPaths[browserType];
    console.log(`🌐 ${browserType.toUpperCase()} を起動します...`);
    
    // ユーザーデータディレクトリ（ログイン状態を維持）
    const userDataDir = path.join(__dirname, '..', '.paypal_user_data');
    
    const browser = await puppeteer.launch({
        headless: headless,
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
    
    // 保存済みクッキーを復元
    if (savedCookies && savedCookies.length > 0) {
        try {
            // PayPalドメインのクッキーのみ復元
            const paypalCookies = savedCookies.filter(c => 
                c.domain && (c.domain.includes('paypal.com') || c.domain.includes('.paypal.com'))
            );
            
            if (paypalCookies.length > 0) {
                await page.setCookie(...paypalCookies);
                console.log(`🍪 ${paypalCookies.length}個のクッキーを復元しました`);
            }
        } catch (error) {
            console.error('⚠️ クッキー復元エラー:', error.message);
        }
    }
    
    // PayPalにアクセス
    console.log('🌐 PayPalにアクセスしています...');
    
    // ダッシュボードかサインインページかを決定
    const targetUrl = (!forceLogin && sessionCheck.isValid && sessionCheck.isLoggedIn) 
        ? 'https://www.paypal.com/myaccount/summary'
        : 'https://www.paypal.com/signin';
    
    await page.goto(targetUrl, {
        waitUntil: 'networkidle2',
        timeout: 60000
    });
    
    await sleep(3000);
    
    // ログイン状態を確認
    const loginStatus = await checkLoginStatus(page);
    
    if (loginStatus.isLoggedIn) {
        console.log('✅ ログイン済みです！');
        
        // 表示名（ユーザー名 or メールアドレス）
        const displayName = loginStatus.email || loginStatus.userName;
        if (displayName) {
            console.log(`👤 アカウント: ${displayName}`);
        }
        
        // セッションを更新（メールアドレスを優先）
        const identity = loginStatus.email || loginStatus.userName;
        updateLoginStatus(true, identity);
        
        // クッキーを保存
        try {
            const cookies = await page.cookies();
            const currentSession = loadSession() || {};
            saveSession({ 
                ...currentSession, 
                isLoggedIn: true, 
                email: loginStatus.email,
                userName: loginStatus.userName 
            }, cookies);
        } catch (error) {
            console.error('⚠️ クッキー保存エラー:', error.message);
        }
        
    } else {
        console.log('⚠️ 未ログイン状態です');
        console.log('👆 手動でログインしてください');
        console.log('💡 ログイン後、自動的にセッションが保存されます\n');
        
        // ログイン監視を開始
        startLoginWatcher(page, browser);
    }
    
    // ブラウザを開いたまま維持
    console.log('\n💡 ブラウザは開いたまま維持されます');
    console.log('   閉じるにはブラウザウィンドウを手動で閉じてください\n');
    
    // 無限待機（手動で閉じるまで）
    await new Promise(() => {});
}

// ログイン監視（自動検知）
async function startLoginWatcher(page, browser) {
    let checkCount = 0;
    const maxChecks = 180; // 15分間監視（5秒×180回）
    
    const interval = setInterval(async () => {
        try {
            checkCount++;
            
            // ページが閉じられたかチェック
            if (page.isClosed()) {
                clearInterval(interval);
                return;
            }
            
            const loginStatus = await checkLoginStatus(page);
            
            if (loginStatus.isLoggedIn) {
                console.log('\n🎉 ログインを検知しました！');
                
                // 表示名（メールアドレス or ユーザー名）
                const displayName = loginStatus.email || loginStatus.userName;
                if (displayName) {
                    console.log(`👤 アカウント: ${displayName}`);
                }
                
                // クッキーを取得して保存
                const cookies = await page.cookies();
                updateLoginStatus(true, loginStatus.email || loginStatus.userName, cookies);
                
                // 追加情報も保存
                const currentSession = loadSession() || {};
                saveSession({
                    ...currentSession,
                    isLoggedIn: true,
                    email: loginStatus.email,
                    userName: loginStatus.userName
                }, cookies);
                
                console.log('💾 セッションを保存しました');
                console.log('✅ 次回から自動的にログイン状態で開きます\n');
                
                clearInterval(interval);
            } else if (checkCount >= maxChecks) {
                console.log('\n⏰ ログイン監視を終了しました（タイムアウト）');
                clearInterval(interval);
            }
        } catch (error) {
            // ページが閉じられたなどのエラーは無視
            if (error.message.includes('Target closed')) {
                clearInterval(interval);
            }
        }
    }, 5000); // 5秒ごとにチェック
}

// コマンドライン引数の解析
function parseArgs() {
    const args = process.argv.slice(2);
    
    if (args.includes('--status') || args.includes('-s')) {
        return { action: 'status' };
    }
    
    if (args.includes('--clear') || args.includes('-c')) {
        return { action: 'clear' };
    }
    
    if (args.includes('--force-login') || args.includes('-f')) {
        return { action: 'launch', forceLogin: true };
    }
    
    if (args.includes('--headless') || args.includes('-h')) {
        return { action: 'launch', headless: true };
    }
    
    return { action: 'launch', forceLogin: false };
}

// メイン処理
(async () => {
    try {
        const options = parseArgs();
        await launchPayPalBrowser(options);
    } catch (error) {
        console.error('\n❌ エラー:', error.message);
        process.exit(1);
    }
})();

// モジュールとしてもエクスポート
module.exports = {
    launchPayPalBrowser,
    checkLoginStatus,
    checkSession
};
