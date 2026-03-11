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

// mail.tm APIで検証コード取得
async function getVerificationCode(email, password, maxRetries = 10) {
    console.log('📧 検証コードを取得中...');
    
    try {
        try {
            await httpRequest('https://api.mail.tm/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: email, password: password })
            });
        } catch (e) {}
        
        const tokenRes = await httpRequest('https://api.mail.tm/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: email, password: password })
        });
        const token = tokenRes.token;
        
        for (let i = 0; i < maxRetries; i++) {
            console.log(`  ⏳ メール待機... (${i + 1}/${maxRetries})`);
            await sleep(5000);
            
            const messagesRes = await httpRequest('https://api.mail.tm/messages', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const messages = messagesRes['hydra:member'];
            
            for (const msg of messages) {
                if (msg.from.address.includes('openai.com') || 
                    msg.subject.includes('ChatGPT') ||
                    msg.subject.includes('verification')) {
                    
                    const messageRes = await httpRequest(
                        `https://api.mail.tm/messages/${msg.id}`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    
                    const content = messageRes.text || messageRes.html;
                    const codeMatch = content.match(/\b\d{6}\b/);
                    if (codeMatch) {
                        console.log(`  ✅ 検証コード: ${codeMatch[0]}`);
                        return codeMatch[0];
                    }
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('  ❌ メール取得エラー:', error.message);
        return null;
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
        
        // パスワードまたは検証コードを待機（最大30秒）
        console.log('  ⏳ パスワードまたは検証コード入力欄を待機中...');
        let passwordInput = null;
        let codeInput = null;
        
        for (let i = 0; i < 10; i++) {
            passwordInput = await page.$('input[type="password"], input[name="password"]').catch(() => null);
            codeInput = await page.$('input[maxlength="6"], input[autocomplete="one-time-code"], input[data-testid="otp-input"]').catch(() => null);
            
            if (passwordInput || codeInput) {
                break;
            }
            
            console.log(`    待機中... (${i + 1}/10)`);
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
        
        // ログイン成功を確認
        console.log('  🔍 ログイン状態を確認中...');
        const isLoggedIn = await page.evaluate(() => {
            // ログイン成功の指標をチェック
            return window.location.href.includes('/c/') || 
                   window.location.href.includes('/g/') ||
                   document.querySelector('[data-testid="profile-button"]') !== null ||
                   document.querySelector('[data-testid="logout-button"]') !== null ||
                   document.querySelector('button[aria-label="Settings"]') !== null ||
                   document.querySelector('nav') !== null;
        });
        
        if (isLoggedIn) {
            console.log('  ✅ ログイン成功を確認しました');
        } else {
            console.log('  ⚠️ ログイン状態が不明です。URL:', await page.url());
        }
        await sleep(3000);
        
        // ===== 2. 無料オファー画面へ =====
        console.log('\n🎁 Step 2: Get Free Offer');
        
        // SPA対応: URLハッシュを変更して料金ページへ遷移
        console.log('  🔄 料金ページへ移動中...');
        
        // 方法1: JavaScriptでハッシュ変更
        await page.evaluate(() => {
            window.location.hash = '#pricing';
        });
        
        // ページ遷移を待機（URLが変わるのを待つ）
        await page.waitForFunction(() => window.location.hash === '#pricing', { timeout: 30000 });
        console.log('  ✅ URLハッシュを #pricing に変更しました');
        
        // ページコンテンツが読み込まれるまで待機（最大10秒）
        console.log('  ⏳ ページコンテンツの読み込みを待機中...');
        await sleep(5000);
        
        // 料金ページが読み込まれたかチェック
        const isPricingLoaded = await page.evaluate(() => {
            return document.querySelector('[data-testid="select-plan-button-teams-create"]') !== null ||
                   document.querySelector('button[class*="purple"]') !== null ||
                   Array.from(document.querySelectorAll('button')).some(b => 
                       b.textContent.includes('無料オファー') || 
                       b.textContent.includes('Get the free offer') ||
                       b.textContent.includes('Upgrade')
                   );
        });
        
        // 方法2: ハッシュ変更だけでは読み込まれない場合は直接URLにアクセス
        if (!isPricingLoaded) {
            console.log('  ⚠️ ハッシュ変更では読み込まれませんでした。直接アクセスを試みます...');
            await safeGoto(page, 'https://chatgpt.com/#pricing');
            console.log('  ✅ 料金ページに直接アクセスしました');
            await sleep(5000);
            
            // まだ読み込まれていない場合はページをリロード
            const stillNotLoaded = await page.evaluate(() => {
                return document.querySelector('[data-testid="select-plan-button-teams-create"]') === null &&
                       !Array.from(document.querySelectorAll('button')).some(b => 
                           b.textContent.includes('無料オファー') || 
                           b.textContent.includes('Get the free offer') ||
                           b.textContent.includes('Upgrade') ||
                           b.textContent.includes('Subscribe')
                       );
            });
            
            if (stillNotLoaded) {
                console.log('  🔄 ページをリロードします...');
                await page.reload({ waitUntil: 'networkidle2' });
                await sleep(5000);
            }
        } else {
            console.log('  ✅ 料金ページのコンテンツが読み込まれました');
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
                console.log('  ⚠️ 無料オファーボタンが見つかりませんでした');
                
                // 方法3: 「Upgrade」「Subscribe」などの代替ボタンを探す
                console.log('  🔘 代替ボタン（Upgrade/Subscribe）を探しています...');
                const alternativeClicked = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button, a[role="button"]'));
                    const btn = buttons.find(b => {
                        const text = b.textContent.trim().toLowerCase();
                        return text.includes('upgrade') ||
                               text.includes('subscribe') ||
                               text.includes('plan') ||
                               text.includes('プラン') ||
                               text.includes('アップグレード');
                    });
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                });
                
                if (alternativeClicked) {
                    console.log('  ✅ Upgrade/Subscribeボタンをクリックしました');
                    await sleep(10000);
                }
                
                // デバッグ用にスクリーンショットを取得
                try {
                    await page.screenshot({ path: 'debug_pricing_page.png' });
                    console.log('  📸 スクリーンショットを保存しました: debug_pricing_page.png');
                } catch (e) {}
            }
        }
        
        // ===== 4. PayPalタブ選択 =====
        console.log('\n💳 Step 4: PayPal Selection');
        
        // まずStripeのiframeを探す
        let stripeFrame = null;
        try {
            const stripeIframe = await page.waitForSelector('iframe[src*="stripe"], iframe[name*="stripe"]', { timeout: 10000 });
            if (stripeIframe) {
                stripeFrame = await stripeIframe.contentFrame();
                console.log('  ✅ Stripe iframeを検出しました');
            }
        } catch (e) {
            console.log('  ℹ️ Stripe iframeが見つかりませんでした');
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
            console.log('  ℹ️ Address iframe not found. Using existing iframe');
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
        
        // 方法2: Puppeteerのtype()を使用（フォールバック）
        if (!inputSuccess) {
            console.log('    📝 Trying Puppeteer type() method...');
            let successCount = 0;
            
            // ヘルパー関数
            async function findAndType(selectors, value, fieldName) {
                for (const selector of selectors) {
                    try {
                        const el = await page.waitForSelector(selector, { timeout: 2000 });
                        if (el) {
                            await el.type(value, { delay: 30 });
                            console.log(`      ✅ ${fieldName}: ${value}`);
                            return true;
                        }
                    } catch (e) {}
                }
                return false;
            }
            
            // 各フィールドを入力
            if (await findAndType(['#billingAddress-nameInput'], address.name, 'Name')) successCount++;
            await sleep(200);
            
            try {
                const country = await page.waitForSelector('#billingAddress-countryInput', { timeout: 2000 });
                if (country) { await country.select('FR'); console.log('      ✅ Country: France'); successCount++; }
            } catch (e) {}
            await sleep(200);
            
            if (await findAndType(['#billingAddress-addressLine1Input'], address.street, 'Address')) successCount++;
            await sleep(200);
            
            if (await findAndType(['#billingAddress-postalCodeInput'], address.postalCode, 'Postal Code')) successCount++;
            await sleep(200);
            
            if (await findAndType(['#billingAddress-localityInput'], address.city, 'City')) successCount++;
            
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
        
        const subscribeSource = await findAndClickButton(['subscribe', 'start trial', 'start your free', 'get started', 'continue', '登録', '開始']);
        if (subscribeSource) {
            console.log(`  ✅ Subscribeボタンをクリックしました (${subscribeSource})`);
            await sleep(5000);
        }
        
        // ===== 7. 同意して続行（必要な場合） =====
        console.log('\n✅ Step 7: Confirm');
        await sleep(3000);
        
        const consentSource = await findAndClickButton(['agree', 'confirm', 'pay', 'complete', '同意', '確定', 'authorize']);
        if (consentSource) {
            console.log(`  ✅ 同意/確定ボタンをクリックしました (${consentSource})`);
            await sleep(5000);
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
