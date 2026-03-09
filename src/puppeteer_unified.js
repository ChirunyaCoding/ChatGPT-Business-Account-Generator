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
    
    // Brave検出（OS別パス）
    const isMac = process.platform === 'darwin';
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
    
    for (const path of bravePaths) {
        if (path && fs.existsSync(path)) {
            paths.brave = path;
            break;
        }
    }
    
    // Chrome検出（OS別パス）
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
        
        // Step 15: 完了待機
        console.log('\n⏳ Step 15: 完了待機（5秒）');
        await sleep(5000);
        console.log('   ✅ アカウント作成プロセス完了');
        
        // ブラウザを閉じる
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
