/**
 * Puppeteer Unified - ChatGPTアカウント作成 (Firefox/Chrome自動切り替え)
 * https://chatgpt.com/auth/login から開始
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// iframeとメインページの両方で要素を探すヘルパー関数
async function findElementInPageOrFrames(page, selector) {
    // まずメインページで探す
    try {
        const element = await page.$(selector);
        if (element) {
            return { element, frame: page, isFrame: false };
        }
    } catch (e) {
        // メインページで見つからない
    }
    
    // iframe内を探す
    const frames = page.frames();
    for (const frame of frames) {
        try {
            const element = await frame.$(selector);
            if (element) {
                return { element, frame, isFrame: true };
            }
        } catch (e) {
            // このフレームではアクセスできない
            continue;
        }
    }
    
    return null;
}

// フランスの住所をランダム生成
function generateFrenchAddress() {
    // フランスの主要都市と郵便番号
    const cities = [
        { name: 'Paris', postalPrefix: '75', region: 'Paris' },
        { name: 'Marseille', postalPrefix: '13', region: 'Provence' },
        { name: 'Lyon', postalPrefix: '69', region: 'Rhône' },
        { name: 'Toulouse', postalPrefix: '31', region: 'Haute-Garonne' },
        { name: 'Nice', postalPrefix: '06', region: 'Alpes-Maritimes' },
        { name: 'Nantes', postalPrefix: '44', region: 'Loire-Atlantique' },
        { name: 'Strasbourg', postalPrefix: '67', region: 'Bas-Rhin' },
        { name: 'Montpellier', postalPrefix: '34', region: 'Hérault' },
        { name: 'Bordeaux', postalPrefix: '33', region: 'Gironde' },
        { name: 'Lille', postalPrefix: '59', region: 'Nord' },
        { name: 'Rennes', postalPrefix: '35', region: 'Ille-et-Vilaine' },
        { name: 'Reims', postalPrefix: '51', region: 'Marne' }
    ];
    
    // 通り名のパターン
    const streetTypes = ['Rue', 'Avenue', 'Boulevard', 'Place', 'Allée', 'Chemin', 'Impasse'];
    const streetNames = [
        'de la Paix', 'de Paris', 'des Champs-Élysées', 'de la République',
        'Victor Hugo', 'Jean Jaurès', 'de la Liberté', 'des Fleurs',
        'du Commerce', 'de l\'Église', 'des Écoles', 'de la Gare',
        'Saint-Honoré', 'de Rivoli', 'Montmartre', 'du Montparnasse',
        'de la Mairie', 'du Marché', 'des Jardins', 'des Lilas'
    ];
    
    const city = cities[Math.floor(Math.random() * cities.length)];
    const streetType = streetTypes[Math.floor(Math.random() * streetTypes.length)];
    const streetName = streetNames[Math.floor(Math.random() * streetNames.length)];
    const streetNumber = Math.floor(Math.random() * 150) + 1;
    const postalSuffix = Math.floor(Math.random() * 900) + 100;
    
    return {
        street: `${streetNumber} ${streetType} ${streetName}`,
        city: city.name,
        postalCode: `${city.postalPrefix}${postalSuffix}`,
        region: city.region
    };
}

// ブラウザパス検出
function detectBrowserPaths() {
    const paths = {
        brave: null,
        chrome: null
    };
    
    // Brave検出
    const bravePaths = [
        process.env.BRAVE_PATH,
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        '/usr/bin/brave-browser'
    ];
    
    for (const path of bravePaths) {
        if (path && fs.existsSync(path)) {
            paths.brave = path;
            break;
        }
    }
    
    // Chrome検出
    const chromePaths = [
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/usr/bin/google-chrome'
    ];
    
    for (const path of chromePaths) {
        if (path && fs.existsSync(path)) {
            paths.chrome = path;
            break;
        }
    }
    
    return paths;
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

// ブラウザを起動
async function launchBrowser(browserType, browserPath) {
    const headlessMode = process.env.HEADLESS === 'true';
    
    const commonOptions = {
        headless: headlessMode,
        executablePath: browserPath,
        slowMo: 50,
        timeout: 120000,
        protocolTimeout: 120000,
        args: [
            '--width=1920',
            '--height=1080',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ]
    };
    
    if (browserType === 'brave') {
        console.log('🦁 Braveを起動中...');
        return await puppeteer.launch({
            ...commonOptions,
            ignoreDefaultArgs: ['--enable-automation']
        });
    } else {
        console.log('🌐 Chromeを起動中...');
        return await puppeteer.launch({
            ...commonOptions,
            ignoreDefaultArgs: ['--enable-automation']
        });
    }
}

// メイン処理
async function signupWithBrowser(browserType, browserPath, mailClient, account) {
    const browser = await launchBrowser(browserType, browserPath);
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Step 2: ChatGPTチームプライシングページへ
        console.log('\n🌐 Step 2: ChatGPTチームプライシングページへ移動');
        await page.goto('https://chatgpt.com/?promo_campaign=team1dollar#team-pricing', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await sleep(5000);
        console.log('   ✅ ページ読み込み成功');
        
        // Step 3: チームプラン登録ボタン
        console.log('\n👆 Step 3: チームプラン登録ボタンを探してクリック');
        await sleep(randomDelay(2000, 4000));
        
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, a'));
            const btn = buttons.find(b => {
                const text = b.textContent.trim().toLowerCase();
                return text.includes('sign up for free') || 
                       text.includes('まずは試してみましょう') ||
                       text.includes('get started') ||
                       text.includes('get team') ||
                       text.includes('start now') ||
                       text.includes('sign up');
            });
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
        
        await emailInput.type(account.email, { delay: 0 });
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
        
        // パスワードページに到達したか確認
        const hasPasswordField = await page.evaluate(() => {
            return !!document.querySelector('input[type="password"], input[name="new-password"]');
        });
        
        if (!hasPasswordField) {
            throw new Error('パスワード入力ページに到達できません');
        }
        
        // Step 6: パスワード入力
        console.log('\n🔑 Step 6: パスワード入力');
        
        const passwordInput = await page.waitForSelector('input[type="password"], input[name="new-password"]', {
            visible: true,
            timeout: 15000
        });
        
        await passwordInput.click();
        await sleep(randomDelay(100, 300));
        
        await passwordInput.type(account.password, { delay: 0 });
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
        
        // エラーチェック: 「不明なエラーが発生しました」が表示されたか
        const hasError = await page.evaluate(() => {
            const errorElements = document.querySelectorAll('span, div, p');
            return Array.from(errorElements).some(el => 
                el.textContent.includes('不明なエラーが発生しました') ||
                el.textContent.includes('An unknown error occurred')
            );
        });
        
        if (hasError) {
            console.log('   ⚠️ 不明なエラーが検出されました。リトライします...');
            
            // 「もう一度試す」ボタンを探してクリック
            const retryClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const retryBtn = buttons.find(b => {
                    const text = b.textContent.trim();
                    return text.includes('もう一度試す') || 
                           text.includes('Try again') ||
                           b.getAttribute('data-dd-action-name') === 'Try again';
                });
                if (retryBtn) {
                    retryBtn.click();
                    return true;
                }
                return false;
            });
            
            if (retryClicked) {
                console.log('   ✅ もう一度試すボタンをクリックしました');
                await sleep(randomDelay(3000, 5000));
                
                // パスワード入力からやり直し
                console.log('\n🔑 Step 6 (Retry): パスワード再入力');
                const passwordInputRetry = await page.waitForSelector('input[type="password"], input[name="new-password"]', {
                    visible: true,
                    timeout: 15000
                });
                
                await passwordInputRetry.click();
                await sleep(randomDelay(100, 300));
                await passwordInputRetry.type(account.password, { delay: 0 });
                console.log('   パスワード再入力完了');
                await sleep(randomDelay(500, 1000));
                
                // Continueボタンを再クリック
                console.log('\n➡️ Step 7 (Retry): Continueボタン');
                await Promise.all([
                    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null),
                    page.evaluate(() => {
                        document.querySelector('button[type="submit"]')?.click();
                    })
                ]);
                await sleep(randomDelay(5000, 7000));
            }
        }
        
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
        
        await codeInput.type(verificationCode, { delay: 0 });
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
        
        await nameInput.type(fullName, { delay: 0 });
        console.log(`   名前入力完了: ${fullName}`);
        await sleep(randomDelay(500, 1000));
        
        // Step 12: 生年月日入力
        console.log('\n📅 Step 12: 生年月日設定');
        const birthday = generateBirthday();
        
        // 方法1: 従来の data-type 属性（input要素）
        const monthEl = await page.$('[data-type="month"]');
        if (monthEl) {
            await monthEl.click({ clickCount: 3 });
            await sleep(randomDelay(100, 200));
            await monthEl.type(birthday.month, { delay: 0 });
            console.log(`   月入力完了: ${birthday.month}`);
            await sleep(randomDelay(300, 500));
        }
        
        const dayEl = await page.$('[data-type="day"]');
        if (dayEl) {
            await dayEl.click({ clickCount: 3 });
            await sleep(randomDelay(100, 200));
            await dayEl.type(birthday.day, { delay: 0 });
            console.log(`   日入力完了: ${birthday.day}`);
            await sleep(randomDelay(300, 500));
        }
        
        const yearEl = await page.$('[data-type="year"]');
        if (yearEl) {
            await yearEl.click({ clickCount: 3 });
            await sleep(randomDelay(100, 200));
            await yearEl.type(birthday.year, { delay: 0 });
            console.log(`   年入力完了: ${birthday.year}`);
            await sleep(randomDelay(300, 500));
        }
        
        // 方法2: React Aria Select（隠されたselect要素）
        const selectEls = await page.$$('select[tabindex="-1"]');
        if (selectEls.length >= 3 && !monthEl) {
            // 年、月、日のselect要素を特定して設定
            await page.evaluate((year, month, day) => {
                const selects = document.querySelectorAll('select[tabindex="-1"]');
                selects.forEach(select => {
                    const options = Array.from(select.options);
                    // 年の判定（4桁の値があるか）
                    const hasYear = options.some(o => o.value.length === 4 && parseInt(o.value) > 1900);
                    // 月の判定（1-12の範囲）
                    const hasMonth = options.some(o => parseInt(o.value) >= 1 && parseInt(o.value) <= 12 && o.textContent.includes('月'));
                    // 日の判定（1-31の範囲）
                    const hasDay = options.some(o => parseInt(o.value) >= 1 && parseInt(o.value) <= 31);
                    
                    if (hasYear && !hasMonth && !hasDay) {
                        select.value = year;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (hasMonth) {
                        select.value = month;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    } else if (hasDay && !hasYear) {
                        select.value = day;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            }, birthday.year, birthday.month, birthday.day);
            console.log(`   年設定: ${birthday.year}`);
            console.log(`   月設定: ${birthday.month}`);
            console.log(`   日設定: ${birthday.day}`);
            await sleep(randomDelay(500, 1000));
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
        
        // Step 14: オンボーディングフロー処理（Okay, let's go / Skip）
        console.log('\n👋 Step 14: オンボーディングフロー処理');
        
        // 現在のURLを確認
        let currentUrl = page.url();
        console.log(`   現在のURL: ${currentUrl}`);
        
        // pricingページにリダイレクトされた場合はchatgpt.comに移動
        if (currentUrl.includes('#pricing') || currentUrl.includes('/pricing')) {
            console.log('   pricingページを検出、チャットページに移動します');
            await page.goto('https://chatgpt.com', {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });
            await sleep(5000);
            currentUrl = page.url();
        }
        
        // "Okay, let's go" または "Skip" ボタンを探してクリック
        const maxRetries = 5;
        for (let i = 0; i < maxRetries; i++) {
            const buttonClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const targetBtn = buttons.find(b => {
                    const text = b.textContent.trim().toLowerCase();
                    return text.includes("okay, let's go") || 
                           text.includes("okay") ||
                           text.includes("skip") ||
                           text.includes("start") ||
                           text.includes("get started") ||
                           text.includes("始めましょう") ||
                           text.includes("スキップ");
                });
                if (targetBtn) {
                    targetBtn.click();
                    return true;
                }
                return false;
            });
            
            if (buttonClicked) {
                console.log('   オンボーディングボタンをクリックしました');
                await sleep(randomDelay(4000, 6000));
                
                // URLを確認
                currentUrl = page.url();
                console.log(`   移動後のURL: ${currentUrl}`);
                
                // create-workspaceページに到達したらチームプラン登録フローへ
                if (currentUrl.includes('create-workspace')) {
                    console.log('   ✅ ChatGPTワークスペース設定ページに到達しました');
                    break;
                }
                
                // #pricingページに到達したら終了
                if (currentUrl.includes('#pricing') || currentUrl.includes('/pricing')) {
                    console.log('   ✅ ChatGPT pricingページに到達しました');
                    break;
                }
                
                // chatgpt.comに到達したら終了
                if (currentUrl.includes('chatgpt.com') && !currentUrl.includes('pricing')) {
                    console.log('   ✅ ChatGPTチャットページに到達しました');
                    break;
                }
            } else {
                console.log('   オンボーディングボタンは見つかりませんでした');
                // create-workspaceページに到達したらチームプラン登録フローへ
                if (currentUrl.includes('create-workspace')) {
                    console.log('   ✅ ChatGPTワークスペース設定ページに到達しました');
                    break;
                }
                // #pricingページに到達したら終了
                if (currentUrl.includes('#pricing') || currentUrl.includes('/pricing')) {
                    console.log('   ✅ ChatGPT pricingページに到達しました');
                    break;
                }
                // chatgpt.comに到達しているか確認
                if (currentUrl.includes('chatgpt.com') && !currentUrl.includes('pricing')) {
                    console.log('   ✅ ChatGPTチャットページに到達しました');
                    break;
                }
                await sleep(2000);
            }
        }
        
        // Step 15: チームプラン登録フロー開始
        console.log('\n💳 Step 15: チームプラン登録フロー');
        
        // #pricing ページに移動
        console.log('   #pricing ページに移動します...');
        await page.goto('https://chatgpt.com/#pricing', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await sleep(randomDelay(4000, 6000));
        console.log('   ✅ #pricing ページに移動しました');
        
        // Claim free offer ボタンをクリック
        console.log('   Claim free offer ボタンを探しています...');
        await page.waitForSelector('[data-testid="select-plan-button-teams-create"]', {
            visible: true,
            timeout: 30000
        });
        
        await page.evaluate(() => {
            const btn = document.querySelector('[data-testid="select-plan-button-teams-create"]');
            if (btn) btn.click();
        });
        console.log('   ✅ Claim free offer ボタンをクリックしました');
        
        // 30秒待機
        console.log('   ⏳ 30秒待機...');
        await sleep(30000);
        
        console.log('\n💰 Step 16: PayPalタブを選択');
        
        // 「PayPal が選択されました」またはBlockDividerがあるか確認（あればスキップ）
        let shouldSkipPayPalSelection = false;
        
        // メインページとiframeの両方でチェック
        const pageFrames = page.frames();
        for (const frame of [page, ...pageFrames]) {
            try {
                const paypalAlreadySelected = await frame.evaluate(() => {
                    // 「PayPal が選択されました」テキストを検索
                    const textElements = Array.from(document.querySelectorAll('p, span, div'));
                    return textElements.some(el => {
                        const text = el.textContent.trim();
                        return text.includes('PayPal が選択されました') ||
                               text.includes('PayPal is selected') ||
                               text.includes('PayPal selected');
                    });
                });
                
                if (paypalAlreadySelected) {
                    shouldSkipPayPalSelection = true;
                    console.log('   ℹ️ PayPalはすでに選択されています');
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        // BlockDividerチェック
        if (!shouldSkipPayPalSelection) {
            const hasBlockDivider = await page.evaluate(() => {
                return !!document.querySelector('.c-BlockDivider--horizontal, .p-BlockDivider');
            });
            if (hasBlockDivider) {
                shouldSkipPayPalSelection = true;
                console.log('   ℹ️ BlockDividerが検出されたため、PayPalタブ選択をスキップします');
            }
        }
        
        if (!shouldSkipPayPalSelection) {
            // PayPalタブを複数の方法で探す
            let paypalClicked = false;
            
            // 方法1: iframe内を探す（Stripeなど）
            try {
                const allFrames = page.frames();
                for (const frame of allFrames) {
                    try {
                        const paypalInFrame = await frame.evaluate(() => {
                            const tabs = Array.from(document.querySelectorAll('[role="tab"], button, div, [id*="paypal"], [data-testid*="paypal"]'));
                            const paypalTab = tabs.find(el => {
                                const html = el.innerHTML || '';
                                const text = el.textContent || '';
                                return html.includes('paypal') || 
                                       text.toLowerCase().includes('paypal') ||
                                       el.id.includes('paypal');
                            });
                            if (paypalTab) {
                                paypalTab.click();
                                return true;
                            }
                            return false;
                        });
                        if (paypalInFrame) {
                            paypalClicked = true;
                            console.log('   ✅ iframe内でPayPalタブを見つけてクリックしました');
                            break;
                        }
                    } catch (frameError) {
                        // このフレームではアクセスできない可能性がある
                        continue;
                    }
                }
            } catch (e) {
                // iframe検索失敗
            }
            
            // 方法2: メインページでdata-testidを探す
            if (!paypalClicked) {
                try {
                    await page.waitForSelector('[data-testid="paypal"]', {
                        visible: true,
                        timeout: 5000
                    });
                    await page.evaluate(() => {
                        const paypalTab = document.querySelector('[data-testid="paypal"]');
                        if (paypalTab) paypalTab.click();
                    });
                    paypalClicked = true;
                } catch (e) {
                    // 方法3: 画像URLやテキストで探す
                    const paypalFound = await page.evaluate(() => {
                        const tabs = Array.from(document.querySelectorAll('[role="tab"], button, div'));
                        const paypalTab = tabs.find(el => {
                            const html = el.innerHTML || '';
                            return html.includes('paypal') || 
                                   el.textContent.toLowerCase().includes('paypal');
                        });
                        if (paypalTab) {
                            paypalTab.click();
                            return true;
                        }
                        return false;
                    });
                    paypalClicked = paypalFound;
                }
            }
            
            if (paypalClicked) {
                console.log('   ✅ PayPalタブを選択しました');
                await sleep(randomDelay(3000, 5000));
            } else {
                console.log('   ⚠️ PayPalタブが見つかりませんでした');
            }
        } else {
            console.log('   ℹ️ BlockDividerが検出されたため、PayPalタブ選択をスキップします');
        }
        
        // Step 17: 請求先住所入力（フランスの住所）
        console.log('\n🏠 Step 17: 請求先住所入力');
        
        // フランスの住所を生成
        const frenchAddress = generateFrenchAddress();
        console.log(`   生成した住所: ${frenchAddress.street}, ${frenchAddress.city}, ${frenchAddress.postalCode}`);
        
        // 名前入力（iframe対応）
        let nameResult = await findElementInPageOrFrames(page, '#billingAddress-nameInput');
        if (!nameResult) {
            nameResult = await findElementInPageOrFrames(page, 'input[name="name"], input[id*="name"]');
        }
        if (nameResult) {
            try {
                await nameResult.element.click();
                await sleep(100);
                await nameResult.element.type('Chihalu', { delay: 0 });
                console.log('   ✅ 名前入力完了');
            } catch (e) {
                // 直接値を設定
                await nameResult.frame.evaluate(() => {
                    const el = document.querySelector('#billingAddress-nameInput') ||
                              document.querySelector('input[name="name"]');
                    if (el) {
                        el.value = 'Chihalu';
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
                console.log('   ✅ 名前入力完了（直接設定）');
            }
        } else {
            console.log('   ⚠️ 名前入力フィールドが見つかりません');
        }
        await sleep(randomDelay(500, 1000));
        
        // 住所1入力（iframe対応）
        let addr1Result = await findElementInPageOrFrames(page, '#billingAddress-addressLine1Input');
        if (!addr1Result) {
            addr1Result = await findElementInPageOrFrames(page, 'input[name="addressLine1"], input[autocomplete*="address-line1"]');
        }
        if (addr1Result) {
            try {
                await addr1Result.element.click();
                await sleep(100);
                await addr1Result.element.type(frenchAddress.street, { delay: 0 });
                console.log('   ✅ 住所1入力完了');
            } catch (e) {
                await addr1Result.frame.evaluate((street) => {
                    const el = document.querySelector('#billingAddress-addressLine1Input') ||
                              document.querySelector('input[name="addressLine1"]');
                    if (el) {
                        el.value = street;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, frenchAddress.street);
                console.log('   ✅ 住所1入力完了（直接設定）');
            }
        } else {
            console.log('   ⚠️ 住所入力フィールドが見つかりません');
        }
        await sleep(randomDelay(500, 1000));
        
        // 郵便番号入力（iframe対応）
        let postalResult = await findElementInPageOrFrames(page, '#billingAddress-postalCodeInput');
        if (!postalResult) {
            postalResult = await findElementInPageOrFrames(page, 'input[name="postalCode"], input[autocomplete*="postal-code"], input[inputmode="numeric"]');
        }
        // ラベルテキストで探す
        if (!postalResult) {
            postalResult = await page.evaluateHandle(() => {
                const labels = Array.from(document.querySelectorAll('label, span, div'));
                const postalLabel = labels.find(el => 
                    el.textContent.includes('郵便番号') || 
                    el.textContent.includes('Postal code') ||
                    el.textContent.includes('ZIP')
                );
                if (postalLabel) {
                    // 同じ親要素内のinputを探す
                    const parent = postalLabel.closest('div[class*="_"]') || postalLabel.parentElement;
                    if (parent) {
                        const input = parent.querySelector('input');
                        if (input) return input;
                    }
                }
                return null;
            });
            if (postalResult) {
                postalResult = { element: postalResult, frame: page, isFrame: false };
            }
        }
        
        if (postalResult) {
            try {
                await postalResult.element.click();
                await sleep(100);
                await postalResult.element.type(frenchAddress.postalCode, { delay: 0 });
                // 入力確定のためblurイベント発火
                await postalResult.element.evaluate(el => {
                    el.blur();
                    el.dispatchEvent(new Event('blur', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                });
                console.log('   ✅ 郵便番号入力完了');
            } catch (e) {
                // 直接値を設定
                await postalResult.frame.evaluate((value) => {
                    const el = document.querySelector('#billingAddress-postalCodeInput') ||
                              document.querySelector('input[name="postalCode"]') ||
                              document.querySelector('input[inputmode="numeric"]');
                    if (el) {
                        el.value = value;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                }, frenchAddress.postalCode);
                console.log('   ✅ 郵便番号入力完了（直接設定）');
            }
        } else {
            console.log('   ⚠️ 郵便番号入力フィールドが見つかりません');
        }
        await sleep(randomDelay(500, 1000));
        
        // 都市入力（iframe対応）
        let cityResult = await findElementInPageOrFrames(page, '#billingAddress-localityInput');
        if (!cityResult) {
            cityResult = await findElementInPageOrFrames(page, 'input[name="locality"], input[autocomplete*="address-level2"]');
        }
        if (cityResult) {
            try {
                await cityResult.element.click();
                await sleep(100);
                await cityResult.element.type(frenchAddress.city, { delay: 0 });
                console.log('   ✅ 都市入力完了');
            } catch (e) {
                await cityResult.frame.evaluate((city) => {
                    const el = document.querySelector('#billingAddress-localityInput') ||
                              document.querySelector('input[name="locality"]');
                    if (el) {
                        el.value = city;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }, frenchAddress.city);
                console.log('   ✅ 都市入力完了（直接設定）');
            }
        } else {
            console.log('   ⚠️ 都市入力フィールドが見つかりません');
        }
        await sleep(randomDelay(500, 1000));
        
        // Step 18: 購読するボタンをクリック（iframe対応）
        console.log('\n✅ Step 18: 購読するボタンをクリック');
        
        // メインページとiframeの両方で探す
        let subscribeClicked = false;
        const allFrames = page.frames();
        for (const frame of [page, ...allFrames]) {
            try {
                const found = await frame.evaluate(() => {
                    // aria-labelで探す
                    const btnByAria = document.querySelector('[aria-label*="サブスクリプション"], [aria-label*="Subscribe"]');
                    if (btnByAria) {
                        btnByAria.click();
                        return true;
                    }
                    
                    // テキストで探す
                    const buttons = Array.from(document.querySelectorAll('button, [type="submit"]'));
                    const subscribeBtn = buttons.find(b => {
                        const text = b.textContent.trim();
                        const aria = b.getAttribute('aria-label') || '';
                        return text.includes('サブスクリプションを登録する') ||
                               text.includes('購読する') || 
                               text.includes('Subscribe') ||
                               aria.includes('サブスクリプション') ||
                               aria.includes('Subscribe');
                    });
                    if (subscribeBtn) {
                        subscribeBtn.click();
                        return true;
                    }
                    return false;
                });
                if (found) {
                    subscribeClicked = true;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
        
        if (subscribeClicked) {
            console.log('   ✅ 購読するボタンをクリックしました');
        } else {
            console.log('   ⚠️ 購読ボタンが見つかりませんでした');
        }
        
        // ページ遷移を待機（PayPal画面への遷移）
        console.log('   ⏳ PayPal画面への遷移を待機...');
        try {
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (e) {
            // ナビゲーションが発生しない場合もある
        }
        await sleep(randomDelay(5000, 8000));
        
        // PayPalブロックチェック（購読ボタンクリック後）
        try {
            const isPayPalBlocked = await page.evaluate(() => {
                const textElements = document.querySelectorAll('h1, h2, p, div, span');
                return Array.from(textElements).some(el => {
                    const text = el.textContent.trim();
                    return text.includes('あなたはブロックされています') ||
                           text.includes('You are blocked') ||
                           text.includes('ブロックされました') ||
                           text.includes('セキュリティチャレンジを読み込めませんでした') ||
                           text.includes('Could not load security challenge');
                });
            });
            
            if (isPayPalBlocked) {
                console.log('\n❌ PayPalアカウントがブロックされています');
                console.log('   手動で解決する必要があります:');
                console.log('   1. PayPalにログインしてセキュリティチェックを完了させる');
                console.log('   2. 別のPayPalアカウントを使用する');
                console.log('   3. しばらく時間を置いてから再試行する');
                
                // スクリーンショットを保存
                await page.screenshot({ path: 'screenshots/paypal_blocked.png', fullPage: true });
                console.log('   📸 スクリーンショット保存: paypal_blocked.png');
                
                throw new Error('PayPalアカウントがブロックされています。手動で対応してください。');
            }
        } catch (e) {
            // ページ遷移中にエラーが出た場合は無視して続行
            if (!e.message.includes('Execution context was destroyed')) {
                throw e;
            }
            // ページが変わった可能性があるので、少し待って再評価
            await sleep(5000);
        }
        
        // Step 19: PayPal同意ボタン（iframe対応）
        console.log('\n💳 Step 19: PayPal同意ボタン');
        
        let consentClicked = false;
        for (let i = 0; i < 10; i++) {
            // メインページとiframeの両方で探す
            for (const frame of [page, ...page.frames()]) {
                try {
                    const found = await frame.evaluate(() => {
                        const btn = document.querySelector('#consentButton') ||
                                   document.querySelector('[data-testid="consentButton"]') ||
                                   document.querySelector('button[id*="consent"], button[data-ppui-info*="button"]');
                        if (btn) {
                            btn.click();
                            return true;
                        }
                        // テキストで探す
                        const buttons = Array.from(document.querySelectorAll('button'));
                        const consentBtn = buttons.find(b => {
                            const text = b.textContent.trim().toLowerCase();
                            return text.includes('同意') || text.includes('agree') || 
                                   text.includes('continue') || text.includes('続行');
                        });
                        if (consentBtn) {
                            consentBtn.click();
                            return true;
                        }
                        return false;
                    });
                    if (found) {
                        consentClicked = true;
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            if (consentClicked) break;
            await sleep(1000);
        }
        
        if (consentClicked) {
            console.log('   ✅ PayPal同意ボタンをクリックしました');
        } else {
            console.log('   ⚠️ PayPal同意ボタンが見つかりませんでした');
        }
        await sleep(randomDelay(5000, 8000));
        
        // Step 20: Payment successful確認
        console.log('\n✅ Step 20: 支払い成功確認');
        let paymentSuccess = false;
        for (let i = 0; i < 10; i++) {
            paymentSuccess = await page.evaluate(() => {
                const heading = document.querySelector('h2');
                return heading && heading.textContent.includes('Payment successful');
            });
            
            if (paymentSuccess) {
                console.log('   ✅ Payment successful を確認しました');
                break;
            }
            await sleep(2000);
        }
        
        if (!paymentSuccess) {
            console.log('   ⚠️ Payment successful が確認できませんでしたが、続行します');
        }
        
        // Step 21: Continueボタン
        console.log('\n➡️ Step 21: Continueボタン');
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const continueBtn = buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('Continue') || text.includes('続行');
            });
            if (continueBtn) continueBtn.click();
        });
        console.log('   ✅ Continueボタンをクリックしました');
        await sleep(randomDelay(4000, 6000));
        
        // Step 22: Workspace名入力
        console.log('\n🏢 Step 22: Workspace名入力');
        const workspaceInput = await page.waitForSelector('input[name="workspace-name"]', {
            visible: true,
            timeout: 15000
        });
        await workspaceInput.click();
        await workspaceInput.type('User', { delay: 0 });
        console.log('   ✅ Workspace名入力完了');
        await sleep(randomDelay(500, 1000));
        
        // Continueボタン
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const continueBtn = buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('Continue') || text.includes('続行');
            });
            if (continueBtn) continueBtn.click();
        });
        console.log('   ✅ Continueボタンをクリックしました');
        await sleep(randomDelay(5000, 8000));
        
        // Step 23: サブスクリプションキャンセル
        console.log('\n❌ Step 23: サブスクリプションキャンセル');
        
        // /admin/billing に移動
        await page.goto('https://chatgpt.com/admin/billing', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        await sleep(randomDelay(4000, 6000));
        console.log('   ✅ 請求ページに移動しました');
        
        // Manage plan ボタンをクリック
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const manageBtn = buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('Manage plan') || text.includes('プラン管理');
            });
            if (manageBtn) manageBtn.click();
        });
        console.log('   ✅ Manage planボタンをクリックしました');
        await sleep(randomDelay(3000, 5000));
        
        // Cancel subscription をクリック
        await page.evaluate(() => {
            const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
            const cancelItem = menuItems.find(item => {
                const text = item.textContent.trim();
                return text.includes('Cancel subscription') || text.includes('サブスクリプションをキャンセル');
            });
            if (cancelItem) cancelItem.click();
        });
        console.log('   ✅ Cancel subscriptionをクリックしました');
        await sleep(randomDelay(3000, 5000));
        
        // メールアドレス入力
        const emailConfirmInput = await page.waitForSelector('#user-email', {
            visible: true,
            timeout: 15000
        });
        await emailConfirmInput.click();
        await emailConfirmInput.type(account.email, { delay: 0 });
        console.log('   ✅ メールアドレス入力完了');
        await sleep(randomDelay(500, 1000));
        
        // Cancel subscription ボタンをクリック
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const cancelBtn = buttons.find(b => {
                const text = b.textContent.trim();
                return text.includes('Cancel subscription') || text.includes('サブスクリプションをキャンセル');
            });
            if (cancelBtn) cancelBtn.click();
        });
        console.log('   ✅ サブスクリプションをキャンセルしました');
        await sleep(randomDelay(5000, 8000));
        
        console.log('\n✅ チームプラン登録・キャンセルフロー完了');
        
        // スクリーンショット
        const screenshotName = browserType === 'brave' ? 'brave' : browserType;
        await page.screenshot({ path: `screenshots/${screenshotName}_signup_success.png`, fullPage: true });
        console.log('   📸 スクリーンショット保存完了');
        
        await sleep(2000);
        await browser.close();
        
        return {
            success: true,
            browser: browserType,
            email: account.email,
            password: account.password,
            name: fullName
        };
        
    } catch (error) {
        await browser.close();
        throw error;
    }
}

// メイン処理（自動フォールバック）
async function signupUnified() {
    console.log('🚀 ChatGPTアカウント作成開始（自動ブラウザ選択）\n');
    
    // ブラウザパスを検出
    const browserPaths = detectBrowserPaths();
    console.log('🔍 ブラウザ検出結果:');
    console.log(`   Brave: ${browserPaths.brave || '未検出'}`);
    console.log(`   Chrome: ${browserPaths.chrome || '未検出'}`);
    console.log('');
    
    // ブラウザ優先順位：Brave → Chrome
    const browsers = [
        { type: 'brave', path: browserPaths.brave },
        { type: 'chrome', path: browserPaths.chrome }
    ].filter(b => b.path);
    
    if (browsers.length === 0) {
        throw new Error('使用可能なブラウザが見つかりません。BraveまたはChromeをインストールしてください。');
    }
    
    // 各ブラウザで試行（失敗時は新しいアカウントでリトライ）
    let lastError = null;
    
    for (const browser of browsers) {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🔄 ${browser.type.toUpperCase()} で試行します`);
        console.log(`${'='.repeat(50)}\n`);
        
        // ブラウザごとに新しいmail.tmアカウントを作成
        console.log('📧 Step 1: mail.tmアカウント作成');
        const mailClient = new MailTMClient();
        const account = await mailClient.createAccount();
        console.log(`   Email: ${account.email}`);
        console.log(`   Pass: ${account.password}`);
        console.log('');
        
        try {
            const result = await signupWithBrowser(browser.type, browser.path, mailClient, account);
            
            console.log('\n✅ サインアップ完了！');
            console.log(`   使用ブラウザ: ${result.browser}`);
            console.log(`   Email: ${result.email}`);
            console.log(`   Password: ${result.password}`);
            console.log(`   Name: ${result.name}`);
            
            return result;
            
        } catch (error) {
            console.error(`\n❌ ${browser.type} で失敗:`, error.message);
            lastError = error;
            
            // 次のブラウザがある場合は続行
            if (browsers.indexOf(browser) < browsers.length - 1) {
                console.log('⏳ 次のブラウザでリトライします...');
                await sleep(3000);
            }
        }
    }
    
    // すべてのブラウザで失敗
    console.error('\n❌ すべてのブラウザで失敗しました');
    throw lastError || new Error('アカウント作成に失敗しました');
}

signupUnified().catch(console.error);
