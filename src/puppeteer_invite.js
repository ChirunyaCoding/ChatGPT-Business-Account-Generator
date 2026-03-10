/**
 * ChatGPT Workspace招待自動化スクリプト
 * 
 * 使用方法:
 *   node puppeteer_invite.js [workspace_email] [workspace_password] [invite_email]
 * 
 * 例:
 *   node puppeteer_invite.js workspace@example.com pass123 invitee@gmail.com
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// axiosがあれば使用、なければfetchを使用
try {
    var axios = require('axios');
} catch (e) {
    console.log('⚠️ axiosが見つかりません、fetchを使用します');
    var axios = null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// mail.tm APIを使って検証コードを取得
async function getVerificationCodeFromEmail(email, password, maxRetries = 10) {
    console.log('📧 メールから検証コードを取得中...');
    
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
            // fetchを使用（Node.js 18+）
            const res = await fetch(url, options);
            return await res.json();
        }
    }
    
    try {
        // 1. ログインまたはアカウント作成
        const domainRes = await httpRequest('https://api.mail.tm/domains');
        const domain = domainRes['hydra:member'][0].domain;
        
        const username = email.split('@')[0];
        
        // アカウント作成を試行（既に存在する場合はエラーになるが無視）
        try {
            await httpRequest('https://api.mail.tm/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: email, password: password })
            });
            console.log('  ✅ メールアカウント作成/確認完了');
        } catch (e) {
            // 既に存在する場合はOK
            console.log('  ℹ️ メールアカウントは既に存在します');
        }
        
        // 2. トークン取得
        const tokenRes = await httpRequest('https://api.mail.tm/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: email, password: password })
        });
        const token = tokenRes.token;
        
        // 3. メッセージをポーリング（最大10回、6秒間隔）
        for (let i = 0; i < maxRetries; i++) {
            console.log(`  ⏳ メール到達待機... (${i + 1}/${maxRetries})`);
            await sleep(10000);
            
            const messagesRes = await httpRequest('https://api.mail.tm/messages', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const messages = messagesRes['hydra:member'];
            
            // ChatGPT/OpenAIからのメールを探す
            for (const msg of messages) {
                if (msg.from.address.includes('openai.com') || 
                    msg.from.address.includes('chatgpt.com') ||
                    msg.subject.includes('ChatGPT') ||
                    msg.subject.includes('verification') ||
                    msg.subject.includes('コード')) {
                    
                    // メール本文を取得
                    const messageRes = await httpRequest(
                        `https://api.mail.tm/messages/${msg.id}`,
                        { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    
                    const content = messageRes.text || messageRes.html;
                    
                    // 6桁の検証コードを抽出
                    const codeMatch = content.match(/\b\d{6}\b/);
                    if (codeMatch) {
                        console.log(`  ✅ 検証コード取得: ${codeMatch[0]}`);
                        return codeMatch[0];
                    }
                }
            }
        }
        
        console.log('  ⚠️ 検証コードが見つかりませんでした');
        return null;
        
    } catch (error) {
        console.error('  ❌ メール取得エラー:', error.message);
        return null;
    }
}

// エラーメッセージをチェック
async function checkForError(page) {
    try {
        const errorElement = await page.$('span._root_xeddl_1, .error-message, [data-testid="error-message"]');
        if (errorElement) {
            const errorText = await page.evaluate(el => el.textContent, errorElement);
            if (errorText && (errorText.includes('不明なエラー') || errorText.includes('エラー'))) {
                console.log(`  ⚠️ エラー検出: ${errorText}`);
                return true;
            }
        }
    } catch (e) {
        // 無視
    }
    return false;
}

// 「もう一度試す」ボタンをクリック
async function clickRetryButton(page) {
    try {
        const retryBtn = await page.$('button[data-dd-action-name="Try again"], button:has-text("もう一度試す"), button:has-text("Try again")');
        if (retryBtn) {
            console.log('  🔄 「もう一度試す」ボタンをクリック');
            await retryBtn.click();
            await sleep(10000);
            return true;
        }
    } catch (e) {
        // 無視
    }
    return false;
}

// 要素を待機（15回リトライ、10秒間隔、エラーチェック付き）
async function waitForElement(page, selector, options = {}) {
    const maxRetries = options.maxRetries || 15;
    const interval = options.interval || 10000; // 10秒
    const timeoutMsg = options.timeoutMsg || '要素が見つかりません';
    
    for (let i = 0; i < maxRetries; i++) {
        // エラーチェック
        if (await checkForError(page)) {
            const retried = await clickRetryButton(page);
            if (retried) {
                console.log('  🔄 リトライ後、要素を再検索...');
                continue; // リトライして要素を再検索
            }
        }
        
        try {
            const element = await page.$(selector);
            if (element) {
                console.log(`  ✅ 要素検出成功 (${i + 1}回目): ${selector}`);
                return element;
            }
        } catch (e) {
            // 無視してリトライ
        }
        
        console.log(`  ⏳ 待機中... (${i + 1}/${maxRetries}回目): ${selector}`);
        await sleep(interval);
    }
    
    throw new Error(`${timeoutMsg} (セレクタ: ${selector})`);
}

// 複数セレクタで要素を待機（どれか一つが見つかるまで、エラーチェック付き）
async function waitForElementAny(page, selectors, options = {}) {
    const maxRetries = options.maxRetries || 15;
    const interval = options.interval || 10000;
    
    for (let i = 0; i < maxRetries; i++) {
        // エラーチェック
        if (await checkForError(page)) {
            const retried = await clickRetryButton(page);
            if (retried) {
                console.log('  🔄 リトライ後、要素を再検索...');
                continue;
            }
        }
        
        for (const selector of selectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    console.log(`  ✅ 要素検出成功 (${i + 1}回目): ${selector}`);
                    return element;
                }
            } catch (e) {
                // 無視
            }
        }
        
        console.log(`  ⏳ 待機中... (${i + 1}/${maxRetries}回目)`);
        await sleep(interval);
    }
    
    throw new Error(`いずれの要素も見つかりませんでした: ${selectors.join(', ')}`);
}

// ブラウザパス検出
function detectBrowserPaths() {
    const isMac = process.platform === 'darwin';
    const paths = { brave: null, chrome: null };
    
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

// メイン処理
async function inviteToWorkspace(workspaceEmail, workspacePassword, inviteEmail) {
    console.log('🚀 ChatGPT招待自動化を開始します...\n');
    
    const browserPaths = detectBrowserPaths();
    const browserType = browserPaths.brave ? 'brave' : (browserPaths.chrome ? 'chrome' : null);
    
    if (!browserType) {
        throw new Error('使用可能なブラウザが見つかりません');
    }
    
    const executablePath = browserPaths[browserType];
    console.log(`🌐 ${browserType.toUpperCase()} を起動します...`);
    
    // 専用プロファイル（別セッション）
    const userDataDir = path.join(__dirname, '..', '.invite_profile');
    
    const browser = await puppeteer.launch({
        headless: process.env.HEADLESS === 'true', // falseなら画面表示あり
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
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // 1. ChatGPTログインページへ
        console.log('🌐 ChatGPTにアクセス中...');
        await page.goto('https://chatgpt.com/auth/login', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        await sleep(10000);
        
        // 2. ログインボタンまたは「その他のオプション」ボタンをクリック（15回リトライ）
        console.log('🔘 ログインボタンまたは「その他のオプション」を待機・クリック...');
        
        // まずログインボタンを探す
        let loginButtonFound = false;
        try {
            const loginButton = await waitForElementAny(page, [
                'button[data-testid="login-button"]',
                'button:has-text("ログイン")',
                'button:has-text("Log in")',
                'button.btn-primary'
            ], { maxRetries: 3, interval: 3000 });
            await loginButton.click();
            loginButtonFound = true;
            console.log('  ✅ 「ログイン」ボタンをクリックしました');
        } catch (e) {
            console.log('  ℹ️ ログインボタンが見つかりません、「その他のオプション」を探します...');
        }
        
        // ログインボタンがない場合は「その他のオプション」を探す
        if (!loginButtonFound) {
            try {
                const otherOptionsButton = await waitForElementAny(page, [
                    'button:has-text("その他のオプション")',
                    'button:has-text("その他")',
                    'button:has-text("Other options")',
                    'button:has-text("Other")',
                    'button[aria-expanded]',
                    'button svg use[href*="ba3792"]'
                ], { maxRetries: 15, interval: 10000 });
                await otherOptionsButton.click();
                console.log('  ✅ 「その他のオプション」をクリックしました');
            } catch (e) {
                // フォールバック：テキストで検索
                console.log('  ⚠️ セレクタ検出失敗、テキスト検索でフォールバック...');
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const btn = buttons.find(b => 
                        b.textContent.includes('その他のオプション') || 
                        b.textContent.includes('その他') ||
                        b.textContent.includes('Other options') ||
                        b.textContent.includes('Other')
                    );
                    if (btn) btn.click();
                });
                console.log('  ✅ 「その他のオプション」をクリックしました（フォールバック）');
            }
        }
        
        await sleep(5000);
        
        // 3. メールアドレス入力欄を待機・入力（15回リトライ）
        console.log('✉️ メールアドレス入力欄を待機...');
        const emailInput = await waitForElementAny(page, [
            'input[type="email"]',
            'input[name="email"]',
            'input[id*="email"]',
            'input[placeholder*="メール"]',
            'input[placeholder*="email"]',
            'input._input_1kwl2_1'
        ], { maxRetries: 15, interval: 10000, timeoutMsg: 'メール入力欄が見つかりません' });
        await emailInput.type(workspaceEmail, { delay: 50 });
        
        await sleep(10000);
        
        // 4. 「続行」ボタンをクリック（15回リトライ）
        console.log('🔘 「続行」ボタンを待機・クリック...');
        try {
            const continueBtn = await waitForElementAny(page, [
                'button[type="submit"]',
                'button._root_3rdp0_62',
                'button:has-text("続行")',
                'button:has-text("Continue")',
                'button:has-text("Next")'
            ], { maxRetries: 15, interval: 10000, timeoutMsg: '続行ボタンが見つかりません' });
            await continueBtn.click();
            await sleep(10000); // 10秒待機
        } catch (e) {
            // フォールバック
            console.log('  ⚠️ セレクタ検出失敗、テキスト検索でフォールバック...');
            const continueButtons = await page.$$('button');
            for (const btn of continueButtons) {
                const text = await page.evaluate(el => el.textContent, btn);
                if (text.includes('続行') || text.includes('Continue') || text.includes('Next')) {
                    await btn.click();
                    break;
                }
            }
            await sleep(10000); // 10秒待機
        }
        
        await sleep(10000);
        
        // 5. パスワード入力 OR 検証コード入力（15回リトライ、両方同時チェック）
        console.log('🔑 パスワード入力欄または検証コード入力欄を待機...');
        
        let authType = null; // 'password' or 'code'
        let authInput = null;
        
        for (let i = 0; i < 15; i++) {
            // 両方の要素を同時にチェック
            const [passwordEl, codeEl] = await Promise.all([
                page.$('input[type="password"], input[name="password"], input[id*="password"], input[placeholder*="パスワード"], input[placeholder*="password"]').catch(() => null),
                page.$('input[type="text"][maxlength="6"], input[autocomplete="one-time-code"], input[placeholder*="コード"], input[placeholder*="code"], input#_r_j_-code').catch(() => null)
            ]);
            
            if (codeEl) {
                authType = 'code';
                authInput = codeEl;
                console.log(`  ✅ 検証コード入力欄を検出 (${i + 1}回目)`);
                break;
            }
            
            if (passwordEl) {
                authType = 'password';
                authInput = passwordEl;
                console.log(`  ✅ パスワード入力欄を検出 (${i + 1}回目)`);
                break;
            }
            
            console.log(`  ⏳ 待機中... (${i + 1}/15回目): パスワードまたは検証コード入力欄`);
            await sleep(10000);
        }
        
        if (!authInput) {
            throw new Error('パスワード入力欄も検証コード入力欄も見つかりません');
        }
        
        // 認証タイプに応じた処理
        if (authType === 'password') {
            console.log('🔑 パスワードを入力...');
            await authInput.type(workspacePassword, { delay: 50 });
            await sleep(10000); // 10秒待機
        } else {
            console.log('📱 検証コード（Magic Link）検出 - パスワード入力をスキップ');
            console.log('   メールから検証コードを自動取得します...');
            
            // メールから検証コードを自動取得
            const verificationCode = await getVerificationCodeFromEmail(
                workspaceEmail, 
                workspacePassword
            );
            
            if (verificationCode) {
                console.log(`   ✅ 検証コードを自動入力: ${verificationCode}`);
                await authInput.type(verificationCode, { delay: 100 });
                await sleep(10000); // 10秒待機
            } else {
                console.log('   ⚠️ 検証コードの自動取得に失敗');
                console.log('   手動で検証コードを入力してください（60秒待機）...');
                
                // 手動入力を待機（60秒）
                for (let i = 0; i < 6; i++) {
                    await sleep(10000); // 10秒待機
                    const codeValue = await page.evaluate(el => el.value, authInput);
                    if (codeValue && codeValue.length === 6) {
                        console.log(`   ✅ 検証コードが入力されました: ${codeValue}`);
                        break;
                    }
                    console.log(`   ⏳ 手動入力待機中... (${(i + 1) * 10}/60秒)`);
                }
            }
        }
        
        // 6. 「続行」ボタンをクリック（ログイン）（15回リトライ）
        // 検証コードの場合は既にここまで進んでいる可能性があるのでスキップも考慮
        if (authType === 'code') {
            console.log('🔘 検証コード用の続行ボタンを待機・クリック...');
        } else {
            console.log('🔘 ログインボタンを待機・クリック...');
        }
        
        try {
            const loginBtn = await waitForElementAny(page, [
                'button[type="submit"]',
                'button._root_3rdp0_62',
                'button:has-text("続行")',
                'button:has-text("Continue")',
                'button:has-text("ログイン")',
                'button:has-text("Log in")',
                'button:has-text("Verify")',
                'button:has-text("確認")'
            ], { maxRetries: 15, interval: 10000, timeoutMsg: 'ログインボタンが見つかりません' });
            await loginBtn.click();
            await sleep(10000); // 10秒待機
        } catch (e) {
            // フォールバック
            console.log('  ⚠️ セレクタ検出失敗、テキスト検索でフォールバック...');
            const loginBtns = await page.$$('button');
            for (const btn of loginBtns) {
                const text = await page.evaluate(el => el.textContent, btn);
                if (text.includes('続行') || text.includes('Continue') || text.includes('ログイン') || text.includes('Verify')) {
                    await btn.click();
                    break;
                }
            }
            await sleep(10000); // 10秒待機
        }
        
        console.log('⏳ ログイン処理中...');
        await sleep(10000);
        
        // エラーチェック
        if (await checkForError(page)) {
            console.log('⚠️ ログイン後にエラーが検出されました');
            const retried = await clickRetryButton(page);
            if (retried) {
                console.log('🔄 リトライ後、3秒待機...');
                await sleep(10000);
            }
        }
        
        // 7. Workspace選択（複数ある場合）（15回リトライ）
        console.log('🔍 Workspace選択画面を確認...');
        try {
            const workspaceBtn = await waitForElementAny(page, [
                'button[name="workspace_id"]',
                'button:has-text("のワークスペース")',
                'button._root_l0v7g_1',
                '[data-testid="workspace-button"]'
            ], { maxRetries: 15, interval: 10000 });
            
            console.log('🔘 Workspaceを選択...');
            await workspaceBtn.click();
            await sleep(10000); // 10秒待機
        } catch (e) {
            // Workspace選択画面がない場合はスキップ
            console.log('ℹ️ Workspace選択スキップ（既に選択済みまたは単一Workspace）');
        }
        
        // 9. /admin/members ページへ移動
        console.log('🌐 Step 9: /admin/members ページへ移動...');
        await page.goto('https://chatgpt.com/admin/members', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        await sleep(5000);
        console.log('  ✅ /admin/members に到達しました');
        
        // 10. 「メンバーを招待する」ボタンをクリック
        console.log('🔘 Step 10: 「メンバーを招待する」ボタンをクリック...');
        const inviteBtn = await waitForElementAny(page, [
            'button:has-text("メンバーを招待する")',
            'button:has-text("メンバーを招待")',
            'button:has-text("Invite members")',
            'button:has-text("Invite")',
            'button svg use[href*="6be74c"]'
        ], { maxRetries: 15, interval: 10000, timeoutMsg: '「メンバーを招待する」ボタンが見つかりません' });
        
        await inviteBtn.click();
        console.log('  ✅ 「メンバーを招待する」をクリックしました');
        await sleep(3000);
        
        // 11. メールアドレス入力欄が表示されるのを待つ
        console.log('⏳ Step 11: メールアドレス入力欄を待機...');
        await waitForElementAny(page, [
            'input[type="email"]',
            'input[placeholder*="メールアドレス"]',
            'input[placeholder*="email"]',
            'input.rounded-full'
        ], { maxRetries: 15, interval: 10000, timeoutMsg: 'メールアドレス入力欄が見つかりません' });
        console.log('  ✅ メールアドレス入力欄が表示されました');
        
        // 12. 「さらに追加する」ボタン（複数人招待時）
        console.log('🔘 Step 12: 「さらに追加する」を確認...');
        try {
            const addMoreBtn = await waitForElementAny(page, [
                'button:has-text("さらに追加")',
                'button:has-text("Add more")',
                'button:has-text("追加")',
                'button:has-text("Add")',
                'button._root_3rdp0_62'
            ], { maxRetries: 15, interval: 10000 });
            
            await addMoreBtn.click();
            await sleep(10000); // 10秒待機
        } catch (e) {
            console.log('  ℹ️ 「さらに追加する」ボタンなし（既に入力欄あり）');
        }
        
        // 12. メールアドレス入力（15回リトライ）
        console.log(`✉️ Step 12: 招待メールアドレス入力: ${inviteEmail}`);
        try {
            const emailInput = await waitForElementAny(page, [
                'input[type="email"]',
                'input[placeholder*="メール"]',
                'input[placeholder*="email"]',
                'input[placeholder*="Email"]',
                'input.rounded-full'
            ], { maxRetries: 15, interval: 10000, timeoutMsg: '招待メール入力欄が見つかりません' });
            
            await emailInput.type(inviteEmail, { delay: 50 });
            await sleep(10000); // 10秒待機
        } catch (e) {
            // フォールバック
            console.log('  ⚠️ セレクタ検出失敗、直接DOM操作でフォールバック...');
            await page.evaluate((email) => {
                const inputs = document.querySelectorAll('input[type="email"], input[placeholder*="メール"], input[placeholder*="email"]');
                if (inputs.length > 0) {
                    inputs[0].value = email;
                    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
                    inputs[0].dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, inviteEmail);
            await sleep(10000); // 10秒待機
        }
        
        // 13. 「招待を送信する」ボタンをクリック（15回リトライ）
        console.log('🔘 Step 13: 「招待を送信する」ボタンを待機・クリック...');
        try {
            const sendBtn = await waitForElementAny(page, [
                'button:has-text("招待を送信")',
                'button:has-text("Send invite")',
                'button:has-text("送信")',
                'button:has-text("Send")',
                'button.btn-primary',
                'button[type="submit"]'
            ], { maxRetries: 15, interval: 10000, timeoutMsg: '送信ボタンが見つかりません' });
            
            await sendBtn.click();
        } catch (e) {
            // フォールバック
            console.log('  ⚠️ セレクタ検出失敗、テキスト検索でフォールバック...');
            const sendButtons = await page.$$('button');
            let sent = false;
            
            for (const btn of sendButtons) {
                const text = await page.evaluate(el => el.textContent, btn);
                if (text.includes('招待を送信') || text.includes('Send invite') || text.includes('送信')) {
                    await btn.click();
                    sent = true;
                    break;
                }
            }
            
            if (!sent) {
                throw new Error('送信ボタンが見つかりません');
            }
        }
        
        console.log('⏳ 送信中...');
        await sleep(10000);
        
        // エラーチェック（送信後）
        if (await checkForError(page)) {
            console.log('⚠️ 送信後にエラーが検出されました');
            const retried = await clickRetryButton(page);
            if (retried) {
                console.log('🔄 リトライ後、再度3秒待機...');
                await sleep(10000);
                
                // 再度エラーチェック
                if (await checkForError(page)) {
                    throw new Error('リトライ後もエラーが続いています');
                }
            } else {
                throw new Error('「もう一度試す」ボタンが見つかりません');
            }
        }
        
        // 14. 成功確認
        console.log('✅ Step 14: 招待送信完了！');
        
        // スクリーンショット保存（デバッグ用）
        await page.screenshot({ 
            path: path.join(__dirname, '..', 'screenshots', `invite_success_${Date.now()}.png`),
            fullPage: true 
        });
        
        await browser.close();
        
        return {
            success: true,
            workspaceEmail: workspaceEmail,
            inviteEmail: inviteEmail,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('❌ エラー:', error.message);
        
        // エラー時のスクリーンショット
        try {
            const pages = await browser.pages();
            if (pages.length > 0) {
                await pages[0].screenshot({ 
                    path: path.join(__dirname, '..', 'screenshots', `invite_error_${Date.now()}.png`),
                    fullPage: true 
                });
            }
        } catch (e) {}
        
        await browser.close();
        throw error;
    }
}

// 設定ファイルからアカウント情報を読み込み
function loadAccounts() {
    const configPath = path.join(__dirname, '..', '.workspace_accounts.json');
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) {
        console.error('設定ファイル読み込みエラー:', e.message);
    }
    return { accounts: [], default_account: null };
}

function getAccount(name = null) {
    const config = loadAccounts();
    const accountName = name || config.default_account;
    
    if (!accountName) return null;
    
    const account = config.accounts.find(a => a.name === accountName);
    return account || null;
}

// コマンドライン引数から実行
const args = process.argv.slice(2);

let workspaceEmail, workspacePassword, inviteEmail, accountName;

if (args.length >= 3) {
    // 全て明示的に指定
    [workspaceEmail, workspacePassword, inviteEmail] = args;
} else if (args.length === 2) {
    // アカウント名 + 招待先メール
    accountName = args[0];
    inviteEmail = args[1];
    const account = getAccount(accountName);
    
    if (!account) {
        console.error(`❌ アカウント「${accountName}」が見つかりません`);
        console.log('使用可能なアカウント:');
        const config = loadAccounts();
        config.accounts.forEach(a => console.log(`  - ${a.name}: ${a.email}`));
        process.exit(1);
    }
    
    workspaceEmail = account.email;
    workspacePassword = account.password;
    console.log(`✅ アカウント「${accountName}」を使用: ${workspaceEmail}`);
} else if (args.length === 1) {
    // 招待先メールのみ（デフォルトアカウント使用）
    inviteEmail = args[0];
    const account = getAccount();
    
    if (!account) {
        console.error('❌ デフォルトアカウントが設定されていません');
        console.log('.workspace_accounts.json を作成してください');
        process.exit(1);
    }
    
    workspaceEmail = account.email;
    workspacePassword = account.password;
    console.log(`✅ デフォルトアカウントを使用: ${workspaceEmail}`);
} else {
    console.log('使用方法:');
    console.log('  node puppeteer_invite.js [workspace_email] [workspace_password] [invite_email]');
    console.log('  node puppeteer_invite.js [account_name] [invite_email]');
    console.log('  node puppeteer_invite.js [invite_email]（デフォルトアカウント使用）');
    console.log('');
    console.log('例:');
    console.log('  node puppeteer_invite.js admin@example.com pass123 user@gmail.com');
    console.log('  node puppeteer_invite.js default user@gmail.com');
    console.log('  node puppeteer_invite.js user@gmail.com');
    console.log('');
    console.log('登録済みアカウント:');
    const config = loadAccounts();
    config.accounts.forEach(a => console.log(`  - ${a.name}: ${a.email}`));
    process.exit(1);
}

inviteToWorkspace(workspaceEmail, workspacePassword, inviteEmail)
    .then(result => {
        console.log('\n🎉 招待成功:', JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ 招待失敗:', error.message);
        process.exit(1);
    });

// モジュールとしてもエクスポート
module.exports = { inviteToWorkspace };
