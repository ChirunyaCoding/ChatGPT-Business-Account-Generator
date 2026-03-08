/**
 * Puppeteer + Stealth Plugin でのChatGPTサインアップ
 * より強力なステルス対策版
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// ステルスプラグインを有効化
puppeteer.use(StealthPlugin());

const { MailTMClient } = require('./mail_tm_client.js'); // Node.js版が必要

async function signupChatGPT() {
    // メールアドレス作成
    const mailClient = new MailTMClient();
    const account = await mailClient.createAccount();
    console.log(`Email: ${account.email}`);
    
    // ブラウザ起動（強化されたステルス）
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080',
        ],
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    });
    
    const page = await browser.newPage();
    
    // タイムゾーンと位置情報を設定
    await page.emulateTimezone('Asia/Tokyo');
    
    // ページ移動
    await page.goto('https://chatgpt.com/team-sign-up?promo_campaign=team1dollar', {
        waitUntil: 'networkidle2'
    });
    
    // Turnstile検出と処理
    const turnstileFrame = await page.frames().find(f => 
        f.url().includes('challenges.cloudflare.com')
    );
    
    if (turnstileFrame) {
        console.log('Turnstile detected, waiting...');
        // 手動または自動でクリック
        // または2captchaで解決
        await page.waitForTimeout(5000);
    }
    
    // メール入力
    await page.type('input[type="email"]', account.email, { delay: 100 });
    
    // 人間らしい動きでクリック
    const button = await page.$('button[type="submit"]');
    const box = await button.boundingBox();
    
    // マウスを動かしてクリック（ベジェ曲線）
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2, { steps: 10 });
    await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
    
    // ... 残りのフロー
    
    await browser.close();
}

signupChatGPT().catch(console.error);
