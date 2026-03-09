/**
 * Puppeteer Simple Workspace - ChatGPTワークスペース作成（シンプル版）
 * https://chatgpt.com/create-free-workspace
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
        
        const username = `ws${Date.now().toString(36)}${Math.random().toString(36).slice(-4)}`;
        this.email = `${username}@${domain}`;
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
        return { email: this.email, password: this.password, username };
    }
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

// ブラウザ起動
async function launchBrowser(browserType, browserPath) {
    const headlessMode = process.env.HEADLESS === 'true';
    
    const options = {
        headless: headlessMode,
        executablePath: browserPath,
        slowMo: 50,
        timeout: 120000,
        args: [
            '--width=1920',
            '--height=1080',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ]
    };
    
    console.log(`${browserType === 'brave' ? '🦁 Brave' : '🌐 Chrome'}を起動中...`);
    return await puppeteer.launch({
        ...options,
        ignoreDefaultArgs: ['--enable-automation']
    });
}

// メイン処理
async function createWorkspace() {
    console.log('🚀 ChatGPTワークスペース作成を開始\n');
    
    // メールアドレス生成
    console.log('📧 Step 1: メールアドレスを生成');
    const mailClient = new MailTMClient();
    const account = await mailClient.createAccount();
    const username = account.email.split('@')[0];
    console.log(`   Email: ${account.email}`);
    console.log(`   Password: ${account.password}`);
    console.log(`   Username: ${username}\n`);
    
    // ブラウザ検出
    const browserPaths = detectBrowserPaths();
    let browserType = 'chrome';
    let browserPath = browserPaths.chrome;
    
    if (browserPaths.brave) {
        browserType = 'brave';
        browserPath = browserPaths.brave;
    }
    
    if (!browserPath) {
        throw new Error('ブラウザが見つかりません。BraveまたはChromeをインストールしてください。');
    }
    
    // ブラウザ起動
    const browser = await launchBrowser(browserType, browserPath);
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // ワークスペース作成ページへ
        console.log('🌐 Step 2: ワークスペース作成ページへ移動');
        await page.goto('https://chatgpt.com/create-free-workspace', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await sleep(3000);
        console.log('   ✅ ページ読み込み成功\n');
        
        // ワークスペース名入力
        console.log('✏️ Step 3: ワークスペース名を入力');
        const nameInput = await page.waitForSelector('input[name="workspace-name"]', {
            visible: true,
            timeout: 15000
        });
        
        await nameInput.click();
        await sleep(randomDelay(100, 300));
        await nameInput.type(username, { delay: 0 });
        console.log(`   入力完了: ${username}\n`);
        await sleep(randomDelay(500, 1000));
        
        // 「続ける」ボタンをクリック
        console.log('👆 Step 4: 「続ける」ボタンをクリック');
        
        // ボタンを探してクリック
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const continueBtn = buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('続ける') || 
                       text.includes('Continue') ||
                       text.includes('Next') ||
                       text.includes('次へ');
            });
            if (continueBtn) continueBtn.click();
        });
        
        console.log('   ✅ クリック完了\n');
        await sleep(randomDelay(3000, 5000));
        
        // 完了
        console.log('✅ ワークスペース作成フローを開始しました');
        console.log('\n📋 アカウント情報:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📧 Email:    ${account.email}`);
        console.log(`🔑 Password: ${account.password}`);
        console.log(`🏢 Workspace: ${username}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // ブラウザは開いたまま（手動で続行）
        console.log('⏳ ブラウザは開いたままです。');
        console.log('   手動でメール確認などの手続きを完了してください。');
        
        // 30秒待機してから終了（または手動で閉じるまで）
        await sleep(30000);
        
        return {
            email: account.email,
            password: account.password,
            workspace: username,
            browser: browserType
        };
        
    } catch (error) {
        console.error('\n❌ エラー:', error.message);
        throw error;
    } finally {
        // ブラウザを閉じる
        await browser.close();
        console.log('\n👋 ブラウザを閉じました');
    }
}

// 実行
createWorkspace()
    .then(result => {
        console.log('\n🎉 完了!');
        console.log(`Email: ${result.email}`);
        console.log(`Password: ${result.password}`);
        process.exit(0);
    })
    .catch(error => {
        console.error('\n💥 失敗:', error.message);
        process.exit(1);
    });
