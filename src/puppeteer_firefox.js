/**
 * Puppeteer Firefox版 - ChatGPT個人用アカウント作成（VPN対応版）
 * https://chatgpt.com/auth/login から開始
 */

const puppeteer = require('puppeteer');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Firefoxパスを検出
function detectFirefoxPath() {
    // 環境変数から取得
    if (process.env.FIREFOX_PATH) {
        return process.env.FIREFOX_PATH;
    }
    
    // macOSの一般的なパス
    const macPaths = [
        '/Applications/Firefox.app/Contents/MacOS/firefox',
        '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox',
        '/Applications/Firefox Nightly.app/Contents/MacOS/firefox'
    ];
    
    // ファイルが存在するか確認
    const fs = require('fs');
    for (const path of macPaths) {
        if (fs.existsSync(path)) {
            console.log(`✅ Firefox検出: ${path}`);
            return path;
        }
    }
    
    // デフォルトを返す（存在しない場合は後でエラー）
    return '/Applications/Firefox.app/Contents/MacOS/firefox';
}

const FIREFOX_PATH = detectFirefoxPath();

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

async function signupIndividualFirefox() {
    console.log('🦊 FirefoxでChatGPT個人用アカウント作成開始\n');
    
    // Firefoxが存在するか確認
    const fs = require('fs');
    if (!fs.existsSync(FIREFOX_PATH)) {
        console.error(`❌ Firefoxが見つかりません: ${FIREFOX_PATH}`);
        console.log('💡 以下を確認してください:');
        console.log('   1. Firefoxがインストールされているか');
        console.log('   2. .envファイルのFIREFOX_PATHが正しいか');
        console.log('');
        console.log('📝 インストール方法:');
        console.log('   brew install firefox');
        console.log('   または https://www.mozilla.org/firefox/ からダウンロード');
        throw new Error('Firefoxが見つかりません');
    }
    
    console.log(`✅ Firefox確認: ${FIREFOX_PATH}`);
    
    // プロファイル設定
    const profilePath = process.env.FIREFOX_PROFILE_PATH;
    const headlessMode = process.env.HEADLESS === 'true';
    
    const launchOptions = {
        product: 'firefox',
        headless: headlessMode,
        executablePath: FIREFOX_PATH,
        args: [
            '--width=1920',
            '--height=1080',
            '--no-remote'
        ],
        slowMo: 50,
        timeout: 120000,  // 起動タイムアウト: 120秒
        protocolTimeout: 120000,
        dumpio: true  // デバッグ出力有効化
    };
    
    // 既存プロファイルが指定されている場合
    if (profilePath) {
        launchOptions.args.push(`--profile`, profilePath);
        console.log(`📁 既存Firefoxプロファイルを使用: ${profilePath}`);
    } else {
        console.log('📁 一時Firefoxプロファイルを使用');
    }
    
    if (headlessMode) {
        console.log('👤 ヘッドレスモード（画面非表示）で実行');
    }
    
    console.log('🔒 VPN対策設定有効\n');
    
    let browser;
    try {
        console.log('⏳ Firefoxを起動中... (最大120秒)');
        browser = await puppeteer.launch(launchOptions);
        console.log('✅ Firefox起動成功');
    } catch (e) {
        console.error('❌ Firefox起動エラー:', e.message);
        
        if (e.message.includes('Timed out')) {
            console.log('');
            console.log('⚠️ 起動がタイムアウトしました。以下を試してください:');
            console.log('   1. Firefoxを手動で起動してから閉じる');
            console.log('   2. 既存のFirefoxプロセスを終了する');
            console.log('   3. コンピューターを再起動する');
            console.log('');
            console.log('📝 既存プロセスを確認:');
            console.log('   ps aux | grep firefox');
            console.log('   killall firefox');
        }
        
        throw new Error(`Firefox起動失敗: ${e.message}`);
    }
    
    try {
        // 新しいページを作成
        const page = await browser.newPage();
        
        // ビューポート設定
        await page.setViewport({ width: 1920, height: 1080 });
        await page.setJavaScriptEnabled(true);
        
        // Step 1: mail.tmアカウント作成
        console.log('📧 Step 1: mail.tmアカウント作成');
        const mailClient = new MailTMClient();
        const account = await mailClient.createAccount();
        console.log(`   Email: ${account.email}`);
        console.log(`   Pass: ${account.password}`);
        
        // Step 2: ChatGPTログインページへ
        console.log('\n🌐 Step 2: ChatGPTログインページへ移動');
        
        try {
            await page.goto('https://chatgpt.com/auth/login', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });
            await sleep(5000);
            console.log('   ✅ ページ読み込み成功');
        } catch (e) {
            console.log('   ⚠️ ページ読み込み警告:', e.message);
        }
        
        // Step 3: "Sign up for free" ボタン
        console.log('\n👆 Step 3: Sign up for free ボタン');
        await sleep(randomDelay(2000, 4000));
        
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(b => b.textContent.includes('Sign up for free'));
            if (btn) btn.click();
        });
        
        console.log('   ボタンをクリックしました');
        await sleep(randomDelay(4000, 6000));
        
        // Step 4: メールアドレス入力
        console.log('\n✉️ Step 4: メールアドレス入力');
        
        const emailInput = await page.waitForSelector('input[type="email"], input[name="email"]', {
            visible: true,
            timeout: 15000
        });
        
        await emailInput.click();
        await sleep(randomDelay(100, 300));
        
        for (const char of account.email) {
            await emailInput.type(char, { delay: randomDelay(50, 150) });
        }
        console.log(`   メール入力完了: ${account.email}`);
        await sleep(randomDelay(500, 1000));
        
        // Step 5: Continueボタン
        console.log('\n➡️ Step 5: Continueボタン');
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
            page.evaluate(() => {
                const btn = document.querySelector('button[type="submit"]');
                if (btn) btn.click();
            })
        ]);
        
        console.log('   Continueボタンをクリックしました');
        await sleep(randomDelay(5000, 7000));
        
        // Step 6: パスワード入力
        console.log('\n🔑 Step 6: パスワード入力');
        
        const passwordInput = await page.waitForSelector('input[type="password"], input[name="new-password"]', {
            visible: true,
            timeout: 15000
        });
        
        await passwordInput.click();
        await sleep(randomDelay(100, 300));
        
        for (const char of account.password) {
            await passwordInput.type(char, { delay: randomDelay(30, 100) });
        }
        console.log('   パスワード入力完了');
        await sleep(randomDelay(500, 1000));
        
        // Step 7: Continueボタン
        console.log('\n➡️ Step 7: Continueボタン');
        
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
            page.evaluate(() => {
                document.querySelector('button[type="submit"]')?.click();
            })
        ]);
        
        await sleep(randomDelay(5000, 7000));
        
        // Step 8: 検証コード待機
        console.log('\n⏳ Step 8: 検証コード待機（最大5分）...');
        const verificationCode = await mailClient.waitForVerificationCode();
        
        // Step 9: 検証コード入力
        console.log('\n🔢 Step 9: 検証コード入力');
        const codeInput = await page.waitForSelector('input[type="text"], input[name="code"]', {
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
                document.querySelector('button[type="submit"]')?.click();
            })
        ]);
        
        await sleep(randomDelay(4000, 6000));
        
        // Step 11: 名前入力
        console.log('\n👤 Step 11: 名前入力');
        const fullName = generateName();
        const nameInput = await page.waitForSelector('input[name="name"], input[placeholder*="Full name"]', {
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
        
        // Step 12: 生年月日入力
        console.log('\n📅 Step 12: 生年月日設定');
        const birthday = generateBirthday();
        
        const monthEl = await page.$('[data-type="month"]');
        if (monthEl) {
            await monthEl.click({ clickCount: 3 });
            await sleep(randomDelay(100, 200));
            await monthEl.type(birthday.month, { delay: randomDelay(30, 80) });
            console.log(`   月入力完了: ${birthday.month}`);
            await sleep(randomDelay(300, 500));
        }
        
        const dayEl = await page.$('[data-type="day"]');
        if (dayEl) {
            await dayEl.click({ clickCount: 3 });
            await sleep(randomDelay(100, 200));
            await dayEl.type(birthday.day, { delay: randomDelay(30, 80) });
            console.log(`   日入力完了: ${birthday.day}`);
            await sleep(randomDelay(300, 500));
        }
        
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
                document.querySelector('button[type="submit"]')?.click();
            })
        ]);
        
        await sleep(randomDelay(5000, 7000));
        
        // スクリーンショット
        await page.screenshot({ path: 'screenshots/firefox_signup_success.png', fullPage: true });
        console.log('   📸 スクリーンショット保存完了');
        
        console.log('\n✅ サインアップ完了！');
        console.log(`   Email: ${account.email}`);
        console.log(`   Password: ${account.password}`);
        console.log(`   Name: ${fullName}`);
        
        await sleep(2000);
        await browser.close();
        console.log('   Firefoxを閉じました');
        
    } catch (error) {
        console.error('❌ エラー:', error.message);
        
        try {
            const pages = await browser.pages();
            if (pages.length > 0) {
                await pages[0].screenshot({ path: 'screenshots/firefox_signup_error.png' });
            }
        } catch (e) {}
        
        await browser.close();
        throw error;
    }
}

signupIndividualFirefox().catch(console.error);
