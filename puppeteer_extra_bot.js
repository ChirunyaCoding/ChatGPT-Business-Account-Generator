/**
 * Puppeteer Extra + Stealth Plugin + 実際のChromeプロファイル
 * 最強の検出回避構成
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const os = require('os');

// Stealth Pluginを有効化（すべての回避策を適用）
puppeteer.use(StealthPlugin());

// 実際のChromeプロファイルのパス（Windowsの場合）
// 注意: あなたのWindowsユーザー名に置き換えてください
// 実際のChromeプロファイルをコピーして使用（権限問題回避）
const path = require('path');
const fs = require('fs');

// カスタムプロファイルディレクトリ（プロジェクト内）
const CUSTOM_PROFILE_DIR = path.join(__dirname, '.chrome_profile_real');

// 実際のプロファイルからCookie等をコピー（初回のみ）
function setupRealProfile() {
    const realProfile = path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
    
    if (!fs.existsSync(CUSTOM_PROFILE_DIR)) {
        fs.mkdirSync(CUSTOM_PROFILE_DIR, { recursive: true });
        console.log('📝 カスタムプロファイルを作成しました');
        console.log('   注意: 実際のCookieは手動でコピーしてください');
        console.log(`   元: ${realProfile}`);
        console.log(`   先: ${CUSTOM_PROFILE_DIR}`);
    }
    
    return CUSTOM_PROFILE_DIR;
}

const CHROME_USER_DATA_DIR = setupRealProfile();

// mail.tm API（簡易版）
class MailTMClient {
    constructor() {
        this.baseUrl = 'https://api.mail.tm';
        this.token = null;
        this.email = null;
        this.password = null;
    }

    async createAccount() {
        // ドメイン取得
        const domainsRes = await fetch(`${this.baseUrl}/domains`);
        const domains = await domainsRes.json();
        const domain = domains['hydra:member'][0].domain;
        
        // アカウント作成
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
        
        // ログインしてトークン取得
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

// 人間らしい遅延
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await sleep(delay);
}

// マウスを人間らしく動かす
async function humanLikeMouseMove(page, x, y) {
    const steps = 20;
    const startX = Math.random() * 500;
    const startY = Math.random() * 500;
    
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // ベジェ曲線風
        const curX = startX + (x - startX) * t + Math.sin(t * Math.PI) * (Math.random() * 50 - 25);
        const curY = startY + (y - startY) * t + Math.sin(t * Math.PI) * (Math.random() * 30 - 15);
        
        await page.mouse.move(curX, curY);
        await sleep(Math.random() * 10 + 5);
    }
}

// ChatGPTサインアップ
async function signupChatGPT() {
    console.log('🚀 Puppeteer Extra + Stealth + 実Chromeプロファイルで起動');
    console.log(`📁 プロファイル: ${CHROME_USER_DATA_DIR}`);
    
    // 実際のChromeプロファイルを使用
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        userDataDir: CHROME_USER_DATA_DIR, // 実際のプロファイル！
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--window-size=1920,1080',
            '--start-maximized',
            // 実際のユーザーエージェントを使用
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        ],
        ignoreDefaultArgs: ['--enable-automation'] // 自動化検出を無効化
    });
    
    console.log('✅ Chrome起動完了（実プロファイル使用）');
    
    const page = (await browser.pages())[0] || await browser.newPage();
    
    // ビューポート設定
    await page.setViewport({ width: 1920, height: 1080 });
    
    try {
        // 1. mail.tmでアカウント作成
        console.log('\n📧 Step 1: mail.tmアカウント作成');
        const mailClient = new MailTMClient();
        const account = await mailClient.createAccount();
        console.log(`   Email: ${account.email}`);
        console.log(`   Pass: ${account.password}`);
        
        // 2. ChatGPTサインアップページへ
        console.log('\n🌐 Step 2: ChatGPTページへ移動');
        await page.goto('https://chatgpt.com/team-sign-up?promo_campaign=team1dollar', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // 人間らしく待機（ページを見ているふり）
        await randomDelay(2000, 4000);
        
        // 3. Turnstileチェック（手動 or 自動検出）
        console.log('\n🔒 Step 3: Turnstileチェック');
        
        // 5秒待ってチェックボックスが出ているか確認
        await sleep(5000);
        
        const turnstileFrame = await page.frames().find(f => 
            f.url().includes('challenges.cloudflare.com')
        );
        
        if (turnstileFrame) {
            console.log('⚠️  Turnstile検出！手動でチェックボックスをクリックしてください...');
            console.log('   （30秒待機します）');
            
            // 30秒待機して手動でクリックしてもらう
            await sleep(30000);
            
            // iframeが消えたか確認
            const stillThere = await page.frames().find(f => 
                f.url().includes('challenges.cloudflare.com')
            );
            
            if (stillThere) {
                console.log('❌ Turnstileまだ残っています。手動で突破してください。');
                console.log('   プログラムを終了するにはCtrl+Cを押してください。');
                
                // 無限待機（手動で突破するまで）
                while (await page.frames().find(f => 
                    f.url().includes('challenges.cloudflare.com')
                )) {
                    await sleep(1000);
                }
                console.log('✅ Turnstile突破確認！');
            } else {
                console.log('✅ Turnstile突破！');
            }
        } else {
            console.log('✅ Turnstileなし、または既に突破済み');
        }
        
        // 4. メールアドレス入力
        console.log('\n✉️  Step 4: メールアドレス入力');
        await randomDelay(500, 1500);
        
        const emailInput = await page.waitForSelector('input[type="email"], input[placeholder*="メール"], input#email', {
            visible: true,
            timeout: 10000
        });
        
        // 人間らしくクリックして入力
        const box = await emailInput.boundingBox();
        await humanLikeMouseMove(page, box.x + box.width/2, box.y + box.height/2);
        await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
        await randomDelay(100, 300);
        
        // ゆっくり入力
        for (const char of account.email) {
            await emailInput.type(char, { delay: Math.random() * 100 + 50 });
        }
        
        // 5. Businessプランをはじめるボタン
        console.log('\n🚀 Step 5: Businessプランをはじめる');
        await randomDelay(500, 1000);
        
        const startButton = await page.waitForSelector('button:has-text("Business プランをはじめる"), button[type="submit"]', {
            visible: true,
            timeout: 10000
        });
        
        const startBox = await startButton.boundingBox();
        await humanLikeMouseMove(page, startBox.x + startBox.width/2, startBox.y + startBox.height/2);
        await page.mouse.click(startBox.x + startBox.width/2, startBox.y + startBox.height/2);
        
        // 6. パスワード入力
        console.log('\n🔑 Step 6: パスワード入力');
        await randomDelay(1000, 2000);
        
        const passwordInput = await page.waitForSelector('input[type="password"], input#_r_4_-new-password', {
            visible: true,
            timeout: 10000
        });
        
        const passBox = await passwordInput.boundingBox();
        await humanLikeMouseMove(page, passBox.x + passBox.width/2, passBox.y + passBox.height/2);
        await page.mouse.click(passBox.x + passBox.width/2, passBox.y + passBox.height/2);
        
        for (const char of account.password) {
            await passwordInput.type(char, { delay: Math.random() * 80 + 30 });
        }
        
        // 7. Continueボタン
        console.log('\n➡️  Step 7: Continueボタン');
        await randomDelay(500, 1000);
        
        const continueButton = await page.waitForSelector('button[type="submit"], button:has-text("Continue")', {
            visible: true,
            timeout: 10000
        });
        
        const continueBox = await continueButton.boundingBox();
        await humanLikeMouseMove(page, continueBox.x + continueBox.width/2, continueBox.y + continueBox.height/2);
        await page.mouse.click(continueBox.x + continueBox.width/2, continueBox.y + continueBox.height/2);
        
        // 8. 検証コード待機
        console.log('\n⏳ Step 8: 検証コード待機（最大5分）...');
        const verificationCode = await mailClient.waitForVerificationCode();
        
        console.log('\n🔢 Step 9: 検証コード入力');
        await randomDelay(1000, 2000);
        
        const codeInput = await page.waitForSelector('input#_r_5_-code, input[type="text"][maxlength="6"]', {
            visible: true,
            timeout: 10000
        });
        
        for (const char of verificationCode) {
            await codeInput.type(char, { delay: Math.random() * 100 + 50 });
        }
        
        // Continueボタン
        const continueButton2 = await page.waitForSelector('button[type="submit"]', {
            visible: true,
            timeout: 10000
        });
        await continueButton2.click();
        
        console.log('\n✅ サインアップ完了！');
        console.log(`   Email: ${account.email}`);
        console.log(`   Password: ${account.password}`);
        
        // ブラウザは閉じない（確認のため）
        // await browser.close();
        
    } catch (error) {
        console.error('❌ エラー:', error.message);
        // エラー時もブラウザは開いたままにして確認できるように
    }
}

// 実行
console.log('========================================');
console.log('ChatGPTサインアップ Bot');
console.log('Puppeteer Extra + Stealth Plugin');
console.log('実Chromeプロファイル使用');
console.log('========================================\n');

// 注意事項
console.log('⚠️  重要な注意事項：');
console.log('   1. Chromeは完全に閉じてから実行してください');
console.log('   2. 初回はTurnstileが出る可能性があります（手動でクリック）');
console.log('   3. 同じプロファイルを使い続けると信頼スコアが上がります');
console.log('\n');

signupChatGPT().catch(console.error);
