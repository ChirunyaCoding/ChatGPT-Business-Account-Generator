/**
 * Puppeteer Extra + Stealth Plugin + 実際のChromeプロファイル
 * 最強の検出回避構成
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Stealth Pluginを有効化（すべての回避策を適用）
puppeteer.use(StealthPlugin());

// 実際のChromeプロファイルのパス（Windowsの場合）
// 注意: あなたのWindowsユーザー名に置き換えてください
// 実際のChromeプロファイルをコピーして使用（権限問題回避）

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
    console.log('🚀 Puppeteer Extra + Stealth で起動');
    
    // 既存プロファイル設定
    const profilePath = process.env.CHROME_PROFILE_PATH;
    const profileName = process.env.CHROME_PROFILE_NAME || 'Default';
    
    const launchOptions = {
        headless: false,
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--window-size=1920,1080',
            '--start-maximized',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            // 追加: 安定性向上
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--disable-background-timer-throttling'
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        // タイムアウト設定
        protocolTimeout: 60000,
        slowMo: 50 // 操作を少し遅くして安定化
    };
    
    // 既存プロファイルが指定されている場合は使用
    if (profilePath) {
        launchOptions.userDataDir = profilePath;
        console.log(`📁 既存プロファイルを使用: ${profilePath}`);
        console.log(`   プロファイル名: ${profileName}`);
    } else {
        console.log('📁 一時プロファイルを使用');
    }
    
    const browser = await puppeteer.launch(launchOptions);
    
    console.log('✅ Chrome起動完了');
    
    // 新しいページを作成（既存ページを再利用しない）
    const page = await browser.newPage();
    
    // ページが準備完了になるまで待機
    await sleep(1000);
    
    // ビューポート設定
    await page.setViewport({ width: 1920, height: 1080 });
    
    // JavaScript有効化確認
    await page.setJavaScriptEnabled(true);
    
    try {
        // 1. mail.tmでアカウント作成
        console.log('\n📧 Step 1: mail.tmアカウント作成');
        const mailClient = new MailTMClient();
        const account = await mailClient.createAccount();
        console.log(`   Email: ${account.email}`);
        console.log(`   Pass: ${account.password}`);
        
        // 2. ChatGPTサインアップページへ
        console.log('\n🌐 Step 2: ChatGPTページへ移動');
        await page.goto('https://chatgpt.com/?promo_campaign=team1dollar#team-pricing', {
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
        await sleep(3000); // ページ完全読み込み待機
        
        // メール入力フィールドが表示されるまで待機（複数セレクタで試行）
        let emailInput = null;
        const maxRetries = 3;
        
        for (let i = 0; i < maxRetries && !emailInput; i++) {
            try {
                emailInput = await page.waitForSelector('input[type="email"], input[name="email"], input[id*="email"]', {
                    visible: true,
                    timeout: 5000
                });
            } catch (e) {
                console.log(`   メール欄検索リトライ ${i + 1}/${maxRetries}`);
                await sleep(2000);
            }
        }
        
        if (!emailInput) {
            throw new Error('メール入力欄が見つかりません');
        }
        
        // 人間らしくクリックして入力
        const box = await emailInput.boundingBox();
        await humanLikeMouseMove(page, box.x + box.width/2, box.y + box.height/2);
        await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
        await randomDelay(100, 300);
        
        // ゆっくり入力
        for (const char of account.email) {
            await emailInput.type(char, { delay: Math.random() * 100 + 50 });
        }
        console.log(`   メール入力完了: ${account.email}`);
        
        // デバッグ: メール入力後の状態
        await page.screenshot({ path: 'debug_step4_after_email.png' });
        console.log('   📸 スクリーンショット: debug_step4_after_email.png');
        
        // 5. Businessプランをはじめるボタン
        console.log('\n🚀 Step 5: Businessプランをはじめる');
        await randomDelay(500, 1000);
        
        // ボタンを探す（英語版「Get started for free」）
        const startButton = await page.waitForFunction(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            // まず「Get started」を探す
            let btn = buttons.find(b => b.textContent.trim().includes('Get started'));
            // なければtype="submit"のボタンを探す
            if (!btn) {
                btn = buttons.find(b => b.type === 'submit');
            }
            return btn;
        }, { timeout: 10000 });
        
        if (startButton) {
            const btnText = await startButton.evaluate(el => el.textContent.trim());
            console.log(`   ボタン発見: "${btnText}"`);
            
            // JavaScriptでクリック（より確実）
            await startButton.evaluate(btn => btn.click());
            console.log('   ボタンクリック完了');
            
            // クリック後の遷移待機
            await sleep(3000);
            await page.screenshot({ path: 'debug_step5_after_click.png' });
            console.log(`   クリック後URL: ${page.url()}`);
            console.log('   📸 スクリーンショット: debug_step5_after_click.png');
        } else {
            console.log('   ⚠️ 開始ボタンが見つかりません');
        }
        
        // 6. パスワード入力
        console.log('\n🔑 Step 6: パスワード入力');
        await randomDelay(3000, 5000);  // ページ遷移待機時間を増やす
        
        // デバッグ: 現在のページ情報を出力
        const currentUrl = page.url();
        console.log(`   現在のURL: ${currentUrl}`);
        
        // スクリーンショットを撮影
        await page.screenshot({ path: 'debug_step6.png' });
        console.log('   📸 スクリーンショット: debug_step6.png');
        
        const passwordInput = await page.waitForSelector('input[type="password"], input[name="password"], input#password', {
            visible: true,
            timeout: 10000
        });
        
        const passBox = await passwordInput.boundingBox();
        await humanLikeMouseMove(page, passBox.x + passBox.width/2, passBox.y + passBox.height/2);
        await page.mouse.click(passBox.x + passBox.width/2, passBox.y + passBox.height/2);
        
        for (const char of account.password) {
            await passwordInput.type(char, { delay: Math.random() * 80 + 30 });
        }
        console.log('   パスワード入力完了');
        
        // パスワード入力後のスクリーンショット
        await page.screenshot({ path: 'debug_step6_after_password.png' });
        console.log('   📸 スクリーンショット: debug_step6_after_password.png');
        
        // 7. Continueボタン
        console.log('\n➡️  Step 7: Continueボタン');
        await randomDelay(500, 1000);
        
        const continueButton = await page.waitForFunction(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(btn => 
                btn.type === 'submit' ||
                btn.textContent.includes('Continue') ||
                btn.textContent.includes('続ける')
            );
        }, { timeout: 10000 });
        
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
        await sleep(3000);
        
        // Step 10: 年齢確認ページ - 名前入力
        console.log('\n🎂 Step 10: 年齢確認 - 名前入力');
        
        const nameInput = await page.waitForSelector('input[name="name"], input#_r_h_-name, input[placeholder="Full name"]', {
            visible: true,
            timeout: 10000
        });
        
        await nameInput.click();
        await sleep(200);
        
        // 名前を入力（現実的な名前 - 1000〜5000回被らないように）
        const firstNames = [
            'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles',
            'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Kenneth', 'Joshua',
            'Kevin', 'Brian', 'George', 'Edward', 'Ronald', 'Timothy', 'Jason', 'Jeffrey', 'Ryan', 'Jacob',
            'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon', 'Benjamin',
            'Samuel', 'Gregory', 'Frank', 'Alexander', 'Raymond', 'Patrick', 'Jack', 'Dennis', 'Jerry', 'Tyler',
            'Aaron', 'Jose', 'Adam', 'Henry', 'Nathan', 'Douglas', 'Zachary', 'Peter', 'Kyle', 'Walter',
            'Ethan', 'Jeremy', 'Harold', 'Keith', 'Christian', 'Roger', 'Noah', 'Gerald', 'Carl', 'Terry',
            'Sean', 'Austin', 'Arthur', 'Lawrence', 'Jesse', 'Dylan', 'Bryan', 'Joe', 'Jordan', 'Billy',
            'Albert', 'Bruce', 'Willie', 'Gabriel', 'Alan', 'Juan', 'Logan', 'Wayne', 'Ralph', 'Roy',
            'Eugene', 'Randy', 'Vincent', 'Russell', 'Louis', 'Philip', 'Bobby', 'Johnny', 'Mary', 'Patricia',
            'Jennifer', 'Linda', 'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen', 'Nancy', 'Lisa', 'Betty',
            'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle', 'Dorothy', 'Carol', 'Amanda',
            'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Laura', 'Sharon', 'Cynthia', 'Kathleen', 'Amy', 'Shirley',
            'Angela', 'Helen', 'Anna', 'Brenda', 'Pamela', 'Nicole', 'Emma', 'Samantha', 'Katherine', 'Christine',
            'Debra', 'Rachel', 'Catherine', 'Carolyn', 'Janet', 'Ruth', 'Maria', 'Heather', 'Diane', 'Virginia',
            'Julie', 'Joyce', 'Victoria', 'Olivia', 'Kelly', 'Christina', 'Lauren', 'Joan', 'Evelyn', 'Judith',
            'Megan', 'Cheryl', 'Andrea', 'Hannah', 'Martha', 'Jacqueline', 'Frances', 'Gloria', 'Ann', 'Teresa',
            'Kathryn', 'Sara', 'Janice', 'Jean', 'Alice', 'Madison', 'Doris', 'Abigail', 'Julia', 'Judy',
            'Grace', 'Denise', 'Amber', 'Marilyn', 'Beverly', 'Danielle', 'Theresa', 'Sophia', 'Marie', 'Diana',
            'Brittany', 'Natalie', 'Isabella', 'Charlotte', 'Rose', 'Alexis', 'Kayla', 'Lillian', 'Barbara', 'Mercedes'
        ];
        
        const lastNames = [
            'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
            'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
            'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
            'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
            'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
            'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards', 'Collins', 'Reyes',
            'Stewart', 'Morris', 'Morales', 'Murphy', 'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper',
            'Peterson', 'Bailey', 'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson',
            'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza', 'Ruiz', 'Hughes',
            'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers', 'Long', 'Ross', 'Foster', 'Jimenez',
            'Powell', 'Jenkins', 'Perry', 'Russell', 'Sullivan', 'Bell', 'Coleman', 'Butler', 'Henderson', 'Barnes',
            'Gonzales', 'Fisher', 'Vasquez', 'Simmons', 'Romero', 'Jordan', 'Patterson', 'Alexander', 'Hamilton', 'Graham',
            'Reynolds', 'Griffin', 'Wallace', 'Moreno', 'West', 'Cole', 'Hayes', 'Bryant', 'Herrera', 'Gibson',
            'Ellis', 'Tran', 'Medina', 'Aguilar', 'Stevens', 'Murray', 'Ford', 'Castro', 'Marshall', 'Owens',
            'Harrison', 'Fernandez', 'Woods', 'Washington', 'Kennedy', 'Wells', 'Vargas', 'Henry', 'Chen', 'Freeman',
            'Webb', 'Tucker', 'Guzman', 'Burns', 'Crawford', 'Olson', 'Simpson', 'Porter', 'Hunter', 'Gordon',
            'Mendez', 'Silva', 'Shaw', 'Snyder', 'Mason', 'Dixon', 'Munoz', 'Hunt', 'Hicks', 'Holmes',
            'Palmer', 'Wagner', 'Black', 'Robertson', 'Boyd', 'Rose', 'Stone', 'Salazar', 'Fox', 'Warren',
            'Mills', 'Meyer', 'Rice', 'Schmidt', 'Garza', 'Daniels', 'Ferguson', 'Nichols', 'Stephens', 'Soto',
            'Weaver', 'Ryan', 'Gardner', 'Payne', 'Grant', 'Dunn', 'Kelley', 'Spencer', 'Hawkins', 'Arnold'
        ];
        
        // ユニークな名前を生成（1000〜5000回被らないようにMiddle Initialを追加）
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const middleInitial = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
        const fullName = `${firstName} ${middleInitial}. ${lastName}`;
        
        for (const char of fullName) {
            await nameInput.type(char, { delay: Math.random() * 100 + 50 });
        }
        console.log(`   名前入力完了: ${fullName}`);
        
        // Step 11: 生年月日設定（4月1日2000年）
        console.log('\n📅 Step 11: 生年月日設定（04/01/2000）');
        
        // 複数のセレクタを試行
        const birthdaySelectors = [
            'input[name="birthday"]',
            'input[placeholder*="MM/DD/YYYY"]',
            'input[type="date"]',
            'input#_r_h_-birthday',
            'input[data-type="birthday"]',
            'input[aria-label*="Birthday"]',
            'input[aria-labelledby*="birthday"]'
        ];
        
        let birthdayInput = null;
        for (const selector of birthdaySelectors) {
            birthdayInput = await page.$(selector);
            if (birthdayInput) {
                console.log(`   生年月日フィールド発見: ${selector}`);
                break;
            }
        }
        
        // JavaScriptで検索も試行
        if (!birthdayInput) {
            birthdayInput = await page.evaluateHandle(() => {
                const inputs = Array.from(document.querySelectorAll('input'));
                return inputs.find(input => {
                    const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
                    return label && label.textContent.toLowerCase().includes('birthday');
                });
            }).catch(() => null);
        }
        
        // 生年月日を個別に入力（月/日/年）- 20歳以上70歳未満でランダム
        // 20歳以上70歳未満 = 1956年〜2006年
        const minYear = 1956;
        const maxYear = 2006;
        const randomYear = Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
        const randomMonth = Math.floor(Math.random() * 12) + 1;
        const randomDay = Math.floor(Math.random() * 28) + 1; // 安全のため28日まで
        
        const monthStr = randomMonth.toString().padStart(2, '0');
        const dayStr = randomDay.toString().padStart(2, '0');
        const yearStr = randomYear.toString();
        
        // 月を入力
        const monthEl = await page.$('[data-type="month"]');
        if (monthEl) {
            await monthEl.click({ clickCount: 3 });
            await sleep(100);
            await monthEl.type(monthStr, { delay: 50 });
            console.log(`   月入力完了: ${monthStr}`);
        }
        
        // 日を入力
        const dayEl = await page.$('[data-type="day"]');
        if (dayEl) {
            await dayEl.click({ clickCount: 3 });
            await sleep(100);
            await dayEl.type(dayStr, { delay: 50 });
            console.log(`   日入力完了: ${dayStr}`);
        }
        
        // 年を入力
        const yearEl = await page.$('[data-type="year"]');
        if (yearEl) {
            await yearEl.click({ clickCount: 3 });
            await sleep(100);
            await yearEl.type(yearStr, { delay: 50 });
            console.log(`   年入力完了: ${yearStr}`);
        }
        
        console.log(`   生年月日入力完了: ${monthStr}/${dayStr}/${yearStr} (${new Date().getFullYear() - randomYear}歳)`);
        
        await sleep(1000);
        
        // Step 12: Continueボタン（もしあれば）
        console.log('\n➡️  Step 12: Continueボタン');
        const continueBtnExists = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const btn = buttons.find(b => b.textContent.trim().includes('Continue'));
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        
        if (continueBtnExists) {
            console.log('   Continueボタン クリック完了');
            await sleep(2000);
        } else {
            console.log('   Continueボタンは見つかりませんでした（スキップ）');
        }
        
        // Step 13: Finish creating account
        console.log('\n✅ Step 13: アカウント作成完了');
        const finishButton = await page.waitForFunction(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(btn => btn.textContent.includes('Finish creating account'));
        }, { timeout: 10000 });
        
        await finishButton.click();
        console.log('   Finish creating account クリック完了');
        
        // 20秒待機（"What's your company or team name?" ページが表示されるまで）
        console.log('   20秒待機中...');
        await sleep(20000);
        
        // ページ遷移を待機
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
            console.log('   ページ遷移完了');
        } catch (e) {
            console.log('   ページ遷移待機タイムアウト（続行）');
        }
        
        // URLが create-free-workspace になったら遷移
        const finalUrl = page.url();
        if (finalUrl.includes('create-free-workspace')) {
            console.log('\n🏢 会社/チーム名ページが検出されました (create-free-workspace)');
            console.log('   https://chatgpt.com/#pricing に遷移します');
            await page.goto('https://chatgpt.com/#pricing', { waitUntil: 'networkidle2' });
            await sleep(3000);
            
            // "Okay, let's go" ボタンを押す（複数回試行）
            console.log('\n👆 Okay, let\'s go ボタンをクリック');
            for (let i = 0; i < 5; i++) {
                // ボタンを探してクリック
                const clicked = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    // 部分一致で検索（スマートクォートと通常クォートの両方に対応）
                    const btn = buttons.find(b => {
                        const text = b.textContent.trim();
                        return text.includes('Okay') && text.includes('go');
                    });
                    if (btn) {
                        btn.click();
                        return true;
                    }
                    return false;
                });
                
                if (clicked) {
                    console.log(`   クリック試行 ${i + 1}/5`);
                }
                
                await sleep(2000);
                
                // ボタンが消えたか確認
                const stillVisible = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    return buttons.some(b => {
                        const text = b.textContent.trim();
                        return text.includes('Okay') && text.includes('go');
                    });
                });
                
                if (!stillVisible) {
                    console.log('   Okay, let\'s go ボタンが消えました');
                    break;
                }
            }
            
            // "Skip" ボタンが表示されるまで待機して押す
            console.log('\n⏭️  Skipボタンを確認中...（最大10秒）');
            let skipClicked = false;
            for (let i = 0; i < 10; i++) {
                skipClicked = await page.evaluate(() => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const skipBtn = buttons.find(b => b.textContent.trim() === 'Skip');
                    if (skipBtn) {
                        skipBtn.click();
                        return true;
                    }
                    return false;
                });
                
                if (skipClicked) {
                    console.log('   Skipボタンをクリックしました');
                    await sleep(2000);
                    break;
                }
                await sleep(1000);
            }
            
            if (!skipClicked) {
                console.log('   Skipボタンは見つかりませんでした');
            }
        }
        
        // 最終スクリーンショット
        await page.screenshot({ path: 'signup_success_final.png', fullPage: true });
        console.log('   📸 最終スクリーンショット: signup_success_final.png');
        
        console.log('\n✅ サインアップ完了！');
        console.log(`   Email: ${account.email}`);
        console.log(`   Password: ${account.password}`);
        
        // ブラウザを閉じてプロセスを終了
        await sleep(2000);
        await browser.close();
        console.log('   ブラウザを閉じました');
        
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
