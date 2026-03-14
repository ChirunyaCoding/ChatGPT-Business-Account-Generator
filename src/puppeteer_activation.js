/**
 * ChatGPT Workspace無料オファー有効化自動化 (スタンドアロン版)
 *
 * 使用方法:
 *   node puppeteer_activation.js [workspace_email] [workspace_password]
 *
 * 例:
 *   node puppeteer_activation.js admin@example.com pass123
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { dismissGeneratorConsentDialog, enableGeneratorConsentGuard } = require('./utils/generator-email');

// ============================================================
// ユーティリティ
// ============================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ============================================================
// フランス住所生成
// ============================================================

function generateFrenchAddress() {
    const firstNames = ['Camille', 'Lucas', 'Emma', 'Hugo', 'Léa', 'Nathan', 'Chloé', 'Thomas', 'Manon', 'Théo'];
    const lastNames = ['Martin', 'Bernard', 'Thomas', 'Petit', 'Robert', 'Richard', 'Durand', 'Leroy', 'Moreau', 'Simon'];
    const streetTypes = ['Rue', 'Avenue', 'Boulevard', 'Allée', 'Place', 'Chemin', 'Impasse'];
    const streetNames = [
        'de la Paix', 'de Paris', 'de la République', 'Victor Hugo', 'Jean Jaurès',
        'de la Liberté', 'des Fleurs', 'du Commerce', 'de l\'Église', 'de la Gare',
        'Saint-Honoré', 'de Rivoli', 'Montmartre', 'du Montparnasse', 'de la Mairie'
    ];
    const cities = [
        { name: 'Paris',       postalPrefix: '75', suffix: () => (Math.floor(Math.random() * 20) + 1).toString().padStart(3,'0') },
        { name: 'Marseille',   postalPrefix: '13', suffix: () => (Math.floor(Math.random() * 900) + 100).toString() },
        { name: 'Lyon',        postalPrefix: '69', suffix: () => (Math.floor(Math.random() * 900) + 100).toString() },
        { name: 'Toulouse',    postalPrefix: '31', suffix: () => (Math.floor(Math.random() * 900) + 100).toString() },
        { name: 'Nice',        postalPrefix: '06', suffix: () => (Math.floor(Math.random() * 900) + 100).toString() },
        { name: 'Nantes',      postalPrefix: '44', suffix: () => (Math.floor(Math.random() * 900) + 100).toString() },
        { name: 'Bordeaux',    postalPrefix: '33', suffix: () => (Math.floor(Math.random() * 900) + 100).toString() },
        { name: 'Lille',       postalPrefix: '59', suffix: () => (Math.floor(Math.random() * 900) + 100).toString() },
        { name: 'Strasbourg',  postalPrefix: '67', suffix: () => (Math.floor(Math.random() * 900) + 100).toString() },
        { name: 'Montpellier', postalPrefix: '34', suffix: () => (Math.floor(Math.random() * 900) + 100).toString() },
    ];

    const city = cities[Math.floor(Math.random() * cities.length)];
    const streetType = streetTypes[Math.floor(Math.random() * streetTypes.length)];
    const streetName = streetNames[Math.floor(Math.random() * streetNames.length)];
    const streetNumber = Math.floor(Math.random() * 150) + 1;
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

    return {
        name: `${firstName} ${lastName}`,
        street: `${streetNumber} ${streetType} ${streetName}`,
        postalCode: `${city.postalPrefix}${city.suffix()}`,
        city: city.name,
        countryCode: 'FR',
        countryName: 'France'
    };
}

// ============================================================
// generator.email クライアント
// ============================================================

async function createGeneratorEmail(browser) {
    console.log('📧 generator.email でアドレスを生成中...');
    const page = await browser.newPage();
    await enableGeneratorConsentGuard(page).catch(() => 0);
    try {
        await page.goto('https://generator.email/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await dismissGeneratorConsentDialog(page).catch(() => 0);
        await sleep(2000);

        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button.btn-success'));
            const btn = btns.find(b => b.textContent.includes('Generate new e-mail'));
            if (btn) btn.click();
        });
        await sleep(2000);

        await page.evaluate(() => {
            const btn = document.querySelector('#copbtn');
            if (btn) btn.click();
        });
        await sleep(500);

        const email = await page.evaluate(() => {
            const el = document.querySelector('#email_ch_text');
            return el ? (el.value || el.textContent || '').trim() : null;
        });

        if (!email || !email.includes('@')) {
            throw new Error('メールアドレスの取得に失敗しました');
        }

        console.log(`  ✅ 生成アドレス: ${email}`);
        return email;
    } finally {
        await page.close();
    }
}

async function getVerificationCode(browser, email, timeout = 300000) {
    console.log('📧 検証コードを取得中... (generator.email)');
    const inboxUrl = `https://generator.email/${encodeURIComponent(email)}`;
    console.log(`  📬 受信箱: ${inboxUrl}`);

    const page = await browser.newPage();
    await enableGeneratorConsentGuard(page).catch(() => 0);
    try {
        await page.goto(inboxUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await dismissGeneratorConsentDialog(page).catch(() => 0);
        await sleep(2000);

        const startTime = Date.now();
        let attempt = 0;

        while (Date.now() - startTime < timeout) {
            attempt++;

            await page.evaluate(() => {
                const btns = Array.from(document.querySelectorAll('button.btn-success'));
                const btn = btns.find(b => b.textContent.includes('Refresh'));
                if (btn) btn.click();
            });
            await dismissGeneratorConsentDialog(page).catch(() => 0);
            await sleep(3000);

            const code = await page.evaluate(() => {
                const subjects = Array.from(document.querySelectorAll('.subj_div_45g45gg'));
                for (const el of subjects) {
                    const text = el.textContent || '';
                    const m = text.match(/Your ChatGPT code is (\d{6})/);
                    if (m) return m[1];
                    if (text.includes('ChatGPT') || text.includes('OpenAI')) {
                        const m2 = text.match(/\b(\d{6})\b/);
                        if (m2) return m2[1];
                    }
                }
                const body = document.body.innerText || '';
                const m3 = body.match(/Your ChatGPT code is (\d{6})/);
                if (m3) return m3[1];
                return null;
            });

            if (code) {
                console.log(`  ✅ 検証コード取得: ${code}`);
                return code;
            }

            if (attempt % 4 === 0) {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                console.log(`  ⏳ メール待機中... (${elapsed}秒経過)`);
            }
            await sleep(5000);
        }

        throw new Error('検証コード取得タイムアウト（5分）');
    } finally {
        await page.close();
    }
}

// ============================================================
// ブラウザ起動（フォールバック機構付き）
// ============================================================

function detectBrowserPaths() {
    const isMac = process.platform === 'darwin';
    const isWindows = process.platform === 'win32';
    const paths = { brave: null, chrome: null };

    const bravePaths = [
        process.env.BRAVE_PATH,
        ...(isMac ? ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'] : []),
        ...(isWindows ? [
            'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
            'C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
        ] : [])
    ];
    for (const p of bravePaths) {
        if (p && fs.existsSync(p)) { paths.brave = p; break; }
    }

    const chromePaths = [
        process.env.CHROME_PATH,
        ...(isMac ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : []),
        ...(isWindows ? [
            path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ] : [])
    ];
    for (const p of chromePaths) {
        if (p && fs.existsSync(p) && !p.toLowerCase().includes('dev')) { paths.chrome = p; break; }
    }

    return paths;
}

function getChromeProfilePath() {
    if (process.platform === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
    } else if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    }
    return path.join(os.homedir(), '.config', 'google-chrome');
}

function setupRealProfileCopy() {
    const realProfilePath = getChromeProfilePath();
    const copyProfilePath = path.join(__dirname, '.chrome_real_profile_copy');
    const filesToCopy = ['Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal', 'Preferences', 'Secure Preferences'];
    const defaultDir = path.join(realProfilePath, 'Default');
    const copyDefaultDir = path.join(copyProfilePath, 'Default');

    if (!fs.existsSync(defaultDir)) return null;
    if (!fs.existsSync(copyDefaultDir)) fs.mkdirSync(copyDefaultDir, { recursive: true });

    let copiedCount = 0;
    for (const file of filesToCopy) {
        const src = path.join(defaultDir, file);
        const dest = path.join(copyDefaultDir, file);
        if (fs.existsSync(src)) {
            try { fs.copyFileSync(src, dest); copiedCount++; } catch (e) {}
        }
    }
    const localStateSrc = path.join(realProfilePath, 'Local State');
    const localStateDest = path.join(copyProfilePath, 'Local State');
    if (fs.existsSync(localStateSrc)) {
        try { fs.copyFileSync(localStateSrc, localStateDest); } catch (e) {}
    }

    console.log(`  📁 実プロファイルから ${copiedCount} ファイルをコピーしました`);
    return copyProfilePath;
}

async function launchBrowserWithFallback() {
    const browserPaths = detectBrowserPaths();

    if (browserPaths.chrome) {
        console.log(`🔄 Chrome (${browserPaths.chrome}) を使用`);
        const profilePath = setupRealProfileCopy();
        if (profilePath) {
            try {
                const browser = await puppeteer.launch({
                    headless: false,
                    executablePath: browserPaths.chrome,
                    userDataDir: profilePath,
                    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--disable-blink-features=AutomationControlled', '--profile-directory=Default'],
                    ignoreDefaultArgs: ['--enable-automation']
                });
                console.log('✅ Chrome（実プロファイルコピー付き）で起動しました');
                return browser;
            } catch (e) {
                console.log('⚠️ 実プロファイル付きChrome起動失敗:', e.message);
            }
        }

        try {
            const tmpDir = path.join(__dirname, `.activation_tmp_${Date.now()}`);
            const browser = await puppeteer.launch({
                headless: false,
                executablePath: browserPaths.chrome,
                userDataDir: tmpDir,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--disable-blink-features=AutomationControlled'],
                ignoreDefaultArgs: ['--enable-automation']
            });
            console.log('✅ Chrome（一時プロファイル）で起動しました');
            return browser;
        } catch (e) {
            console.log('⚠️ Chrome起動失敗:', e.message);
        }
    }

    console.log('🔄 Puppeteer内蔵Chromiumで起動を試みます...');
    try {
        const browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--disable-blink-features=AutomationControlled'],
            ignoreDefaultArgs: ['--enable-automation']
        });
        console.log('✅ Puppeteer内蔵Chromiumで起動しました');
        return browser;
    } catch (e) {
        console.log('⚠️ 内蔵Chromium起動失敗:', e.message);
    }

    if (browserPaths.brave) {
        console.log(`🔄 Brave (${browserPaths.brave}) で起動を試みます...`);
        try {
            const tmpDir = path.join(__dirname, `.activation_tmp_${Date.now()}`);
            const browser = await puppeteer.launch({
                headless: false,
                executablePath: browserPaths.brave,
                userDataDir: tmpDir,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080', '--disable-blink-features=AutomationControlled'],
                ignoreDefaultArgs: ['--enable-automation']
            });
            console.log('✅ Braveで起動しました');
            return browser;
        } catch (e) {
            console.log('⚠️ Brave起動失敗:', e.message);
        }
    }

    throw new Error('すべてのブラウザ起動方法が失敗しました。Puppeteerを再インストールしてください: npm install puppeteer');
}

// ============================================================
// PayPalタブ選択（iframe対応・完全版）
// ============================================================

/**
 * PayPal要素かどうかを判定するヘルパー
 */
async function isPayPalElement(handle) {
    try {
        return await handle.evaluate((node) => {
            const text = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const testId = (node.getAttribute('data-testid') || '').toLowerCase();
            const value = (node.getAttribute('value') || '').toLowerCase();
            const ariaLabel = (node.getAttribute('aria-label') || '').toLowerCase();
            const id = (node.id || '').toLowerCase();
            const hasPayPalImg = Boolean(node.querySelector('img[src*="paypal"], img[alt*="PayPal" i]'));

            return text === 'paypal' ||
                testId.includes('paypal') ||
                value === 'paypal' ||
                ariaLabel.includes('paypal') ||
                id.includes('paypal') ||
                hasPayPalImg;
        });
    } catch (e) {
        return false;
    }
}

/**
 * ターゲット（page or frame）の中でPayPalタブを探してクリック
 */
async function tryClickPayPalInTarget(target) {
    // 方法1: 正確なセレクタで直接クリック
    const exactSelectors = [
        'button[data-testid="paypal"]',
        '#paypal-tab',
        'button[value="paypal"]',
        '[aria-controls="paypal-panel"]',
        '[role="tab"][data-testid*="paypal"]'
    ];

    for (const selector of exactSelectors) {
        try {
            const handle = await target.$(selector);
            if (!handle) continue;

            const box = await handle.boundingBox();
            if (box) {
                await handle.evaluate(el => el.scrollIntoView({ block: 'center' }));
                await sleep(200);
                // boundingBox はページ座標なので page.mouse で確実にクリック
                if (target.mouse) {
                    // target が page の場合
                    await target.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                    await sleep(100);
                    await target.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                } else {
                    // target が frame の場合は evaluate でクリック
                    await handle.evaluate(el => el.click());
                }
                return { clicked: true, selector, method: 'exact-selector' };
            } else {
                await handle.evaluate(el => el.click());
                return { clicked: true, selector, method: 'exact-selector-no-box' };
            }
        } catch (e) {}
    }

    // 方法2: ヒューリスティック検索（button/tab/label）
    try {
        const clickables = await target.$$('button, [role="button"], [role="tab"], label');
        for (const handle of clickables) {
            if (await isPayPalElement(handle)) {
                const box = await handle.boundingBox().catch(() => null);
                if (box) {
                    await handle.evaluate(el => el.scrollIntoView({ block: 'center' }));
                    await sleep(100);
                    if (target.mouse) {
                        await target.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                        await sleep(100);
                        await target.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    } else {
                        await handle.evaluate(el => el.click());
                    }
                    return { clicked: true, selector: 'heuristic', method: 'heuristic-click' };
                } else {
                    await handle.evaluate(el => el.click());
                    return { clicked: true, selector: 'heuristic', method: 'heuristic-evaluate' };
                }
            }
        }
    } catch (e) {}

    // 方法3: evaluate 内で深部検索＋全マウスイベント発火
    try {
        const clicked = await target.evaluate(() => {
            function isVisible(node) {
                if (!node) return false;
                const style = window.getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return !(node.disabled ||
                    node.getAttribute('aria-disabled') === 'true' ||
                    style.display === 'none' ||
                    style.visibility === 'hidden' ||
                    rect.width === 0 || rect.height === 0);
            }
            function fireClick(node) {
                const target = node.closest('button, [role="button"], [role="tab"], label') || node;
                if (!isVisible(target)) return false;
                target.scrollIntoView({ block: 'center' });
                ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(evName => {
                    target.dispatchEvent(new MouseEvent(evName, { bubbles: true, cancelable: true, view: window }));
                });
                if (typeof target.click === 'function') target.click();
                return true;
            }
            function findPayPal(root) {
                const nodes = (root || document).querySelectorAll('button, [role="button"], [role="tab"], label, div, span, img');
                for (const node of nodes) {
                    const haystack = [
                        node.textContent || '',
                        node.getAttribute('data-testid') || '',
                        node.getAttribute('value') || '',
                        node.getAttribute('aria-label') || '',
                        node.id || '',
                        node.getAttribute('src') || '',
                        node.getAttribute('alt') || ''
                    ].join(' ').toLowerCase();
                    if (!haystack.includes('paypal')) continue;
                    const clickable = node.closest('button, [role="button"], [role="tab"], label') || node;
                    if (isVisible(clickable) && fireClick(clickable)) return true;
                }
                return false;
            }
            return findPayPal(document);
        });
        if (clicked) return { clicked: true, selector: 'deep-evaluate', method: 'deep-evaluate' };
    } catch (e) {}

    return { clicked: false, selector: null, method: 'not-found' };
}

/**
 * page.frames() を走査してPayPalタブを選択する（メイン関数）
 */
async function selectPayPalTab(page, timeoutMs = 45000) {
    console.log('\n💳 Step 4: PayPalタブを選択');

    const startTime = Date.now();
    let lastLogAt = 0;
    let loggedFrames = false;

    while (Date.now() - startTime < timeoutMs) {
        const frames = page.frames();

        // フレーム一覧を最初の1回だけログ
        if (!loggedFrames && frames.length > 0) {
            loggedFrames = true;
            const stripeFrames = frames.filter(f => {
                try { return f.url().includes('stripe.com') || f.url().includes('stripecdn'); } catch { return false; }
            });
            console.log(`  ✅ Stripe iframeを検出しました (${stripeFrames.length}件 / 全${frames.length}件)`);
            stripeFrames.slice(0, 5).forEach((f, i) => {
                try { console.log(`    ${i + 1}. ${f.url().slice(0, 120)}`); } catch {}
            });
        }

        // ── 優先度1: Stripe iframe の中を直接探す ──
        const stripeFrames = frames.filter(f => {
            try {
                const url = f.url();
                return url.includes('stripe.com') || url.includes('stripecdn');
            } catch { return false; }
        });

        for (const frame of stripeFrames) {
            try {
                const result = await tryClickPayPalInTarget(frame);
                if (result.clicked) {
                    console.log(`  ✅ Stripe iframe内のPayPalタブを選択しました (${result.method})`);
                    await sleep(randomDelay(3000, 5000));
                    return { success: true, frame };
                }
            } catch (e) {}
        }

        // ── 優先度2: 全iframeを走査 ──
        for (const frame of frames) {
            if (frame === page.mainFrame()) continue;
            try {
                const result = await tryClickPayPalInTarget(frame);
                if (result.clicked) {
                    console.log(`  ✅ iframe内のPayPalタブを選択しました (${result.method})`);
                    await sleep(randomDelay(3000, 5000));
                    return { success: true, frame };
                }
            } catch (e) {}
        }

        // ── 優先度3: メインページで探す ──
        try {
            const result = await tryClickPayPalInTarget(page);
            if (result.clicked) {
                console.log(`  ✅ メインページのPayPalタブを選択しました (${result.method})`);
                await sleep(randomDelay(3000, 5000));
                return { success: true, frame: null };
            }
        } catch (e) {}

        // 5秒ごとにログ
        if (Date.now() - lastLogAt >= 5000) {
            lastLogAt = Date.now();
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`  ⏳ PayPalタブを探索中... (${elapsed}秒経過)`);
        }

        await sleep(1000);
    }

    console.log('  ⚠️ PayPalタブを選択できませんでした。住所フォームを直接探索します');
    return { success: false, frame: null };
}

// ============================================================
// 住所入力（Stripe iframe 対応）
// ============================================================

function setNativeValue(el, value) {
    const prototype = el.tagName === 'SELECT'
        ? HTMLSelectElement.prototype
        : el.tagName === 'TEXTAREA'
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(el, value);
    else el.value = value;
}

async function findAddressFrame(page) {
    const addressSelectors = [
        '#billingAddress-nameInput',
        '#billingAddress-addressLine1Input',
        'input[name="addressLine1"]',
        'input[autocomplete="billing address-line1"]'
    ];

    // まずメインページで確認
    for (const selector of addressSelectors) {
        try {
            const el = await page.$(selector);
            if (el) {
                console.log(`  ✅ 住所フォームをメインページで発見 (${selector})`);
                return page;
            }
        } catch {}
    }

    // 全フレームを走査
    const frames = page.frames();
    let bestFrame = null;
    let bestScore = 0;

    for (const frame of frames) {
        try {
            const url = frame.url();
            if (!url.includes('stripe')) continue;

            let score = 0;
            for (const selector of addressSelectors) {
                try {
                    const el = await frame.$(selector);
                    if (el) score++;
                } catch {}
            }

            if (score > bestScore) {
                bestScore = score;
                bestFrame = frame;
            }
        } catch {}
    }

    if (bestFrame) {
        console.log(`  ✅ 住所入力用iframeを検出しました (一致数: ${bestScore})`);
        return bestFrame;
    }

    console.log('  ⚠️ 住所iframeが見つかりません。メインページにフォールバック');
    return page;
}

async function fillAddressForm(page, address) {
    console.log('\n🏠 Step 5: 住所入力 (フランス)');
    console.log(`  📦 住所: ${address.name} / ${address.street}, ${address.postalCode} ${address.city}`);

    // 住所フォームが表示されるまで少し待機
    await sleep(3000);

    const addressTarget = await findAddressFrame(page);

    // === 共通の入力関数 ===
    async function fillField(selectors, value, label, options = {}) {
        for (const sel of selectors) {
            try {
                const handle = await addressTarget.waitForSelector(sel, { visible: true, timeout: 2000 }).catch(() => null)
                    || await addressTarget.$(sel).catch(() => null);
                if (!handle) continue;

                const filled = await handle.evaluate((el, v, opts) => {
                    function setNative(element, val) {
                        const proto = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
                        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
                        if (desc && desc.set) desc.set.call(element, val);
                        else element.value = val;
                    }
                    try { el.focus(); } catch {}
                    const val = opts.countryMode ? (opts.countryCode || 'FR') : v;
                    const textVal = opts.countryMode ? (opts.countryName || 'France') : v;

                    if (el.tagName === 'SELECT') {
                        setNative(el, val);
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        try { el.blur(); } catch {}
                        return el.value === val;
                    }

                    setNative(el, textVal);
                    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: textVal }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
                    try { el.blur(); } catch {}
                    return true;
                }, value, options);

                if (filled) {
                    console.log(`    ✅ ${label}: ${options.countryMode ? options.countryCode : value}`);
                    return true;
                }
            } catch (e) {}
        }

        // フォールバック: type() で入力
        for (const sel of selectors) {
            try {
                const handle = await addressTarget.$(sel);
                if (!handle) continue;
                await handle.click({ clickCount: 3 });
                await sleep(100);
                if (options.countryMode) {
                    if ((await handle.evaluate(el => el.tagName)) === 'SELECT') {
                        await handle.select(options.countryCode || 'FR');
                    } else {
                        await handle.type(options.countryName || 'France', { delay: 30 });
                    }
                } else {
                    await handle.type(String(value), { delay: 30 });
                }
                console.log(`    ✅ ${label} (type fallback): ${value}`);
                return true;
            } catch (e) {}
        }

        console.log(`    ⚠️ ${label}: 入力失敗`);
        return false;
    }

    let filledCount = 0;

    if (await fillField(['#billingAddress-nameInput', 'input[name="name"]', 'input[autocomplete="billing name"]'], address.name, '氏名')) filledCount++;
    await sleep(300);

    if (await fillField(
        ['#billingAddress-countryInput', 'select[name="country"]', 'select[autocomplete="billing country"]'],
        address.countryCode,
        '国',
        { countryMode: true, countryCode: address.countryCode, countryName: address.countryName }
    )) filledCount++;
    await sleep(500); // 国選択後にフォームが展開するのを待つ

    if (await fillField(['#billingAddress-addressLine1Input', 'input[name="addressLine1"]', 'input[autocomplete="billing address-line1"]'], address.street, '住所')) filledCount++;
    await sleep(300);

    if (await fillField(['#billingAddress-postalCodeInput', 'input[name="postalCode"]', 'input[autocomplete="billing postal-code"]'], address.postalCode, '郵便番号')) filledCount++;
    await sleep(300);

    if (await fillField(['#billingAddress-localityInput', 'input[name="locality"]', 'input[autocomplete="billing address-level2"]'], address.city, '都市名')) filledCount++;

    console.log(`  📝 住所入力完了 (${filledCount}/5 フィールド)`);
    await sleep(1000);
    return filledCount;
}

// ============================================================
// ボタン検索・クリック（汎用）
// ============================================================

async function findAndClickButton(page, textPatterns, label = 'ボタン') {
    // 全フレーム（メインページ含む）を走査
    const targets = [page, ...page.frames().filter(f => f !== page.mainFrame())];

    for (const target of targets) {
        try {
            const clicked = await target.evaluate((patterns) => {
                const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]'));
                const btn = buttons.find(b => {
                    const text = (b.textContent || b.value || '').trim().toLowerCase();
                    return patterns.some(p => text.includes(p.toLowerCase()));
                });
                if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
                    btn.scrollIntoView({ block: 'center' });
                    btn.click();
                    return true;
                }
                return false;
            }, textPatterns);

            if (clicked) {
                console.log(`  ✅ ${label}をクリックしました`);
                return true;
            }
        } catch (e) {}
    }
    return false;
}

// ============================================================
// エラー検出・リトライ
// ============================================================

async function checkAndHandleError(page) {
    try {
        const hasError = await page.evaluate(() => {
            const body = document.body?.innerText?.toLowerCase() || '';
            return body.includes('不明なエラーが発生しました') || body.includes('an unknown error occurred');
        });

        if (hasError) {
            console.log('  ⚠️ 不明なエラーを検出しました。リトライします...');
            const retried = await findAndClickButton(page, ['もう一度試す', 'try again'], '「もう一度試す」');
            if (retried) {
                await sleep(5000);
                return true;
            }
        }
    } catch (e) {}
    return false;
}

// ============================================================
// 安全なナビゲーション
// ============================================================

async function safeGoto(page, url, options = {}) {
    for (let i = 0; i < 3; i++) {
        try {
            if (i > 0) console.log(`  🔄 ナビゲーション再試行 (${i + 1}/3)...`);
            return await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000, ...options });
        } catch (e) {
            console.log(`  ⚠️ ナビゲーションエラー: ${e.message}`);
            if (i >= 2) throw e;
            await sleep(3000);
        }
    }
}

// ============================================================
// メイン処理
// ============================================================

async function activateFreeOffer(workspaceEmail, workspacePassword) {
    console.log('🚀 Workspace無料オファー有効化自動化\n');

    const browser = await launchBrowserWithFallback();

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        page.on('pageerror', err => console.log('  ⚠️ ページ内エラー:', err.message));

        // ============================================================
        // Step 1: ChatGPT ログイン
        // ============================================================
        console.log('\n📱 Step 1: ChatGPT ログイン');
        await safeGoto(page, 'https://chatgpt.com/auth/login');
        await sleep(5000);

        // Turnstile チェック
        const turnstileDetected = await page.evaluate(() => {
            for (const iframe of document.querySelectorAll('iframe')) {
                if ((iframe.src || '').includes('challenges.cloudflare.com') || (iframe.src || '').includes('turnstile')) return true;
            }
            return false;
        });

        if (turnstileDetected) {
            console.log('  ⚠️ Turnstile（Cloudflare）検出！手動でチェックボックスをクリックしてください。');
            for (let i = 0; i < 60; i++) {
                await sleep(1000);
                const stillThere = await page.evaluate(() => {
                    for (const iframe of document.querySelectorAll('iframe')) {
                        if ((iframe.src || '').includes('challenges.cloudflare.com') || (iframe.src || '').includes('turnstile')) return true;
                    }
                    return false;
                });
                if (!stillThere) { console.log('  ✅ Turnstile突破確認！'); break; }
                if (i % 10 === 0 && i > 0) console.log(`     待機中... ${i}秒経過`);
            }
            await sleep(3000);
        } else {
            console.log('  ✅ Turnstileなし');
        }

        // ログインボタン
        const loginBtn = await page.$('button[data-testid="login-button"]');
        if (loginBtn) {
            await loginBtn.click();
            console.log('  ✅ ログインボタンをクリック');
        }
        await sleep(5000);

        // メールアドレス入力
        const emailInput = await page.waitForSelector('input[type="email"]', { timeout: 30000 });
        await emailInput.type(workspaceEmail, { delay: 50 });
        console.log(`  ✅ メールアドレス: ${workspaceEmail}`);
        await sleep(5000);

        // 続行ボタン（「Googleで続行」「Microsoftで続行」等を除外して確実にメール用ボタンを押す）
        console.log('  🔘 続行ボタンをクリック...');
        const continueClicked = await page.evaluate(() => {
            const EXCLUDE_KEYWORDS = ['google', 'microsoft', 'apple', 'facebook', 'github', 'sso', 'saml'];

            // 1. form内のsubmitボタンを優先
            const form = document.querySelector('form');
            if (form) {
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn && !submitBtn.disabled) {
                    const text = submitBtn.textContent.toLowerCase();
                    const isExcluded = EXCLUDE_KEYWORDS.some(k => text.includes(k));
                    if (!isExcluded) {
                        submitBtn.click();
                        return true;
                    }
                }
            }

            // 2. テキストが「続行」「Continue」「Next」のみのボタン（Googleなどを除外）
            const buttons = Array.from(document.querySelectorAll('button'));
            const targetBtn = buttons.find(b => {
                const text = b.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
                const isMatch = text === '続行' || text === 'continue' || text === 'next';
                const isExcluded = EXCLUDE_KEYWORDS.some(k => text.includes(k));
                const isDisabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
                return isMatch && !isExcluded && !isDisabled;
            });
            if (targetBtn) {
                targetBtn.click();
                return true;
            }

            // 3. type="submit" のボタンでGoogleなどでないもの
            const submitBtns = Array.from(document.querySelectorAll('button[type="submit"]'));
            const fallbackBtn = submitBtns.find(b => {
                const text = b.textContent.toLowerCase();
                return !EXCLUDE_KEYWORDS.some(k => text.includes(k)) && !b.disabled;
            });
            if (fallbackBtn) {
                fallbackBtn.click();
                return true;
            }

            return false;
        });

        if (continueClicked) {
            console.log('  ✅ 続行ボタンをクリックしました');
        } else {
            console.log('  ⚠️ 続行ボタンが見つかりません');
        }
        await sleep(5000);

        // パスワード or 検証コード待機
        console.log('  ⏳ パスワード / 検証コード入力欄を待機中...');
        let authInput = null;
        let isCode = false;

        while (!authInput) {
            const pwInput = await page.$('input[type="password"], input[name="password"]').catch(() => null);
            const codeInput = await page.$('input[maxlength="6"], input[autocomplete="one-time-code"]').catch(() => null);
            if (codeInput) { authInput = codeInput; isCode = true; break; }
            if (pwInput) { authInput = pwInput; break; }
            await sleep(1000);
        }

        if (isCode) {
            console.log('  📱 検証コード入力モード');
            const code = await getVerificationCode(browser, workspaceEmail);
            await authInput.type(code, { delay: 100 });
            console.log(`  ✅ 検証コード入力: ${code}`);
        } else {
            console.log('  🔑 パスワード入力モード');
            await authInput.type(workspacePassword, { delay: 50 });
            console.log('  ✅ パスワード入力完了');
        }
        await sleep(3000);

        // ログイン続行（Googleなどのソーシャルログインボタンを除外）
        console.log('  🔘 ログイン続行ボタンをクリック...');
        const loginContinueClicked = await page.evaluate(() => {
            const EXCLUDE_KEYWORDS = ['google', 'microsoft', 'apple', 'facebook', 'github', 'sso', 'saml'];
            const MATCH_KEYWORDS = ['続行', 'continue', 'log in', 'login', 'sign in', 'verify', 'ログイン', '確認'];

            // 1. form内のsubmitボタンを優先
            const form = document.querySelector('form');
            if (form) {
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn && !submitBtn.disabled) {
                    const text = submitBtn.textContent.toLowerCase();
                    if (!EXCLUDE_KEYWORDS.some(k => text.includes(k))) {
                        submitBtn.click();
                        return true;
                    }
                }
            }

            // 2. ログイン系テキストのボタン（ソーシャル除外）
            const buttons = Array.from(document.querySelectorAll('button'));
            const targetBtn = buttons.find(b => {
                const text = b.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
                const isMatch = MATCH_KEYWORDS.some(k => text.includes(k));
                const isExcluded = EXCLUDE_KEYWORDS.some(k => text.includes(k));
                const isDisabled = b.disabled || b.getAttribute('aria-disabled') === 'true';
                return isMatch && !isExcluded && !isDisabled;
            });
            if (targetBtn) { targetBtn.click(); return true; }
            return false;
        });

        if (loginContinueClicked) {
            console.log('  ✅ ログイン続行ボタンをクリックしました');
        } else {
            console.log('  ⚠️ ログイン続行ボタンが見つかりません');
        }
        await sleep(5000);

        // ログイン成功待機
        console.log('  🔍 ログイン状態を確認中...');
        for (let i = 0; i < 60; i++) {
            const isLoggedIn = await page.evaluate(() =>
                window.location.href.includes('/c/') ||
                window.location.href.includes('/g/') ||
                !!document.querySelector('[data-testid="profile-button"]') ||
                !!document.querySelector('nav')
            );
            if (isLoggedIn) { console.log('  ✅ ログイン成功'); break; }
            await sleep(2000);
        }
        await sleep(3000);

        // ============================================================
        // Step 2: 無料オファー画面へ
        // ============================================================
        console.log('\n🎁 Step 2: 無料オファー画面へ移動');

        await page.evaluate(() => { window.location.hash = '#pricing'; });

        // 無料オファーボタンが出るまで待機
        console.log('  ⏳ 無料オファーボタンを待機中...');
        for (let i = 0; i < 60; i++) {
            const found = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                return buttons.some(b => {
                    const text = b.textContent.trim().toLowerCase();
                    return text.includes('無料オファー') ||
                        text.includes('free offer') ||
                        text.includes('start your free') ||
                        b.getAttribute('data-testid') === 'select-plan-button-teams-create';
                });
            });
            if (found) { console.log('  ✅ 無料オファーボタン検出'); break; }
            await sleep(2000);
        }
        await sleep(2000);

        // 無料オファーボタンをクリック
        let offerClicked = false;

        // data-testid で試す
        const offerBtn = await page.$('button[data-testid="select-plan-button-teams-create"]');
        if (offerBtn) {
            await offerBtn.click();
            console.log('  ✅ 無料オファーボタンをクリック (data-testid)');
            offerClicked = true;
        }

        if (!offerClicked) {
            offerClicked = await findAndClickButton(
                page,
                ['無料オファー', 'free offer', 'start your free', 'get the free', 'upgrade', 'subscribe'],
                '無料オファー'
            );
        }

        if (!offerClicked) {
            console.log('  ⚠️ 無料オファーボタンが見つかりません。手動でクリックしてください (30秒待機)');
        }

        // チェックアウトページへの遷移を待機（最大30秒）
        console.log('  ⏳ チェックアウトページへの遷移を待機中...');
        for (let i = 0; i < 15; i++) {
            const url = page.url();
            if (url.includes('checkout') || url.includes('billing') || url.includes('upgrade')) {
                console.log(`  ✅ チェックアウトページを検出: ${url.slice(0, 80)}`);
                break;
            }
            // Stripe iframeが出現したらOK
            const hasStripe = page.frames().some(f => {
                try { return f.url().includes('stripe'); } catch { return false; }
            });
            if (hasStripe) {
                console.log('  ✅ Stripe iframe検出 - チェックアウトページを確認');
                break;
            }
            await sleep(2000);
        }
        await sleep(3000);

        // ============================================================
        // Step 3: エラー確認
        // ============================================================
        await checkAndHandleError(page);

        // ============================================================
        // Step 4: PayPalタブを選択（iframe完全対応版）
        // ============================================================
        const paypalResult = await selectPayPalTab(page, 45000);

        // PayPal選択後に住所フォームが展開するまで待機
        console.log('  ⏳ 住所フォームの読み込みを待機中...');
        await sleep(5000);

        // ============================================================
        // Step 5: 住所入力
        // ============================================================
        const address = generateFrenchAddress();
        await fillAddressForm(page, address);

        // ============================================================
        // Step 6: Subscribeボタンをクリック
        // ============================================================
        console.log('\n📝 Step 6: Subscribe');
        await sleep(2000);

        let subscribed = false;
        for (let attempt = 0; attempt < 30; attempt++) {
            // エラーチェック
            const retried = await checkAndHandleError(page);
            if (retried) continue;

            subscribed = await findAndClickButton(
                page,
                ['subscribe', 'start trial', 'start your free', 'get started', '登録', '開始', 'continue'],
                'Subscribe'
            );
            if (subscribed) {
                await sleep(5000);
                await checkAndHandleError(page);
                break;
            }
            await sleep(1000);
        }

        if (!subscribed) {
            console.log('  ⚠️ Subscribeボタンが見つかりませんでした');
        }

        // ============================================================
        // Step 7: PayPal ポップアップ / リダイレクト を自動待機
        // ============================================================
        console.log('\n💳 Step 7: PayPal 自動処理');
        console.log('  ⏳ PayPal ページへの遷移を待機中... (最大3分)');

        // PayPal ページが開くまで待機（ポップアップ or リダイレクト）
        let paypalPage = null;
        const paypalWaitStart = Date.now();
        const paypalWaitTimeoutMs = 180000;

        while (Date.now() - paypalWaitStart < paypalWaitTimeoutMs) {
            // ポップアップ（新しいタブ）として開いた場合
            try {
                const allPages = await browser.pages();
                for (const p of allPages) {
                    const u = p.url();
                    if (u.includes('paypal.com') && p !== page) {
                        paypalPage = p;
                        break;
                    }
                }
            } catch {}

            // メインページ自体が paypal.com にリダイレクトした場合
            if (!paypalPage) {
                const u = page.url();
                if (u.includes('paypal.com')) {
                    paypalPage = page;
                }
            }

            if (paypalPage) {
                console.log(`  ✅ PayPal ページを検出: ${paypalPage.url().slice(0, 80)}`);
                break;
            }

            await sleep(1500);
        }

        if (!paypalPage) {
            console.log('  ⚠️ PayPal ページが検出できませんでした。続行します');
        } else {
            // PayPal 上で「同意して続行」「Agree and Continue」「Log In」などを自動クリック
            await paypalPage.bringToFront();
            await sleep(3000);

            // PayPal ログインが必要な場合は paypal_session_manager のセッションを使用
            // ここでは同意ボタン（consentButton）を自動クリックするループ
            const paypalActionStart = Date.now();
            const paypalActionTimeoutMs = 120000;
            let paypalDone = false;

            while (Date.now() - paypalActionStart < paypalActionTimeoutMs) {
                const currentPaypalUrl = paypalPage.url();
                console.log(`  📍 PayPal URL: ${currentPaypalUrl.slice(0, 80)}`);

                // 成功 / チャットGPT に戻ったら完了
                if (currentPaypalUrl.includes('chatgpt.com') || currentPaypalUrl.includes('openai.com')) {
                    console.log('  ✅ ChatGPT へリダイレクト確認 → PayPal 処理完了');
                    paypalDone = true;
                    break;
                }

                // #consentButton（同意して続行）
                const consentClicked = await paypalPage.evaluate(() => {
                    const btn = document.querySelector('#consentButton');
                    if (btn && !btn.disabled) { btn.click(); return true; }
                    return false;
                }).catch(() => false);
                if (consentClicked) {
                    console.log('  ✅ PayPal #consentButton をクリックしました');
                    await sleep(5000);
                    continue;
                }

                // 汎用: 同意・承認・続行系ボタン
                const genericClicked = await paypalPage.evaluate(() => {
                    const KEYWORDS = ['agree and continue', 'agree & continue', 'agree', 'authorize', 'approve', 'continue', 'pay now', '同意して続行', '承認', '支払う'];
                    const EXCLUDE = ['cancel', 'back', 'キャンセル', '戻る', 'decline'];
                    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a[role="button"]'));
                    const btn = buttons.find(b => {
                        const text = (b.textContent || b.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
                        return KEYWORDS.some(k => text.includes(k)) && !EXCLUDE.some(k => text.includes(k)) && !b.disabled;
                    });
                    if (btn) { btn.click(); return btn.textContent.trim(); }
                    return null;
                }).catch(() => null);

                if (genericClicked) {
                    console.log(`  ✅ PayPal ボタンをクリック: "${genericClicked}"`);
                    await sleep(5000);
                    continue;
                }

                // ページが変わるのを待つ
                await sleep(2000);
            }

            if (!paypalDone) {
                console.log('  ⚠️ PayPal 処理タイムアウト。続行します');
            }

            // メインページに戻す
            try { await page.bringToFront(); } catch {}
            await sleep(3000);
        }

        // ============================================================
        // Step 8: 同意・確定ボタン（ChatGPT 側 / 必要な場合）
        // ============================================================
        console.log('\n✅ Step 8: 同意/確定');

        for (let i = 0; i < 10; i++) {
            const retried = await checkAndHandleError(page);
            if (retried) continue;

            const confirmClicked = await findAndClickButton(
                page,
                ['agree', 'confirm', 'pay', 'complete', '同意', '確定', 'authorize', 'approve'],
                '同意/確定'
            );
            if (confirmClicked) {
                await sleep(5000);
                await checkAndHandleError(page);
                break;
            }
            await sleep(1000);
        }

        // 最終エラーチェック
        console.log('  🔍 最終エラーチェック...');
        await checkAndHandleError(page);

        // ============================================================
        // Step 9: 完了
        // ============================================================
        console.log('\n🎉 Complete! 1-month free offer activated!');

        await browser.close();

        return { success: true, workspaceEmail, address };

    } catch (error) {
        console.error('❌ エラー:', error.message);
        try { await browser.close(); } catch {}
        throw error;
    }
}

// ============================================================
// エントリーポイント
// ============================================================

const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('使用方法: node puppeteer_activation.js [workspace_email] [workspace_password]');
    console.log('例:       node puppeteer_activation.js admin@example.com pass123');
    process.exit(1);
}

const [workspaceEmail, workspacePassword] = args;

activateFreeOffer(workspaceEmail, workspacePassword)
    .then(result => {
        console.log('\n✅ Success:', result);
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Failed:', error.message);
        process.exit(1);
    });

module.exports = { activateFreeOffer };
