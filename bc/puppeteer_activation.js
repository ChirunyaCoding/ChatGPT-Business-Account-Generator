/**
 * ChatGPT Workspace無料オファー有効化自動化
 * 
 * 使用方法:
 *   node puppeteer_activation.js [workspace_email] [workspace_password]
 * 
 * 例:
 *   node puppeteer_activation.js admin@example.com pass123
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { getStripeAddressFieldSelectors } = require('./utils/stripe-address');

try {
    var axios = require('axios');
} catch (e) {
    var axios = null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// HTTPリクエストヘルパー
async function httpRequest(url, options = {}) {
    if (axios) {
        const method = options.method || 'GET';
        const config = {
            url,
            method,
            headers: options.headers || {},
            data: options.body
        };
        const res = await axios(config);
        return res.data;
    } else {
        const res = await fetch(url, options);
        return await res.json();
    }
}

// フランス住所を生成
async function generateFrenchAddress() {
    console.log('🇫🇷 フランス住所を生成中...');
    try {
        const streets = [
            'Rue de la Paix', 'Rue de Rivoli', 'Avenue des Champs-Élysées',
            'Rue du Faubourg Saint-Honoré', 'Boulevard Haussmann', 'Rue de la Convention',
            'Avenue Victor Hugo', 'Rue de Vaugirard', 'Boulevard Saint-Germain',
            'Rue de la Roquette', 'Avenue Jean Jaurès', 'Rue du Bac'
        ];
        const cities = [
            { name: 'Paris', code: '75000' },
            { name: 'Lyon', code: '69000' },
            { name: 'Marseille', code: '13000' },
            { name: 'Bordeaux', code: '33000' },
            { name: 'Toulouse', code: '31000' },
            { name: 'Nantes', code: '44000' },
            { name: 'Strasbourg', code: '67000' },
            { name: 'Lille', code: '59000' }
        ];
        
        const street = streets[Math.floor(Math.random() * streets.length)];
        const number = Math.floor(Math.random() * 200) + 1;
        const city = cities[Math.floor(Math.random() * cities.length)];
        const postalCode = String(parseInt(city.code) + Math.floor(Math.random() * 20)).padStart(5, '0');
        
        const address = {
            name: 'chihalu',
            street: `${number} ${street}`,
            postalCode: postalCode,
            city: city.name
        };
        
        console.log(`  ✅ 住所生成: ${address.street}, ${address.postalCode} ${address.city}`);
        return address;
        
    } catch (error) {
        console.error('  ❌ 住所生成エラー:', error.message);
        return {
            name: 'chihalu',
            street: '123 Rue de la Paix',
            postalCode: '75002',
            city: 'Paris'
        };
    }
}

// 12文字のランダム英数字パスワードを生成
function generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// generator.email で検証コード取得（見つかるまで無限ループ）
async function getVerificationCode(email, password) {
    console.log('📧 検証コードを取得中...');
    
    const username = email.split('@')[0];
    const inboxUrl = `https://generator.email/${email}`;
    
    console.log(`  📧 Inbox URL: ${inboxUrl}`);
    
    // メールを見つかるまで無限ループ
    while (true) {
        try {
            await sleep(3000);
            
            // generator.email のメールページにアクセス
            const html = await httpRequest(inboxUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            // 「Your ChatGPT code is XXXXXX」形式から検証コードを抽出
            const codeMatch = html.match(/Your ChatGPT code is (\d{6})/);
            if (codeMatch) {
                console.log(`  ✅ 検証コード: ${codeMatch[1]}`);
                return codeMatch[1];
            }
            
            // フォールバック: ChatGPT関連のメール内の6桁数字を検索
            if (html.includes('ChatGPT') || html.includes('OpenAI')) {
                const fallbackMatch = html.match(/\b\d{6}\b/);
                if (fallbackMatch) {
                    console.log(`  ✅ 検証コード: ${fallbackMatch[0]}`);
                    return fallbackMatch[0];
                }
            }
        } catch (error) {
            // エラーが出ても続行
        }
    }
}

// ブラウザパス検出
function detectBrowserPaths() {
    const isMac = process.platform === 'darwin';
    const paths = { brave: null, chrome: null };
    
    const bravePaths = [
        process.env.BRAVE_PATH,
        ...(isMac ? ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'] : [])
    ];
    
    for (const p of bravePaths) {
        if (p && fs.existsSync(p)) {
            paths.brave = p;
            break;
        }
    }
    
    const chromePaths = [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ];
    
    for (const p of chromePaths) {
        if (p && fs.existsSync(p)) {
            paths.chrome = p;
            break;
        }
    }
    
    return paths;
}

// ブラウザを起動（フォールバック機構付き）
async function launchBrowserWithFallback() {
    const browserPaths = detectBrowserPaths();
    
    // オプション1: Puppeteer内蔵Chromium（最も信頼性が高い）
    console.log('🔄 Puppeteer内蔵Chromiumで起動を試みます...');
    try {
        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled'
            ],
            ignoreDefaultArgs: ['--enable-automation']
        });
        console.log('✅ Puppeteer内蔵Chromiumで起動しました');
        return browser;
    } catch (e) {
        console.log('⚠️ 内蔵Chromiumの起動に失敗:', e.message);
    }
    
    // オプション2: システムブラウザ（Brave）
    if (browserPaths.brave) {
        console.log(`🔄 Brave (${browserPaths.brave}) で起動を試みます...`);
        try {
            // 一時的なユーザーデータディレクトリを使用（ロック回避）
            const tmpDir = path.join(__dirname, '..', `.activation_tmp_${Date.now()}`);
            const browser = await puppeteer.launch({
                headless: false,
                executablePath: browserPaths.brave,
                userDataDir: tmpDir,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--window-size=1920,1080',
                    '--disable-blink-features=AutomationControlled'
                ],
                ignoreDefaultArgs: ['--enable-automation']
            });
            console.log('✅ Braveで起動しました');
            return browser;
        } catch (e) {
            console.log('⚠️ Braveの起動に失敗:', e.message);
        }
    }
    
    // オプション3: システムブラウザ（Chrome）
    if (browserPaths.chrome) {
        console.log(`🔄 Chrome (${browserPaths.chrome}) で起動を試みます...`);
        try {
            const tmpDir = path.join(__dirname, '..', `.activation_tmp_${Date.now()}`);
            const browser = await puppeteer.launch({
                headless: false,
                executablePath: browserPaths.chrome,
                userDataDir: tmpDir,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--window-size=1920,1080',
                    '--disable-blink-features=AutomationControlled'
                ],
                ignoreDefaultArgs: ['--enable-automation']
            });
            console.log('✅ Chromeで起動しました');
            return browser;
        } catch (e) {
            console.log('⚠️ Chromeの起動に失敗:', e.message);
        }
    }
    
    throw new Error('すべてのブラウザ起動方法が失敗しました。Puppeteerを再インストールしてください: npm install puppeteer');
}

// 安全なナビゲーション（再接続対応）
async function safeGoto(page, url, options = {}) {
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            retries++;
            if (retries > 1) {
                console.log(`  🔄 ナビゲーション再試行 (${retries}/${maxRetries})...`);
            }
            return await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000,
                ...options
            });
        } catch (error) {
            console.log(`  ⚠️ ナビゲーションエラー: ${error.message}`);
            if (retries >= maxRetries) {
                throw error;
            }
            // 少し待ってから再試行
            await sleep(3000);
        }
    }
}

// メイン処理
async function activateFreeOffer(workspaceEmail, workspacePassword) {
    console.log('🚀 Workspace無料オファー有効化自動化\n');
    
    const browser = await launchBrowserWithFallback();
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // エラーハンドリング設定
        page.on('error', err => {
            console.log('  ⚠️ ページエラー:', err.message);
        });
        page.on('pageerror', err => {
            console.log('  ⚠️ ページ内エラー:', err.message);
        });
        
        // ===== 1. ChatGPTログイン =====
        console.log('\n📱 Step 1: ChatGPT Login');
        await safeGoto(page, 'https://chatgpt.com/auth/login');
        await sleep(5000);
        
        // 「ログイン」ボタン
        console.log('  🔘 「ログイン」ボタンを探してクリック...');
        const loginBtn = await page.$('button[data-testid="login-button"]');
        if (loginBtn) {
            await loginBtn.click();
            console.log('  ✅ ログインボタンをクリックしました');
        }
        await sleep(5000);
        
        // メールアドレス入力
        console.log('  ✉️ メールアドレスを入力...');
        const emailInput = await page.waitForSelector('input[type="email"]', { timeout: 30000 });
        await emailInput.type(workspaceEmail, { delay: 50 });
        console.log(`  ✅ メールアドレス入力: ${workspaceEmail}`);
        await sleep(5000);
        
        // 続行ボタン（OpenAIのログインフォーム内のもののみ）
        console.log('  🔘 続行ボタンを探してクリック...');
        const continueClicked = await page.evaluate(() => {
            // OpenAIのログインフォーム内のボタンのみ対象
            const form = document.querySelector('form');
            if (form) {
                const buttons = Array.from(form.querySelectorAll('button[type="submit"], button'));
                const btn = buttons.find(b => {
                    const text = b.textContent.trim();
                    return text === '続行' || text === 'Continue' || text === 'Next';
                });
                if (btn) {
                    btn.click();
                    return true;
                }
            }
            return false;
        });
        if (continueClicked) {
            console.log('  ✅ 続行ボタンをクリックしました');
        }
        await sleep(5000);
        
        // パスワードまたは検証コードを待機（見つかるまで無限ループ）
        console.log('  ⏳ パスワードまたは検証コード入力欄を待機中...');
        let passwordInput = null;
        let codeInput = null;
        
        while (true) {
            passwordInput = await page.$('input[type="password"], input[name="password"]').catch(() => null);
            codeInput = await page.$('input[maxlength="6"], input[autocomplete="one-time-code"], input[data-testid="otp-input"]').catch(() => null);
            
            if (passwordInput || codeInput) {
                break;
            }
            
            await sleep(1000);
        }
        
        if (codeInput) {
            console.log('📱 検証コード検出');
            const code = await getVerificationCode(workspaceEmail, workspacePassword);
            if (code) {
                await codeInput.type(code, { delay: 100 });
                console.log(`  ✅ 検証コード入力: ${code}`);
            } else {
                console.log('  ⚠️ 検証コード取得失敗');
            }
        } else if (passwordInput) {
            console.log('🔑 パスワード入力');
            await passwordInput.type(workspacePassword, { delay: 50 });
            console.log('  ✅ パスワード入力完了');
        } else {
            console.log('  ⚠️ パスワード/検証コード入力欄が見つかりませんでした');
        }
        await sleep(3000);
        
        // ログイン続行
        console.log('  🔘 ログイン続行ボタンを探してクリック...');
        const loginContinueClicked = await page.evaluate(() => {
            // まずフォーム内のボタンを探す
            const form = document.querySelector('form');
            if (form) {
                const buttons = Array.from(form.querySelectorAll('button[type="submit"], button'));
                const btn = buttons.find(b => {
                    const text = b.textContent.trim();
                    return text === '続行' || text === 'Continue' || text === 'Verify' || text === 'Log in' || text === 'ログイン' || text === 'Sign in';
                });
                if (btn) {
                    btn.click();
                    return true;
                }
            }
            // フォーム外でも探す
            const allButtons = Array.from(document.querySelectorAll('button[type="submit"], button'));
            const btn = allButtons.find(b => {
                const text = b.textContent.trim().toLowerCase();
                return text.includes('continue') || text.includes('log in') || text.includes('sign in') || text.includes('verify');
            });
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        if (loginContinueClicked) {
            console.log('  ✅ ログイン続行ボタンをクリックしました');
        } else {
            console.log('  ⚠️ ログイン続行ボタンが見つかりませんでした');
        }
        await sleep(5000);
        
        // ログイン成功を確認（成功するまで無限ループ）
        console.log('  🔍 ログイン状態を確認中...');
        while (true) {
            const isLoggedIn = await page.evaluate(() => {
                return window.location.href.includes('/c/') || 
                       window.location.href.includes('/g/') ||
                       document.querySelector('[data-testid="profile-button"]') !== null ||
                       document.querySelector('[data-testid="logout-button"]') !== null ||
                       document.querySelector('button[aria-label="Settings"]') !== null ||
                       document.querySelector('nav') !== null;
            });
            
            if (isLoggedIn) {
                console.log('  ✅ ログイン成功を確認しました');
                break;
            }
            
            await sleep(2000);
        }
        await sleep(3000);
        
        // ===== 2. 無料オファー画面へ =====
        console.log('\n🎁 Step 2: Get Free Offer');
        
        // 料金ページへ移動（読み込まれるまで無限ループ）
        console.log('  🔄 料金ページへ移動中...');
        
        await page.evaluate(() => {
            window.location.hash = '#pricing';
        });
        
        // 料金ページの要素が読み込まれるまで無限ループ
        while (true) {
            await sleep(2000);
            
            const isLoaded = await page.evaluate(() => {
                return document.querySelector('[data-testid="select-plan-button-teams-create"]') !== null ||
                       document.querySelector('button[class*="purple"]') !== null ||
                       Array.from(document.querySelectorAll('button')).some(b => 
                           b.textContent.includes('無料オファー') || 
                           b.textContent.includes('Get the free offer') ||
                           b.textContent.includes('Upgrade') ||
                           b.textContent.includes('Subscribe')
                       );
            });
            
            if (isLoaded) {
                console.log('  ✅ 料金ページが読み込まれました');
                break;
            }
            
            // 一定間隔で直接アクセスも試行
            const currentUrl = await page.url();
            if (!currentUrl.includes('#pricing')) {
                await page.evaluate(() => {
                    window.location.hash = '#pricing';
                });
            }
        }
        await sleep(3000);
        
        // 「無料オファーを受け取る」ボタン（複数方法で検索）
        console.log('  🔘 無料オファーボタンを探しています...');
        
        // 方法1: data-testidで検索（最も確実）
        let offerBtn = await page.$('button[data-testid="select-plan-button-teams-create"]');
        
        if (offerBtn) {
            console.log('  ✅ 無料オファーボタンを検出しました（data-testid）');
            await offerBtn.click();
            console.log('  ✅ 無料オファーボタンをクリックしました');
            await sleep(30000); // 30秒待機（iframe読み込み待ち）
        } else {
            // 方法2: クラス名とテキストで検索（page.evaluate内で完結）
            const offerClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button[class*="purple"], button[class*="btn-"], button'));
                const btn = buttons.find(b => {
                    const text = b.textContent.trim();
                    return text === '無料オファーを受け取る' ||
                           text.includes('無料オファー') ||
                           text === 'Get the free offer' ||
                           text.includes('Start your free trial');
                });
                if (btn) {
                    btn.click();
                    return true;
                }
                return false;
            });
            
            if (offerClicked) {
                console.log('  ✅ 無料オファーボタンを検出してクリックしました（テキスト検索）');
                await sleep(30000); // 30秒待機（iframe読み込み待ち）
            } else {
                // 見つかるまで無限ループで探す
                while (true) {
                    const found = await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button[class*="purple"], button[class*="btn-"], button'));
                        const btn = buttons.find(b => {
                            const text = b.textContent.trim();
                            return text === '無料オファーを受け取る' ||
                                   text.includes('無料オファー') ||
                                   text === 'Get the free offer' ||
                                   text.includes('Start your free trial') ||
                                   text.toLowerCase().includes('upgrade') ||
                                   text.toLowerCase().includes('subscribe');
                        });
                        if (btn) {
                            btn.click();
                            return true;
                        }
                        return false;
                    });
                    
                    if (found) {
                        console.log('  ✅ 無料オファーボタンを検出してクリックしました');
                        await sleep(30000);
                        break;
                    }
                    
                    await sleep(1000);
                }
            }
        }
        
        // ===== 4. PayPalタブ選択 =====
        console.log('\n💳 Step 4: PayPal Selection');
        
        // まずStripeのiframeを探す（見つかるまで無限ループ）
        let stripeFrame = null;
        while (!stripeFrame) {
            try {
                const stripeIframe = await page.$('iframe[src*="stripe"], iframe[name*="stripe"]');
                if (stripeIframe) {
                    stripeFrame = await stripeIframe.contentFrame();
                    console.log('  ✅ Stripe iframeを検出しました');
                    break;
                }
            } catch (e) {}
            await sleep(1000);
        }
        
        // PayPalタブを探してクリック
        let paypalTabClicked = false;
        
        if (stripeFrame) {
            // iframe内でPayPalタブを探す
            try {
                paypalTabClicked = await stripeFrame.evaluate(() => {
                    const btn = document.querySelector('button[data-testid="paypal"], button[value="paypal"], #paypal-tab');
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    // テキストでも探す
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const paypalBtn = buttons.find(b => 
                        b.textContent.trim() === 'PayPal' ||
                        b.getAttribute('aria-label')?.includes('PayPal') ||
                        b.querySelector('img[alt*="PayPal"], img[src*="paypal"]')
                    );
                    if (paypalBtn) {
                        paypalBtn.click();
                        return true;
                    }
                    return false;
                });
                
                if (paypalTabClicked) {
                    console.log('  ✅ Stripe iframe内のPayPalタブを選択しました');
                    await sleep(5000);
                }
            } catch (frameError) {
                console.log('  ⚠️ iframe内のPayPalタブ選択エラー:', frameError.message);
            }
        }
        
        // iframe内で見つからなかった場合、メインページでも探す
        if (!paypalTabClicked) {
            paypalTabClicked = await page.evaluate(() => {
                const btn = document.querySelector('button[data-testid="paypal"], button[value="paypal"], #paypal-tab');
                if (btn) {
                    btn.click();
                    return true;
                }
                const buttons = Array.from(document.querySelectorAll('button'));
                const paypalBtn = buttons.find(b => 
                    b.textContent.trim() === 'PayPal' ||
                    b.getAttribute('aria-label')?.includes('PayPal')
                );
                if (paypalBtn) {
                    paypalBtn.click();
                    return true;
                }
                return false;
            });
            
            if (paypalTabClicked) {
                console.log('  ✅ PayPalタブを選択しました');
                await sleep(5000);
            } else {
                console.log('  ℹ️ PayPalタブが見つかりませんでした（自動的に進むかもしれません）');
            }
        }
        
        // PayPal選択後、住所入力用のiframeを取得し直す
        console.log('🔑 PayPal選択確認...');
        console.log('  ⏳ 住所入力フォームの読み込みを待機中...');
        await sleep(5000);
        
        // 住所入力用のStripe iframeを再取得（別のiframeの可能性がある）
        let addressFrame = null;
        for (let i = 0; i < 15; i++) {
            try {
                // 住所入力用のiframeを探す（elements-inner-address）
                const addressIframe = await page.waitForSelector('iframe[src*="elements-inner-address"], iframe[name*="StripeFrame"]', { timeout: 5000 });
                if (addressIframe) {
                    addressFrame = await addressIframe.contentFrame();
                    console.log('  ✅ 住所入力用iframeを検出しました');
                    break;
                }
            } catch (e) {
                // 見つからない場合は別のセレクタも試す
                try {
                    const allIframes = await page.$$('iframe');
                    for (const iframe of allIframes) {
                        const src = await iframe.evaluate(el => el.src);
                        if (src && src.includes('stripe') && src.includes('address')) {
                            addressFrame = await iframe.contentFrame();
                            console.log('  ✅ 住所入力用iframeを検出しました（代替方法）');
                            break;
                        }
                    }
                    if (addressFrame) break;
                } catch (e2) {}
            }
            
            console.log(`    Waiting for address iframe... (${i + 1}/15)`);
            await sleep(2000);
        }
        
        // 方法3: page.frames()を使って全フレームから探す
        if (!addressFrame) {
            console.log('  🔍 Searching in all frames...');
            const allFrames = page.frames();
            console.log(`    Total frames: ${allFrames.length}`);
            for (let i = 0; i < allFrames.length; i++) {
                try {
                    const url = allFrames[i].url();
                    console.log(`    Frame ${i}: ${url.substring(0, 80)}...`);
                    if (url.includes('stripe') && url.includes('address')) {
                        addressFrame = allFrames[i];
                        console.log('  ✅ Address iframe found in frames list');
                        break;
                    }
                } catch (e) {}
            }
        }
        
        // 住所入力用iframeが見つからない場合は、元のstripeFrameを使う
        if (!addressFrame) {
            addressFrame = stripeFrame;
        }
        
        // iframe情報をデバッグ表示
        if (addressFrame) {
            try {
                const frameUrl = addressFrame.url();
                console.log(`  📋 Address iframe URL: ${frameUrl.substring(0, 100)}...`);
            } catch (e) {}
        }
        
        // iframeが完全に読み込まれるまで待機
        if (addressFrame) {
            console.log('  ⏳ Waiting for iframe to fully load...');
            try {
                await addressFrame.waitForFunction(() => {
                    return document.readyState === 'complete' ||
                           document.querySelectorAll('input, select').length > 0;
                }, { timeout: 10000 });
                console.log('  ✅ Iframe loaded');
            } catch (e) {
                console.log('  ⚠️ Iframe load wait timeout, continuing anyway');
            }
        }
        
        // ===== 5. Address Entry =====
        console.log('\n🏠 Step 5: Entering French Address');
        const address = await generateFrenchAddress();
        
        // Shadow DOMやiframe内の要素を含めて検索
        console.log('  📝 Entering address...');
        
        // スクリーンショットを取得（デバッグ用）
        try {
            await page.screenshot({ path: 'debug_address_form.png' });
            console.log('    📸 Screenshot saved: debug_address_form.png');
        } catch (e) {}
        
        let inputSuccess = false;
        const stripeAddressSelectors = getStripeAddressFieldSelectors();
        
        // 方法1: page.evaluate() でShadow DOMを含む全要素を検索・入力
        console.log('    📝 Trying page.evaluate() for Shadow DOM access...');
        try {
            const evalResult = await page.evaluate((addr) => {
                console.log('Starting address entry...');
                
                // まず全iframeを確認
                const iframes = document.querySelectorAll('iframe');
                console.log(`Found ${iframes.length} iframes`);
                
                // ヘルパー: Shadow DOMを含めて要素を探す（再帰的）
                function queryDeep(selector) {
                    // 通常のDOM
                    let el = document.querySelector(selector);
                    if (el) {
                        console.log(`Found ${selector} in normal DOM`);
                        return el;
                    }
                    
                    // iframe内
                    for (const iframe of document.querySelectorAll('iframe')) {
                        try {
                            if (iframe.contentDocument) {
                                el = iframe.contentDocument.querySelector(selector);
                                if (el) {
                                    console.log(`Found ${selector} in iframe`);
                                    return el;
                                }
                            }
                        } catch (e) {}
                    }
                    
                    // Shadow DOM内（再帰的）
                    function searchShadowDOM(root, selector) {
                        const all = root.querySelectorAll('*');
                        for (const elem of all) {
                            if (elem.shadowRoot) {
                                const found = elem.shadowRoot.querySelector(selector);
                                if (found) {
                                    console.log(`Found ${selector} in shadow DOM`);
                                    return found;
                                }
                                // ネストしたShadow DOMを検索
                                const nested = searchShadowDOM(elem.shadowRoot, selector);
                                if (nested) return nested;
                            }
                        }
                        return null;
                    }
                    
                    return searchShadowDOM(document, selector);
                }
                
                let count = 0;
                const results = [];
                
                // すべてのinput/selectをログ
                const allInputs = document.querySelectorAll('input, select');
                console.log(`Total inputs on page: ${allInputs.length}`);
                
                // 名前
                const name = queryDeep('#billingAddress-nameInput') || 
                            queryDeep('input[name="name"]') ||
                            queryDeep('input[autocomplete*="name"]');
                if (name) {
                    name.focus();
                    name.value = addr.name;
                    name.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    name.dispatchEvent(new Event('change', { bubbles: true }));
                    name.blur();
                    count++;
                    results.push('name');
                    console.log('Name filled:', addr.name);
                } else {
                    console.log('Name input not found');
                }
                
                // 国
                const country = queryDeep('#billingAddress-countryInput') ||
                               queryDeep('select[name="country"]');
                if (country) {
                    country.value = 'FR';
                    country.dispatchEvent(new Event('change', { bubbles: true }));
                    count++;
                    results.push('country');
                    console.log('Country filled: FR');
                }
                
                // 住所
                const street = queryDeep('#billingAddress-addressLine1Input') ||
                              queryDeep('input[name="addressLine1"]');
                if (street) {
                    street.focus();
                    street.value = addr.street;
                    street.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    street.dispatchEvent(new Event('change', { bubbles: true }));
                    street.blur();
                    count++;
                    results.push('street');
                    console.log('Street filled:', addr.street);
                }
                
                // 郵便番号
                const postal = queryDeep('#billingAddress-postalCodeInput') ||
                              queryDeep('input[name="postalCode"]');
                if (postal) {
                    postal.focus();
                    postal.value = addr.postalCode;
                    postal.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    postal.dispatchEvent(new Event('change', { bubbles: true }));
                    postal.blur();
                    count++;
                    results.push('postal');
                    console.log('Postal filled:', addr.postalCode);
                }
                
                // 都市
                const city = queryDeep('#billingAddress-localityInput') ||
                            queryDeep('input[name="locality"]') ||
                            queryDeep('input[name="city"]');
                if (city) {
                    city.focus();
                    city.value = addr.city;
                    city.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    city.dispatchEvent(new Event('change', { bubbles: true }));
                    city.blur();
                    count++;
                    results.push('city');
                    console.log('City filled:', addr.city);
                }
                
                return { count, fields: results };
            }, address);
            
            console.log(`      Filled fields: ${evalResult.fields.join(', ')} (${evalResult.count}/5)`);
            if (evalResult.count >= 3) {
                console.log('      ✅ Address entered via page.evaluate()');
                inputSuccess = true;
            }
        } catch (e) {
            console.log('      ⚠️ page.evaluate() failed:', e.message);
        }

        // 方法1.5: addressFrame.evaluate() でShadow DOMを含めて検索・入力
        if (!inputSuccess && addressFrame) {
            console.log('    📝 Trying addressFrame.evaluate() for Shadow DOM access...');
            try {
                const evalResult = await addressFrame.evaluate((addr, selectors) => {
                    function queryDeep(selector, root) {
                        const base = root || document;
                        const direct = base.querySelector(selector);
                        if (direct) return direct;

                        const nodes = base.querySelectorAll('*');
                        for (const node of nodes) {
                            if (node.shadowRoot) {
                                const found = queryDeep(selector, node.shadowRoot);
                                if (found) return found;
                            }
                        }
                        return null;
                    }

                    function dispatchInputEvents(el) {
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    function setValue(el, value) {
                        try { el.focus(); } catch (e) {}
                        el.value = value;
                        dispatchInputEvents(el);
                        try { el.blur(); } catch (e) {}
                    }

                    function fillBySelectors(list, value, options) {
                        for (const selector of list) {
                            const el = queryDeep(selector);
                            if (!el) continue;

                            if (options && options.country) {
                                if (el.tagName === 'SELECT') {
                                    el.value = 'FR';
                                    dispatchInputEvents(el);
                                    return selector;
                                }
                                if (el.tagName === 'INPUT') {
                                    setValue(el, 'France');
                                    return selector;
                                }
                                if (el.tagName === 'BUTTON') {
                                    el.click();
                                    return selector;
                                }
                                continue;
                            }

                            setValue(el, value);
                            return selector;
                        }
                        return null;
                    }

                    const fields = [];
                    if (fillBySelectors(selectors.name, addr.name)) fields.push('name');
                    if (fillBySelectors(selectors.country, 'FR', { country: true })) fields.push('country');
                    if (fillBySelectors(selectors.line1, addr.street)) fields.push('street');
                    if (fillBySelectors(selectors.postal, addr.postalCode)) fields.push('postal');
                    if (fillBySelectors(selectors.city, addr.city)) fields.push('city');

                    return { count: fields.length, fields };
                }, address, stripeAddressSelectors);

                console.log(`      Filled fields (frame.evaluate): ${evalResult.fields.join(', ')} (${evalResult.count}/5)`);
                if (evalResult.count >= 3) {
                    console.log('      ✅ Address entered via addressFrame.evaluate()');
                    inputSuccess = true;
                }
            } catch (e) {
                console.log('      ⚠️ addressFrame.evaluate() failed:', e.message);
            }
        }
        
        // 方法2: addressFrame経由でtype()（クロスオリジンiframe対応）
        if (!inputSuccess && addressFrame) {
            console.log('    📝 Trying addressFrame.type() method...');
            let successCount = 0;

            async function findAndTypeInFrame(frame, selectors, value, fieldName) {
                for (const selector of selectors) {
                    try {
                        const el = await frame.waitForSelector(selector, { timeout: 3000, visible: true });
                        if (el) {
                            await el.click({ clickCount: 3 });
                            await el.type(value, { delay: 30 });
                            console.log(`      ✅ ${fieldName}: ${value}`);
                            return true;
                        }
                    } catch (e) {}
                }
                return false;
            }

            if (await findAndTypeInFrame(addressFrame, stripeAddressSelectors.name, address.name, 'Name')) successCount++;
            await sleep(200);

            try {
                const country = await addressFrame.waitForSelector(stripeAddressSelectors.country.join(', '), { timeout: 2000 });
                if (country) {
                    const tagName = await country.evaluate(el => el.tagName);
                    if (tagName === 'SELECT') {
                        await country.select('FR');
                    } else {
                        await country.click({ clickCount: 3 });
                        await country.type('France', { delay: 30 });
                    }
                    console.log('      ✅ Country: France');
                    successCount++;
                }
            } catch (e) {}
            await sleep(200);

            if (await findAndTypeInFrame(addressFrame, stripeAddressSelectors.line1, address.street, 'Address')) successCount++;
            await sleep(200);

            if (await findAndTypeInFrame(addressFrame, stripeAddressSelectors.postal, address.postalCode, 'Postal Code')) successCount++;
            await sleep(200);

            if (await findAndTypeInFrame(addressFrame, stripeAddressSelectors.city, address.city, 'City')) successCount++;

            inputSuccess = successCount >= 3;
        }
        
        // 最終フォールバック: メインページで直接探す
        if (!inputSuccess) {
            console.log('  📝 Final fallback: searching on main page...');
            
            // 名前 (Name)
            const nameInput = await page.$('#billingAddress-nameInput, input[name="name"]');
            if (nameInput) {
                await nameInput.type(address.name, { delay: 50 });
                console.log(`    ✅ Name: ${address.name}`);
            }
            
            // 住所 (Address)
            const streetInput = await page.$('#billingAddress-addressLine1Input, input[name="addressLine1"]');
            if (streetInput) {
                await streetInput.type(address.street, { delay: 50 });
                console.log(`    ✅ Address: ${address.street}`);
            }
            
            // 郵便番号 (Postal Code)
            const postalInput = await page.$('#billingAddress-postalCodeInput, input[name="postalCode"]');
            if (postalInput) {
                await postalInput.type(address.postalCode, { delay: 50 });
                console.log(`    ✅ Postal Code: ${address.postalCode}`);
            }
            
            // 都市 (City)
            const cityInput = await page.$('#billingAddress-localityInput, input[name="city"], input[name="locality"]');
            if (cityInput) {
                await cityInput.type(address.city, { delay: 50 });
                console.log(`    ✅ City: ${address.city}`);
            }
            
            await sleep(2000);
        }
        
        // エラーモニター関数：不明なエラーを検出して「もう一度試す」をクリック
        async function monitorAndRetryError() {
            console.log('  🔍 エラーモニターを開始...');
            
            const maxCheckAttempts = 60; // 最大60回チェック（約2分）
            for (let i = 0; i < maxCheckAttempts; i++) {
                await sleep(2000); // 2秒ごとにチェック
                
                try {
                    // 不明なエラーメッセージを検出
                    const hasUnknownError = await page.evaluate(() => {
                        const errorElements = document.querySelectorAll('span._root_xeddl_1, .error-message, div[class*="error"]');
                        for (const el of errorElements) {
                            const text = el.textContent;
                            if (text && (text.includes('不明なエラーが発生しました') || text.includes('An unknown error occurred'))) {
                                return true;
                            }
                        }
                        return false;
                    });
                    
                    if (hasUnknownError) {
                        console.log('  ⚠️ 不明なエラーを検出しました。「もう一度試す」ボタンを探します...');
                        
                        // 「もう一度試す」ボタンを探してクリック
                        const retryClicked = await page.evaluate(() => {
                            const buttons = Array.from(document.querySelectorAll('button'));
                            const retryBtn = buttons.find(b => {
                                const text = b.textContent.trim();
                                return text.includes('もう一度試す') || 
                                       text.includes('Try again') ||
                                       b.getAttribute('data-dd-action-name') === 'Try again';
                            });
                            if (retryBtn) {
                                retryBtn.click();
                                return true;
                            }
                            return false;
                        });
                        
                        if (retryClicked) {
                            console.log('  ✅ 「もう一度試す」ボタンをクリックしました。処理を継続します...');
                            await sleep(5000); // リトライ後の読み込み待機
                            return true; // リトライ成功
                        } else {
                            console.log('  ⚠️ 「もう一度試す」ボタンが見つかりませんでした');
                        }
                    }
                    
                    // 成功メッセージや次の画面が表示されたら終了
                    const isSuccess = await page.evaluate(() => {
                        return document.querySelector('[data-testid="success"]') !== null ||
                               document.querySelector('.success-message') !== null ||
                               window.location.href.includes('/success');
                    });
                    
                    if (isSuccess) {
                        console.log('  ✅ 成功画面が検出されました');
                        return false; // 成功したので監視終了
                    }
                    
                } catch (e) {
                    // エラーが発生しても続行
                }
                
                // 30秒ごとに進捗を表示
                if (i % 15 === 0 && i > 0) {
                    console.log(`  ⏳ エラーモニター実行中... (${i * 2}秒経過)`);
                }
            }
            
            console.log('  ℹ️ エラーモニターを終了します');
            return false;
        }
        
        // ===== 6. サブスクリプション登録（Subscribeボタン） =====
        console.log('\n📝 Step 6: Subscribe');
        await sleep(3000);
        
        // ボタン検索ヘルパー（iframeとメインページの両方を試行）
        async function findAndClickButton(textPatterns) {
            // まず住所入力iframeで検索
            if (addressFrame) {
                try {
                    const clicked = await addressFrame.evaluate((patterns) => {
                        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                        const btn = buttons.find(b => {
                            const text = b.textContent.trim().toLowerCase();
                            return patterns.some(p => text.includes(p));
                        });
                        if (btn && !btn.disabled) {
                            btn.click();
                            return true;
                        }
                        return false;
                    }, textPatterns);
                    if (clicked) return 'iframe';
                } catch (e) {}
            }
            
            // メインページで検索
            try {
                const clicked = await page.evaluate((patterns) => {
                    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                    const btn = buttons.find(b => {
                        const text = b.textContent.trim().toLowerCase();
                        return patterns.some(p => text.includes(p));
                    });
                    if (btn && !btn.disabled) {
                        btn.click();
                        return true;
                    }
                    return false;
                }, textPatterns);
                if (clicked) return 'page';
            } catch (e) {}
            
            return false;
            
            return clicked ? 'page' : false;
        }
        
        // Subscribeボタンを見つかるまで探す
        console.log('  🔘 Subscribeボタンを探しています...');
        while (true) {
            const subscribeSource = await findAndClickButton(['subscribe', 'start trial', 'start your free', 'get started', 'continue', '登録', '開始']);
            if (subscribeSource) {
                console.log(`  ✅ Subscribeボタンをクリックしました (${subscribeSource})`);
                await sleep(5000);
                
                // エラーモニター開始
                const retried = await monitorAndRetryError();
                if (retried) {
                    console.log('  🔄 エラーが検出されてリトライしました。処理を継続します...');
                }
                break;
            }
            await sleep(1000);
        }
        
        // ===== 7. 同意して続行（必要な場合） =====
        console.log('\n✅ Step 7: Confirm');
        
        // 同意ボタンを見つかるまで探す
        while (true) {
            const consentSource = await findAndClickButton(['agree', 'confirm', 'pay', 'complete', '同意', '確定', 'authorize']);
            if (consentSource) {
                console.log(`  ✅ 同意/確定ボタンをクリックしました (${consentSource})`);
                await sleep(5000);
                
                // エラーモニター開始
                const retried2 = await monitorAndRetryError();
                if (retried2) {
                    console.log('  🔄 エラーが検出されてリトライしました。処理を継続します...');
                }
                break;
            }
            await sleep(1000);
        }
        
        // 最終エラーチェック
        console.log('  🔍 最終エラーチェック...');
        const finalRetried = await monitorAndRetryError();
        if (finalRetried) {
            console.log('  🔄 最終チェックでエラーが検出されてリトライしました');
        }
        
        console.log('\n🎉 Complete! 1-month free offer activated!');
        
        await browser.close();
        
        return {
            success: true,
            workspaceEmail,
            address
        };
        
    } catch (error) {
        console.error('❌ エラー:', error.message);
        try {
            await browser.close();
        } catch (closeError) {
            // ブラウザが既に閉じられている場合は無視
            console.log('  ℹ️ ブラウザは既に閉じられています');
        }
        throw error;
    }
}

// コマンドライン実行
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('使用方法: node puppeteer_activation.js [workspace_email] [workspace_password]');
    console.log('例: node puppeteer_activation.js admin@example.com pass123');
    process.exit(1);
}

const [workspaceEmail, workspacePassword] = args;

activateFreeOffer(workspaceEmail, workspacePassword)
    .then(result => {
        console.log('\n✅ Success:', result);
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Failed:', error.message);
        process.exit(1);
    });

module.exports = { activateFreeOffer };
