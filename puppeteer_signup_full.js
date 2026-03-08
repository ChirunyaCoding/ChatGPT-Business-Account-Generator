/**
 * Puppeteer Extra + Stealth Plugin - ChatGPTサインアップ完全版
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

// mail.tm API
class MailTMClient {
    constructor() {
        this.baseUrl = 'https://api.mail.tm';
        this.token = null;
    }

    async createAccount() {
        // ドメイン取得
        const domainsRes = await fetch(`${this.baseUrl}/domains`);
        const domains = await domainsRes.json();
        const domain = domains['hydra:member'][0].domain;
        
        // アカウント作成
        const email = `user${Date.now()}@${domain}`;
        const password = `Pass${Math.random().toString(36).slice(-8)}!`;
        
        const createRes = await fetch(`${this.baseUrl}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: email, password })
        });
        
        if (!createRes.ok) throw new Error('mail.tm作成失敗');
        
        // トークン取得
        const tokenRes = await fetch(`${this.baseUrl}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: email, password })
        });
        
        const tokenData = await tokenRes.json();
        this.token = tokenData.token;
        
        return { email, password };
    }

    async waitForCode(timeout = 300000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            await new Promise(r => setTimeout(r, 5000));
            
            const res = await fetch(`${this.baseUrl}/messages`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await res.json();
            
            if (data['hydra:member']?.length > 0) {
                const msg = await fetch(`${this.baseUrl}/messages/${data['hydra:member'][0].id}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                const text = (await msg.json()).text;
                const code = text.match(/\d{6}/);
                if (code) return code[0];
            }
        }
        throw new Error('コード取得タイムアウト');
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function humanType(page, selector, text) {
    for (const char of text) {
        await page.type(selector, char, { delay: Math.random() * 100 + 50 });
        if (Math.random() < 0.1) await sleep(Math.random() * 200 + 100);
    }
}

async function waitForElement(page, selector, timeout = 10000) {
    try {
        return await page.waitForSelector(selector, { visible: true, timeout });
    } catch (e) {
        console.log(`   要素が見つかりません: ${selector}`);
        return null;
    }
}

async function humanClick(page, selector) {
    const el = await waitForElement(page, selector);
    if (!el) {
        console.log(`   ⚠️  クリック対象が見つかりません: ${selector}`);
        return false;
    }
    const box = await el.boundingBox();
    await page.mouse.move(box.x + box.width/2 + Math.random()*10-5, box.y + box.height/2 + Math.random()*6-3);
    await sleep(Math.random() * 200 + 100);
    await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
    return true;
}

async function signupChatGPT() {
    console.log('🚀 ChatGPTサインアップ開始\n');
    
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--window-size=1920,1080'
        ],
        ignoreDefaultArgs: ['--enable-automation']
    });
    
    const page = (await browser.pages())[0] || await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    try {
        // Step 1: mail.tm
        console.log('📧 Step 1: mail.tmアカウント作成');
        const mail = new MailTMClient();
        const account = await mail.createAccount();
        console.log(`   Email: ${account.email}`);
        
        // Step 2: ChatGPTページ
        console.log('\n🌐 Step 2: ChatGPTページへ');
        await page.goto('https://chatgpt.com/team-sign-up?promo_campaign=team1dollar', {
            waitUntil: 'networkidle2'
        });
        await sleep(3000);
        
        // Turnstileチェック
        const turnstile = await page.frames().find(f => f.url().includes('challenges.cloudflare.com'));
        if (turnstile) {
            console.log('⚠️  Turnstile検出 - 手動でクリックしてください（30秒待機）');
            for (let i = 0; i < 30; i++) {
                await sleep(1000);
                if (!await page.frames().find(f => f.url().includes('challenges.cloudflare.com'))) {
                    console.log('✅ Turnstile突破');
                    break;
                }
            }
        }
        
        // Step 3: メール入力（複数セレクタで試行）
        console.log('\n✉️  Step 3: メールアドレス入力');
        await sleep(2000);
        
        const emailSelectors = [
            'input[type="email"]',
            'input#email',
            'input[name="email"]',
            'input[placeholder*="email" i]',
            'input[placeholder*="メール"]'
        ];
        
        let emailInput = null;
        for (const selector of emailSelectors) {
            emailInput = await waitForElement(page, selector, 2000);
            if (emailInput) {
                console.log(`   メール欄発見: ${selector}`);
                break;
            }
        }
        
        if (emailInput) {
            await emailInput.click();
            await sleep(200);
            for (const char of account.email) {
                await emailInput.type(char, { delay: Math.random() * 100 + 50 });
                if (Math.random() < 0.1) await sleep(Math.random() * 200 + 100);
            }
            console.log('   メール入力完了');
        } else {
            console.log('   ⚠️  メール欄が見つかりません。手動で入力してください。');
            await sleep(10000);
        }
        
        // Step 4: Businessプランをはじめる
        console.log('\n🚀 Step 4: Businessプランをはじめる');
        await sleep(2000);
        
        const buttonSelectors = [
            'button[type="submit"]',
            'button:has-text("Business")',
            'button:has-text("はじめる")',
            'button[data-testid*="submit"]',
            'button[class*="submit"]'
        ];
        
        for (const selector of buttonSelectors) {
            const clicked = await humanClick(page, selector);
            if (clicked) {
                console.log(`   ボタンクリック: ${selector}`);
                break;
            }
        }
        
        // Step 5: パスワード（複数セレクタで試行）
        console.log('\n🔑 Step 5: パスワード入力');
        await sleep(3000);
        
        const passwordSelectors = [
            'input[type="password"]',
            'input#_r_4_-new-password',
            'input[name="password"]',
            'input[placeholder*="password" i]',
            'input[placeholder*="パスワード"]'
        ];
        
        let passwordInput = null;
        for (const selector of passwordSelectors) {
            passwordInput = await waitForElement(page, selector, 2000);
            if (passwordInput) {
                console.log(`   パスワード欄発見: ${selector}`);
                break;
            }
        }
        
        if (!passwordInput) {
            console.log('   ⚠️  パスワード欄が見つかりません。手動で入力してください。');
            await sleep(10000);
        } else {
            await passwordInput.click();
            await sleep(200);
            for (const char of account.password) {
                await passwordInput.type(char, { delay: Math.random() * 80 + 30 });
            }
            console.log('   パスワード入力完了');
        }
        
        // Step 6: Continue
        console.log('\n➡️  Step 6: Continue');
        await sleep(1000);
        
        const continueSelectors = [
            'button[type="submit"]',
            'button:has-text("Continue")',
            'button:has-text("続ける")',
            'button[data-dd-action-name="Continue"]'
        ];
        
        for (const selector of continueSelectors) {
            const clicked = await humanClick(page, selector);
            if (clicked) {
                console.log(`   Continueボタンクリック: ${selector}`);
                break;
            }
        }
        
        // Step 7: 検証コード待機
        console.log('\n⏳ Step 7: 検証コード待機（最大5分）...');
        const code = await mail.waitForCode();
        console.log(`   コード: ${code}`);
        
        // Step 8: コード入力
        console.log('\n🔢 Step 8: 検証コード入力');
        await sleep(1000);
        await humanClick(page, 'input[type="text"][maxlength="6"], input#_r_5_-code');
        await humanType(page, 'input[type="text"][maxlength="6"], input#_r_5_-code', code);
        await humanClick(page, 'button[type="submit"]');
        
        // Step 9: 生年月日設定（2000年3月9日）
        console.log('\n🎂 Step 9: 生年月日設定（2000/03/09）');
        await sleep(2000);
        
        // 「Use date of birth」リンクが表示されたらクリック
        const useDobLink = await page.$('a[href="/about-you"], a:has-text("Use date of birth"), a:has-text("date of birth")');
        if (useDobLink) {
            console.log('   「Use date of birth」リンクを検出、クリックします');
            await useDobLink.click();
            await sleep(2000);
        }
        
        // 月の入力（03）
        const monthInput = await page.$('[data-type="month"]');
        if (monthInput) {
            await monthInput.click();
            await monthInput.evaluate(el => {
                el.textContent = '03';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            console.log('   月を03に設定');
        }
        await sleep(300);
        
        // 日の入力（09）
        const dayInput = await page.$('[data-type="day"]');
        if (dayInput) {
            await dayInput.click();
            await dayInput.evaluate(el => {
                el.textContent = '09';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            console.log('   日を09に設定');
        }
        await sleep(300);
        
        // 年の入力（2000）
        const yearInput = await page.$('[data-type="year"]');
        if (yearInput) {
            await yearInput.click();
            await yearInput.evaluate(el => {
                el.textContent = '2000';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            });
            console.log('   年を2000に設定');
        }
        await sleep(500);
        
        // Step 10: 名前入力
        console.log('\n👤 Step 10: 名前入力');
        await sleep(2000);
        
        const nameInput = await waitForElement(page, 'input[name="name"], input#_r_h_-name', 5000);
        if (nameInput) {
            await nameInput.click();
            await sleep(200);
            for (const char of 'User') {
                await nameInput.type(char, { delay: Math.random() * 100 + 50 });
            }
            console.log('   名前入力完了');
        }
        
        // Step 10.5: Finish creating account ボタンを確実にクリック
        console.log('\n🎯 Step 10.5: Finish creating account');
        await sleep(2000);
        
        // ボタンが見つかるまで最大30秒待機
        let finishButton = null;
        for (let i = 0; i < 30; i++) {
            // Puppeteer対応のセレクタ（:has-textは使えない）
            const selectors = [
                'button[data-dd-action-name="Continue"]',
                'button[type="submit"]'
            ];
            
            for (const selector of selectors) {
                finishButton = await page.$(selector);
                if (finishButton) {
                    console.log(`   Finishボタン発見: ${selector}`);
                    break;
                }
            }
            
            if (finishButton) break;
            await sleep(1000);
        }
        
        if (finishButton) {
            // ボタンが有効になるまで待機
            await page.waitForFunction((selector) => {
                const btn = document.querySelector(selector);
                return btn && !btn.disabled;
            }, { timeout: 10000 }, 'button[data-dd-action-name="Continue"]');
            
            // 複数回クリックして確実に
            for (let i = 0; i < 3; i++) {
                try {
                    await finishButton.click();
                    console.log(`   クリック ${i + 1}/3`);
                    await sleep(500);
                } catch (e) {
                    console.log(`   クリック ${i + 1}失敗、再試行`);
                }
            }
            
            // 遷移を待機
            console.log('   ページ遷移を待機...');
            await sleep(3000);
        } else {
            console.log('   ⚠️  Finishボタンが見つかりませんでした');
        }
        
        // Step 11: 完了
        console.log('\n✅ Step 11: サインアップ完了！');
        console.log(`   Email: ${account.email}`);
        console.log(`   Pass: ${account.password}`);
        
        // スクリーンショット保存
        await page.screenshot({ path: 'signup_success.png', fullPage: true });
        console.log('   📸 スクリーンショット: signup_success.png');
        
    } catch (err) {
        console.error('❌ エラー:', err.message);
        await page.screenshot({ path: 'signup_error.png', fullPage: true });
    }
    
    console.log('\n💡 ブラウザは開いたままです。確認後、手動で閉じてください。');
}

signupChatGPT().catch(console.error);
