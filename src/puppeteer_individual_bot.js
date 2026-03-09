/**
 * Puppeteer - ChatGPT個人用アカウント作成（VPN対応版）
 * https://chatgpt.com/auth/login から開始
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Stealthプラグインを詳細に設定
const stealth = StealthPlugin();
stealth.enabledEvasions.delete('chrome.runtime');
stealth.enabledEvasions.delete('iframe.contentWindow');
puppeteer.use(stealth);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// mail.tm API
class MailTMClient {
    constructor() {
        this.baseUrl = 'https://api.mail.tm';
        this.token = null;
        this.email = null;
        this.password = null;
    }

    async createAccount() {
        const domainsRes = await fetch(`${this.baseUrl}/domains`);
        const domains = await domainsRes.json();
        const domain = domains['hydra:member'][0].domain;
        
        this.email = `user${Date.now()}@${domain}`;
        this.password = `Pass${Math.random().toString(36).slice(-8)}!`;
        
        const createRes = await fetch(`${this.baseUrl}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: this.email,
                password: this.password
            })
        });
        
        if (!createRes.ok) {
            throw new Error('mail.tmアカウント作成失敗');
        }
        
        const tokenRes = await fetch(`${this.baseUrl}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: this.email,
                password: this.password
            })
        });
        
        const tokenData = await tokenRes.json();
        this.token = tokenData.token;
        
        console.log(`✅ mail.tm作成: ${this.email}`);
        return { email: this.email, password: this.password };
    }

    async waitForVerificationCode(timeout = 300000, interval = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            await new Promise(resolve => setTimeout(resolve, interval));
            
            const messagesRes = await fetch(`${this.baseUrl}/messages`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            const messages = await messagesRes.json();
            
            if (messages['hydra:member'] && messages['hydra:member'].length > 0) {
                const messageId = messages['hydra:member'][0].id;
                
                const messageRes = await fetch(`${this.baseUrl}/messages/${messageId}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                
                const message = await messageRes.json();
                const codeMatch = message.text.match(/\d{6}/);
                
                if (codeMatch) {
                    console.log(`📧 検証コード: ${codeMatch[0]}`);
                    return codeMatch[0];
                }
            }
        }
        
        throw new Error('検証コード取得タイムアウト');
    }
}

// ランダムな名前生成
function generateName() {
    const firstNames = [
        'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles',
        'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Kenneth', 'Joshua',
        'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Nancy'
    ];
    
    const lastNames = [
        'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
        'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin'
    ];
    
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const middleInitial = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    
    return `${firstName} ${middleInitial}. ${lastName}`;
}

// ランダムな生年月日生成（20歳〜70歳未満）
function generateBirthday() {
    const minYear = 1956;
    const maxYear = 2006;
    const year = Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    
    return {
        month: month.toString().padStart(2, '0'),
        day: day.toString().padStart(2, '0'),
        year: year.toString(),
        age: new Date().getFullYear() - year
    };
}

async function signupIndividual() {
    console.log('🚀 ChatGPT個人用アカウント作成開始（VPN対応版）\n');
    
    // 既存プロファイル設定
    const profilePath = process.env.CHROME_PROFILE_PATH;
    const headlessMode = process.env.HEADLESS === 'true';
    
    // VPN使用時は追加の起動オプション
    const launchOptions = {
        headless: headlessMode,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--window-size=1920,1080',
            '--start-maximized',
            // VPN対策：一般的なUser-Agent
            '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            // メモリ制限を緩和
            '--max_old_space_size=4096',
            // GPU無効化（安定性向上）
            '--disable-gpu',
            // 証明書エラーを無視（VPNの場合ある）
            '--ignore-certificate-errors',
            '--ignore-ssl-errors'
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        // VPN使用時はタイムアウトを長めに
        protocolTimeout: 60000
    };
    
    // 既存プロファイルが指定されている場合は使用
    if (profilePath) {
        launchOptions.userDataDir = profilePath;
        console.log(`📁 既存プロファイルを使用: ${profilePath}`);
    } else {
        console.log('📁 一時プロファイルを使用');
    }
    
    if (headlessMode) {
        console.log('👤 ヘッドレスモード（画面非表示）で実行');
    }
    
    console.log('🔒 VPN対策設定有効\n');
    
    const browser = await puppeteer.launch(launchOptions);
    
    try {
        // 新しいページを作成（既存ページを再利用しない）
        const page = await browser.newPage();
        
        // ブラウザの指紋をVPN対応に設定
        await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
        await page.setJavaScriptEnabled(true);
        
        // WebDriver検出を回避
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP', 'ja', 'en-US', 'en'] });
        });
        
        // Step 1: mail.tmアカウント作成
        console.log('📧 Step 1: mail.tmアカウント作成');
        const mailClient = new MailTMClient();
        const account = await mailClient.createAccount();
        console.log(`   Email: ${account.email}`);
        console.log(`   Pass: ${account.password}`);
        
        // Step 2: ChatGPTログインページへ（VPN対策：リトライ付き）
        console.log('\n🌐 Step 2: ChatGPTログインページへ移動');
        let pageLoadSuccess = false;
        let loadAttempts = 0;
        
        while (!pageLoadSuccess && loadAttempts < 3) {
            try {
                await page.goto('https://chatgpt.com/auth/login', {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000
                });
                
                // ページが完全に読み込まれるまで待機
                await sleep(5000);
                
                // 正しいページにいるか確認
                const url = page.url();
                if (url.includes('auth/login') || url.includes('chatgpt.com')) {
                    pageLoadSuccess = true;
                    console.log(`   ✅ ページ読み込み成功 (${loadAttempts + 1}回目)`);
                }
            } catch (e) {
                loadAttempts++;
                console.log(`   ⚠️ ページ読み込み失敗 (${loadAttempts}回目)、リトライ...`);
                await sleep(3000);
            }
        }
        
        if (!pageLoadSuccess) {
            throw new Error('ページ読み込みに失敗しました');
        }
        
        // Step 3: "Sign up for free" ボタンをクリック
        console.log('\n👆 Step 3: Sign up for free ボタンをクリック');
        await sleep(randomDelay(2000, 4000));
        
        await page.waitForFunction(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.some(b => b.textContent.includes('Sign up for free'));
        }, { timeout: 10000 });
        
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(b => b.textContent.includes('Sign up for free'));
            if (btn) btn.click();
        });
        
        console.log('   ボタンをクリックしました');
        await sleep(randomDelay(4000, 6000));
        
        // URLが変わったか確認（VPN対策）
        const currentUrl = page.url();
        console.log(`   現在のURL: ${currentUrl}`);
        
        // Step 4: メールアドレス入力
        console.log('\n✉️ Step 4: メールアドレス入力');
        
        const emailInput = await page.waitForSelector('input[type="email"], input[name="email"], input[id*="email"]', {
            visible: true,
            timeout: 15000
        });
        
        // 人間らしい動きでクリック
        await emailInput.click();
        await sleep(randomDelay(100, 300));
        
        // ゆっくりと入力
        for (const char of account.email) {
            await emailInput.type(char, { delay: randomDelay(50, 150) });
        }
        console.log(`   メール入力完了: ${account.email}`);
        await sleep(randomDelay(500, 1000));
        
        // Step 5: Continueボタン（VPN対策：慎重に）
        console.log('\n➡️ Step 5: Continueボタン');
        
        // ボタンが有効になるまで待機
        await page.waitForFunction(() => {
            const btn = document.querySelector('button[type="submit"]');
            return btn && !btn.disabled;
        }, { timeout: 10000 });
        
        // ページ遷移を監視しながらクリック
        const [response] = await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
            page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"]');
                if (btn) btn.click();
            })
        ]);
        
        console.log('   Continueボタンをクリックしました');
        await sleep(randomDelay(5000, 7000));
        
        // VPN対策：正しいページに遷移したか確認
        const afterClickUrl = page.url();
        console.log(`   遷移後URL: ${afterClickUrl}`);
        
        // パスワード入力フィールドが表示されるまで待機
        console.log('\n🔑 Step 6: パスワード入力');
        
        try {
            const passwordInput = await page.waitForSelector('input[type="password"], input[name="new-password"], input[id*="password"]', {
                visible: true,
                timeout: 20000
            });
            
            await passwordInput.click();
            await sleep(randomDelay(100, 300));
            
            for (const char of account.password) {
                await passwordInput.type(char, { delay: randomDelay(30, 100) });
            }
            console.log('   パスワード入力完了');
            
        } catch (e) {
            // VPNでリダイレクトされた場合の対処
            console.log('   ⚠️ パスワードフィールドが見つかりません。ページを確認中...');
            
            // 現在のページのスクリーンショットを撮影
            await page.screenshot({ path: 'screenshots/vpn_redirect_check.png' });
            
            const url = page.url();
            if (url === 'https://chatgpt.com/' || url === 'https://chatgpt.com') {
                console.log('   ⚠️ VPN検出のためトップページに戻されました');
                console.log('   🔄 再度ログインページへ移動します');
                
                await page.goto('https://chatgpt.com/auth/login', { waitUntil: 'domcontentloaded' });
                await sleep(5000);
                
                // 再度サインアップフロー開始
                await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const btn = buttons.find(b => b.textContent.includes('Sign up for free'));
                    if (btn) btn.click();
                });
                await sleep(5000);
                
                // メール再入力
                const emailRetry = await page.waitForSelector('input[type="email"]', { timeout: 10000 });
                await emailRetry.click();
                for (const char of account.email) {
                    await emailRetry.type(char, { delay: 50 });
                }
                
                // Continueクリック
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
                    page.evaluate(() => {
                        document.querySelector('button[type="submit"]')?.click();
                    })
                ]);
                
                await sleep(5000);
                
                // パスワード入力再試行
                const passwordRetry = await page.waitForSelector('input[type="password"]', { timeout: 15000 });
                await passwordRetry.click();
                for (const char of account.password) {
                    await passwordRetry.type(char, { delay: 50 });
                }
                console.log('   パスワード入力完了（リトライ後）');
            } else {
                throw e;
            }
        }
        
        await sleep(randomDelay(500, 1000));
        
        // Step 7: Continueボタン
        console.log('\n➡️ Step 7: Continueボタン');
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
            page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"]');
                if (btn) btn.click();
            })
        ]);
        
        console.log('   Continueボタンをクリックしました');
        await sleep(randomDelay(5000, 7000));
        
        // Step 8: 検証コード待機
        console.log('\n⏳ Step 8: 検証コード待機（最大5分）...');
        const verificationCode = await mailClient.waitForVerificationCode();
        
        // Step 9: 検証コード入力
        console.log('\n🔢 Step 9: 検証コード入力');
        const codeInput = await page.waitForSelector('input[type="text"], input[name="code"], input[id*="code"]', {
            visible: true,
            timeout: 15000
        });
        
        await codeInput.click();
        await sleep(randomDelay(100, 300));
        
        for (const char of verificationCode) {
            await codeInput.type(char, { delay: randomDelay(100, 200) });
        }
        console.log(`   コード入力完了: ${verificationCode}`);
        await sleep(randomDelay(500, 1000));
        
        // Step 10: Continueボタン
        console.log('\n➡️ Step 10: Continueボタン');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
            page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"]');
                if (btn) btn.click();
            })
        ]);
        
        console.log('   Continueボタンをクリックしました');
        await sleep(randomDelay(4000, 6000));
        
        // Step 11: 名前入力
        console.log('\n👤 Step 11: 名前入力');
        const fullName = generateName();
        const nameInput = await page.waitForSelector('input[name="name"], input[id*="name"], input[placeholder*="Full name"]', {
            visible: true,
            timeout: 15000
        });
        
        await nameInput.click();
        await sleep(randomDelay(100, 300));
        
        for (const char of fullName) {
            await nameInput.type(char, { delay: randomDelay(50, 150) });
        }
        console.log(`   名前入力完了: ${fullName}`);
        await sleep(randomDelay(500, 1000));
        
        // Step 12: 生年月日入力（ランダム）
        console.log('\n📅 Step 12: 生年月日設定');
        const birthday = generateBirthday();
        
        // 月を入力
        const monthEl = await page.$('[data-type="month"]');
        if (monthEl) {
            await monthEl.click({ clickCount: 3 });
            await sleep(randomDelay(100, 200));
            await monthEl.type(birthday.month, { delay: randomDelay(30, 80) });
            console.log(`   月入力完了: ${birthday.month}`);
            await sleep(randomDelay(300, 500));
        }
        
        // 日を入力
        const dayEl = await page.$('[data-type="day"]');
        if (dayEl) {
            await dayEl.click({ clickCount: 3 });
            await sleep(randomDelay(100, 200));
            await dayEl.type(birthday.day, { delay: randomDelay(30, 80) });
            console.log(`   日入力完了: ${birthday.day}`);
            await sleep(randomDelay(300, 500));
        }
        
        // 年を入力
        const yearEl = await page.$('[data-type="year"]');
        if (yearEl) {
            await yearEl.click({ clickCount: 3 });
            await sleep(randomDelay(100, 200));
            await yearEl.type(birthday.year, { delay: randomDelay(30, 80) });
            console.log(`   年入力完了: ${birthday.year}`);
            await sleep(randomDelay(300, 500));
        }
        
        console.log(`   生年月日入力完了: ${birthday.month}/${birthday.day}/${birthday.year} (${birthday.age}歳)`);
        await sleep(randomDelay(500, 1000));
        
        // Step 13: Finish creating account
        console.log('\n✅ Step 13: Finish creating account');
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
            page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"]');
                if (btn) btn.click();
            })
        ]);
        
        console.log('   Finish creating account ボタンをクリックしました');
        await sleep(randomDelay(5000, 7000));
        
        // スクリーンショット保存
        await page.screenshot({ path: 'screenshots/individual_signup_success.png', fullPage: true });
        console.log('   📸 スクリーンショット保存完了');
        
        console.log('\n✅ サインアップ完了！');
        console.log(`   Email: ${account.email}`);
        console.log(`   Password: ${account.password}`);
        console.log(`   Name: ${fullName}`);
        
        // ブラウザを閉じる
        await sleep(2000);
        await browser.close();
        console.log('   ブラウザを閉じました');
        
    } catch (error) {
        console.error('❌ エラー:', error.message);
        
        // エラー時のスクリーンショット
        try {
            const pages = await browser.pages();
            if (pages.length > 0) {
                await pages[0].screenshot({ path: 'screenshots/individual_signup_error.png', fullPage: true });
            }
        } catch (e) {
            // スクリーンショット失敗は無視
        }
        
        await browser.close();
        throw error;
    }
}

signupIndividual().catch(console.error);
