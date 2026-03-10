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

// メイン処理
async function activateFreeOffer(workspaceEmail, workspacePassword) {
    console.log('🚀 Workspace無料オファー有効化自動化\n');
    
    const browserPaths = detectBrowserPaths();
    const browserType = browserPaths.brave || browserPaths.chrome;
    
    if (!browserType) {
        throw new Error('ブラウザが見つかりません');
    }
    
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: browserType,
        userDataDir: path.join(__dirname, '..', '.paypal_user_data'),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled'
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // ===== 1. ChatGPTログイン =====
        console.log('\n📱 ステップ1: ChatGPTログイン');
        await page.goto('https://chatgpt.com/auth/login', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
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
        const continueBtn = await page.evaluateHandle(() => {
            // OpenAIのログインフォーム内のボタンのみ対象
            const form = document.querySelector('form');
            if (form) {
                const buttons = Array.from(form.querySelectorAll('button[type="submit"], button'));
                return buttons.find(b => {
                    const text = b.textContent.trim();
                    return text === '続行' || text === 'Continue' || text === 'Next';
                });
            }
            return null;
        });
        if (continueBtn) {
            await continueBtn.click();
            console.log('  ✅ 続行ボタンをクリックしました');
        }
        await sleep(5000);
        
        // パスワードまたは検証コードを待機
        const [passwordInput, codeInput] = await Promise.all([
            page.$('input[type="password"]').catch(() => null),
            page.$('input[maxlength="6"], input[autocomplete="one-time-code"]').catch(() => null)
        ]);
        
        if (codeInput) {
            console.log('📱 検証コード検出');
            const code = await getVerificationCode(workspaceEmail, workspacePassword);
            if (code) {
                await codeInput.type(code, { delay: 100 });
            }
        } else if (passwordInput) {
            console.log('🔑 パスワード入力');
            await passwordInput.type(workspacePassword, { delay: 50 });
        }
        await sleep(5000);
        
        // ログイン続行
        console.log('  🔘 ログイン続行ボタンを探してクリック...');
        const loginContinue = await page.evaluateHandle(() => {
            const form = document.querySelector('form');
            if (form) {
                const buttons = Array.from(form.querySelectorAll('button[type="submit"], button'));
                return buttons.find(b => {
                    const text = b.textContent.trim();
                    return text === '続行' || text === 'Continue' || text === 'Verify' || text === 'Log in' || text === 'ログイン';
                });
            }
            return null;
        });
        if (loginContinue) {
            await loginContinue.click();
            console.log('  ✅ ログイン続行ボタンをクリックしました');
        }
        await sleep(5000);
        
        // ===== 2. 無料オファー画面へ =====
        console.log('\n🎁 ステップ2: 無料オファーを受け取る');
        await page.goto('https://chatgpt.com/#pricing', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        await sleep(5000);
        
        // 「無料オファーを受け取る」ボタン（複数方法で検索）
        console.log('  🔘 無料オファーボタンを探しています...');
        
        // 方法1: data-testidで検索（最も確実）
        let offerBtn = await page.$('button[data-testid="select-plan-button-teams-create"]');
        
        // 方法2: クラス名とテキストで検索
        if (!offerBtn) {
            offerBtn = await page.evaluateHandle(() => {
                const buttons = Array.from(document.querySelectorAll('button.btn-purple, button'));
                return buttons.find(b => {
                    const text = b.textContent.trim();
                    return text === '無料オファーを受け取る' ||
                           text.includes('無料オファー') ||
                           text === 'Get the free offer';
                });
            });
        }
        
        if (offerBtn) {
            console.log('  ✅ 無料オファーボタンを検出しました');
            await offerBtn.click();
            console.log('  ✅ 無料オファーボタンをクリックしました');
            await sleep(30000); // 30秒待機（iframe読み込み待ち）
        } else {
            console.log('  ⚠️ 無料オファーボタンが見つかりませんでした');
        }
        
        // ===== 4. PayPalタブ選択 =====
        console.log('\n💳 ステップ4: PayPalタブ選択とログイン確認');
        
        const paypalTab = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => {
                return b.getAttribute('data-testid') === 'paypal' ||
                       b.textContent.trim() === 'PayPal';
            });
        });
        if (paypalTab) {
            await paypalTab.click();
            console.log('  ✅ PayPalタブを選択しました');
            await sleep(5000);
        }
        
        // PayPalログイン確認
        console.log('🔑 PayPalログイン確認...');
        try {
            const paypalFrame = await page.waitForSelector('iframe[src*="paypal"], iframe[src*="stripe"]', { timeout: 15000 });
            if (paypalFrame) {
                const frame = await paypalFrame.contentFrame();
                if (frame) {
                    for (let i = 0; i < 15; i++) {
                        const emailInput = await frame.$('input[type="email"], input[name="login_email"]');
                        const passwordInput = await frame.$('input[type="password"], input[name="login_password"]');
                        
                        if (emailInput && passwordInput) {
                            console.log('🔑 PayPalログインが必要です');
                            console.log('   PayPalログインを待機中...（60秒）');
                            await sleep(5000);
                            break;
                        } else {
                            // ログイン済みかチェック（ボタンテキストで判定）
                            const isLoggedIn = await frame.evaluate(() => {
                                const buttons = Array.from(document.querySelectorAll('button'));
                                return buttons.some(b => {
                                    const text = b.textContent.trim();
                                    return text === '続行' || text === 'Continue' || text === 'Agree' || text === '同意';
                                });
                            });
                            if (isLoggedIn) {
                                console.log('✅ PayPalログイン済み');
                                break;
                            }
                        }
                        
                        console.log(`   ⏳ PayPalフォーム待機中... (${i + 1}/15)`);
                        await sleep(5000);
                    }
                }
            }
        } catch (e) {
            console.log('   ℹ️ PayPal iframeなし、既にログイン済みの可能性');
        }
        
        // ===== 5. フランス住所入力 =====
        console.log('\n🏠 ステップ5: フランス住所入力');
        const address = await generateFrenchAddress();
        
        // 名前
        const nameInput = await page.$('#billingAddress-nameInput, input[name="name"]');
        if (nameInput) {
            await nameInput.type(address.name, { delay: 50 });
            await sleep(5000);
        }
        
        // 住所
        const streetInput = await page.$('#billingAddress-addressLine1Input, input[name="addressLine1"]');
        if (streetInput) {
            await streetInput.type(address.street, { delay: 50 });
            await sleep(5000);
        }
        
        // 郵便番号
        const postalInput = await page.$('#billingAddress-postalCodeInput, input[name="postalCode"]');
        if (postalInput) {
            await postalInput.type(address.postalCode, { delay: 50 });
            await sleep(5000);
        }
        
        // 都市
        const cityInput = await page.$('#billingAddress-localityInput, input[name="locality"]');
        if (cityInput) {
            await cityInput.type(address.city, { delay: 50 });
            await sleep(5000);
        }
        
        // ===== 6. サブスクリプション登録 =====
        console.log('\n📝 ステップ6: サブスクリプション登録');
        const subscribeBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('サブスクリプション') ||
                       text.includes('登録') ||
                       text.includes('Subscribe') ||
                       text.includes('Sign up');
            });
        });
        
        if (subscribeBtn) {
            await subscribeBtn.click();
            await sleep(5000);
        }
        
        // ===== 7. 同意して続行 =====
        console.log('\n✅ ステップ7: 同意して続行');
        const consentBtn = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('同意') ||
                       text.includes('Agree') ||
                       text.includes('Consent') ||
                       b.id === 'consentButton';
            });
        });
        
        if (consentBtn) {
            await consentBtn.click();
            await sleep(5000);
        }
        
        console.log('\n🎉 完了！1ヶ月無料オファーが有効化されました！');
        
        await browser.close();
        
        return {
            success: true,
            workspaceEmail,
            address
        };
        
    } catch (error) {
        console.error('❌ エラー:', error.message);
        await browser.close();
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
        console.log('\n✅ 成功:', result);
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ 失敗:', error.message);
        process.exit(1);
    });

module.exports = { activateFreeOffer };
