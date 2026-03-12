/**
 * ChatGPT Workspace無料オファー有効化自動化
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
const { classifyCheckoutProgress } = require('./utils/checkout-progress');
const { createFrenchBillingProfile } = require('./utils/french-billing');
const { withTimeout } = require('./utils/promise-timeout');
const {
    getStripeAddressFieldSelectors,
    getStripeAddressFrameProbeSelectors,
    sortStripeAddressFrameCandidates
} = require('./utils/stripe-address');
const {
    getStripePayPalTabSelectors,
    getStripePayPalKeywords,
    getStripePayPalFrameProbeSelectors,
    pickStripePaymentDirectCandidates,
    pickStripePaymentProbeCandidates,
    sortStripeFrameCandidates
} = require('./utils/stripe-payment');

try {
    var axios = require('axios');
} catch (e) {
    var axios = null;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickElementHandle(handle) {
    try {
        return await handle.evaluate((node) => {
            const target = node.closest('button, [role="button"], [role="tab"], label') || node;
            const style = window.getComputedStyle(target);
            const rect = target.getBoundingClientRect();

            if (target.disabled || target.getAttribute('aria-disabled') === 'true') {
                return false;
            }

            if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) {
                return false;
            }

            target.scrollIntoView({ block: 'center', inline: 'center' });
            target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            if (typeof target.click === 'function') {
                target.click();
            }
            return true;
        });
    } catch (error) {
        return false;
    }
}

async function tryClickExactPayPalHandle(target) {
    const exactHandle = await target
        .waitForSelector('button[data-testid="paypal"], #paypal-tab, button[value="paypal"], [aria-controls="paypal-panel"]', {
            visible: true,
            timeout: 600
        })
        .catch(() => null);

    if (!exactHandle) {
        return { clicked: false, method: 'exact-handle-miss' };
    }

    try {
        await exactHandle.evaluate((node) => {
            node.scrollIntoView({ block: 'center', inline: 'center' });
        });
        await exactHandle.click({ delay: 50 });
        return { clicked: true, method: 'exact-handle-click' };
    } catch (error) {
        const fallbackClicked = await clickElementHandle(exactHandle);
        if (fallbackClicked) {
            return { clicked: true, method: 'exact-handle-fallback' };
        }
    }

    return { clicked: false, method: 'exact-handle-failed' };
}

async function tryClickPayPalTab(target, selectors, options = {}) {
    const { allowDeepSearch = true } = options;
    const keywords = getStripePayPalKeywords();

    for (const selector of selectors) {
        try {
            const handle = await target.$(selector);
            if (!handle) {
                continue;
            }

            const clicked = await clickElementHandle(handle);
            if (clicked) {
                return { clicked: true, selector, method: 'handle-selector' };
            }
        } catch (error) {}
    }

    try {
        const clickables = await target.$$('button, [role="button"], [role="tab"], label');
        for (const handle of clickables) {
            const matched = await handle.evaluate((node) => {
                const normalizedText = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                const ariaLabel = (node.getAttribute('aria-label') || '').trim().toLowerCase();
                const dataTestId = (node.getAttribute('data-testid') || '').trim().toLowerCase();
                const value = (node.getAttribute('value') || '').trim().toLowerCase();
                const hasPayPalGraphic = Boolean(node.querySelector('img[alt*="PayPal" i], img[src*="paypal"], svg[aria-label*="PayPal" i]'));

                return normalizedText.includes('paypal') ||
                    ariaLabel.includes('paypal') ||
                    dataTestId.includes('paypal') ||
                    value === 'paypal' ||
                    hasPayPalGraphic;
            }).catch(() => false);

            if (!matched) {
                continue;
            }

            const clicked = await clickElementHandle(handle);
            if (clicked) {
                return { clicked: true, selector: 'heuristic-paypal-match', method: 'handle-heuristic' };
            }
        }
    } catch (error) {}

    if (!allowDeepSearch) {
        return { clicked: false, selector: null, method: 'quick-not-found' };
    }

    try {
        const deepResult = await withTimeout(() => target.evaluate((selectorList, keywordList) => {
            function isVisible(node) {
                if (!node) {
                    return false;
                }

                const style = window.getComputedStyle(node);
                const rect = node.getBoundingClientRect();
                return !(node.disabled ||
                    node.getAttribute('aria-disabled') === 'true' ||
                    style.display === 'none' ||
                    style.visibility === 'hidden' ||
                    rect.width === 0 ||
                    rect.height === 0);
            }

            function clickNode(node) {
                const targetNode = node.closest('button, [role="button"], [role="tab"], label, a, div') || node;
                if (!isVisible(targetNode)) {
                    return false;
                }

                targetNode.scrollIntoView({ block: 'center', inline: 'center' });
                targetNode.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
                targetNode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
                targetNode.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
                targetNode.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                if (typeof targetNode.click === 'function') {
                    targetNode.click();
                }
                return true;
            }

            function queryDeep(selector, root) {
                const base = root || document;
                const direct = base.querySelector(selector);
                if (direct) {
                    return direct;
                }

                const nodes = base.querySelectorAll('*');
                for (const node of nodes) {
                    if (!node.shadowRoot) {
                        continue;
                    }
                    const found = queryDeep(selector, node.shadowRoot);
                    if (found) {
                        return found;
                    }
                }

                return null;
            }

            function findByHeuristic(root) {
                const base = root || document;
                const candidates = base.querySelectorAll('button, [role="button"], [role="tab"], label, a, div, span, img');
                for (const node of candidates) {
                    const normalizedText = (node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    const ariaLabel = (node.getAttribute('aria-label') || '').trim().toLowerCase();
                    const dataTestId = (node.getAttribute('data-testid') || '').trim().toLowerCase();
                    const value = (node.getAttribute('value') || '').trim().toLowerCase();
                    const alt = (node.getAttribute('alt') || '').trim().toLowerCase();
                    const src = (node.getAttribute('src') || '').trim().toLowerCase();
                    const className = typeof node.className === 'string' ? node.className.toLowerCase() : '';
                    const id = (node.id || '').trim().toLowerCase();
                    const haystack = [normalizedText, ariaLabel, dataTestId, value, alt, src, className, id].join(' ');
                    const matched = keywordList.some((keyword) => haystack.includes(keyword));

                    if (!matched) {
                        continue;
                    }

                    const clickable = node.closest('button, [role="button"], [role="tab"], label, a, div') || node;
                    if (isVisible(clickable)) {
                        return clickable;
                    }
                }

                const nodes = base.querySelectorAll('*');
                for (const node of nodes) {
                    if (!node.shadowRoot) {
                        continue;
                    }
                    const found = findByHeuristic(node.shadowRoot);
                    if (found) {
                        return found;
                    }
                }

                return null;
            }

            for (const selector of selectorList) {
                const found = queryDeep(selector, document);
                if (found && clickNode(found)) {
                    return { clicked: true, selector, method: 'deep-selector' };
                }
            }

            const heuristicNode = findByHeuristic(document);
            if (heuristicNode && clickNode(heuristicNode)) {
                return { clicked: true, selector: 'heuristic-paypal-match', method: 'deep-heuristic' };
            }

            return { clicked: false, selector: null, method: 'deep-search' };
        }, selectors, keywords), 1200, {
            clicked: false,
            selector: null,
            method: 'deep-search-timeout'
        });

        if (deepResult && deepResult.clicked) {
            return deepResult;
        }
    } catch (error) {}

    return { clicked: false, selector: null, method: 'not-found' };
}

async function inspectStripePayPalFrame(frame, probeSelectors) {
    try {
        return await withTimeout(() => frame.evaluate((selectors) => {
            function queryDeep(selector, root) {
                const base = root || document;
                const direct = base.querySelector(selector);
                if (direct) {
                    return direct;
                }

                const nodes = base.querySelectorAll('*');
                for (const node of nodes) {
                    if (!node.shadowRoot) {
                        continue;
                    }
                    const nested = queryDeep(selector, node.shadowRoot);
                    if (nested) {
                        return nested;
                    }
                }

                return null;
            }

            const matchedSelectors = [];
            for (const selector of selectors) {
                if (queryDeep(selector, document)) {
                    matchedSelectors.push(selector);
                }
            }

            return {
                matchedSelectors,
                matchedProbeCount: matchedSelectors.length,
                inputCount: document.querySelectorAll('input, select, textarea, button, [role="tab"]').length
            };
        }, probeSelectors), 1200, {
            matchedSelectors: [],
            matchedProbeCount: 0,
            inputCount: 0,
            timedOut: true
        });
    } catch (error) {
        return {
            matchedSelectors: [],
            matchedProbeCount: 0,
            inputCount: 0,
            timedOut: false
        };
    }
}

async function findBestStripePaymentFrame(page, probeSelectors, baseCandidates = null) {
    const rankedBaseCandidates = Array.isArray(baseCandidates) ? baseCandidates : getStripeFrameCandidates(page);
    const probeCandidates = pickStripePaymentProbeCandidates(rankedBaseCandidates, 2);
    const inspectedByFrame = new Map();

    for (const candidate of probeCandidates) {
        const inspection = await inspectStripePayPalFrame(candidate.frame, probeSelectors);
        inspectedByFrame.set(candidate.frame, {
            matchedProbeCount: inspection.matchedProbeCount,
            matchedSelectors: inspection.matchedSelectors,
            inputCount: inspection.inputCount,
            timedOut: inspection.timedOut
        });
    }

    const mergedCandidates = rankedBaseCandidates.map((candidate) => ({
        ...candidate,
        ...(inspectedByFrame.get(candidate.frame) || {})
    }));
    const ranked = sortStripeFrameCandidates(mergedCandidates);
    const inspectedCandidates = probeCandidates.map((candidate) => ({
        ...candidate,
        ...(inspectedByFrame.get(candidate.frame) || {})
    }));

    return {
        candidates: ranked,
        inspectedCandidates,
        bestCandidate: ranked.find((candidate) => (candidate.matchedProbeCount || 0) > 0) ||
            inspectedCandidates[0] ||
            ranked[0] ||
            null
    };
}

function getStripeFrameCandidates(page) {
    const rawCandidates = page.frames().map((frame) => {
        let url = '';
        let name = '';

        try {
            url = frame.url();
        } catch (error) {}

        try {
            name = frame.name();
        } catch (error) {}

        return { frame, url, name };
    });

    return sortStripeFrameCandidates(rawCandidates);
}

async function inspectStripeAddressFrame(frame, probeSelectors) {
    try {
        return await withTimeout(() => frame.evaluate((selectors) => {
            function queryDeep(selector, root) {
                const base = root || document;
                const direct = base.querySelector(selector);
                if (direct) {
                    return direct;
                }

                const nodes = base.querySelectorAll('*');
                for (const node of nodes) {
                    if (!node.shadowRoot) {
                        continue;
                    }

                    const nested = queryDeep(selector, node.shadowRoot);
                    if (nested) {
                        return nested;
                    }
                }

                return null;
            }

            const matchedSelectors = [];
            for (const selector of selectors) {
                if (queryDeep(selector, document)) {
                    matchedSelectors.push(selector);
                }
            }

            return {
                matchedSelectors,
                matchedProbeCount: matchedSelectors.length,
                inputCount: document.querySelectorAll('input, select, textarea').length
            };
        }, probeSelectors), 1200, {
            matchedSelectors: [],
            matchedProbeCount: 0,
            inputCount: 0,
            timedOut: true
        });
    } catch (error) {
        return {
            matchedSelectors: [],
            matchedProbeCount: 0,
            inputCount: 0,
            timedOut: false
        };
    }
}

async function findBestStripeAddressFrame(page, probeSelectors) {
    const rawCandidates = [];

    for (const frame of page.frames()) {
        let url = '';
        let name = '';

        try {
            url = frame.url();
        } catch (error) {}

        try {
            name = frame.name();
        } catch (error) {}

        const isStripeLike = `${url} ${name}`.toLowerCase().includes('stripe');
        if (!isStripeLike) {
            continue;
        }

        const inspection = await inspectStripeAddressFrame(frame, probeSelectors);
        rawCandidates.push({
            frame,
            url,
            name,
            matchedProbeCount: inspection.matchedProbeCount,
            matchedSelectors: inspection.matchedSelectors,
            inputCount: inspection.inputCount
        });
    }

    const ranked = sortStripeAddressFrameCandidates(rawCandidates);
    return {
        candidates: ranked,
        bestCandidate: ranked.find((candidate) => (candidate.matchedProbeCount || 0) > 0) || ranked[0] || null
    };
}

async function fillStripeFieldHandle(handle, value, fieldName, options = {}) {
    const result = await handle.evaluate((element, payload) => {
        function dispatchTextEvents(target) {
            target.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                inputType: 'insertText',
                data: String(payload.value)
            }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
            target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Tab' }));
        }

        function setNativeValue(target, nextValue) {
            const prototype = target.tagName === 'SELECT'
                ? window.HTMLSelectElement.prototype
                : target.tagName === 'TEXTAREA'
                    ? window.HTMLTextAreaElement.prototype
                    : window.HTMLInputElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
            if (descriptor && descriptor.set) {
                descriptor.set.call(target, nextValue);
            } else {
                target.value = nextValue;
            }
        }

        const tagName = element.tagName;
        const intendedValue = payload.countryMode ? (payload.countryCode || 'FR') : String(payload.value);
        const textValue = payload.countryMode ? (payload.countryName || 'France') : String(payload.value);

        try { element.focus(); } catch (error) {}

        if (tagName === 'SELECT') {
            setNativeValue(element, intendedValue);
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            try { element.blur(); } catch (error) {}
            return {
                ok: element.value === intendedValue,
                tagName,
                currentValue: element.value
            };
        }

        setNativeValue(element, textValue);
        dispatchTextEvents(element);
        try { element.blur(); } catch (error) {}

        return {
            ok: String(element.value || '') === textValue,
            tagName,
            currentValue: String(element.value || '')
        };
    }, {
        value,
        countryMode: Boolean(options.countryMode),
        countryCode: options.countryCode || 'FR',
        countryName: options.countryName || 'France'
    }).catch(() => ({ ok: false, tagName: 'UNKNOWN', currentValue: '' }));

    if (result.ok) {
        console.log(`      ✅ ${fieldName}: ${result.currentValue}`);
        return true;
    }

    try {
        await handle.click({ clickCount: 3 });
        if (options.countryMode) {
            const tagName = await handle.evaluate((element) => element.tagName);
            if (tagName === 'SELECT') {
                await handle.select(options.countryCode || 'FR');
                const selectedValue = await handle.evaluate((element) => element.value);
                if (selectedValue === (options.countryCode || 'FR')) {
                    console.log(`      ✅ ${fieldName}: ${selectedValue}`);
                    return true;
                }
            } else {
                await handle.type(options.countryName || 'France', { delay: 30 });
            }
        } else {
            await handle.type(String(value), { delay: 30 });
        }

        const afterType = await handle.evaluate((element) => String(element.value || ''));
        const expected = options.countryMode ? (options.countryCode || 'FR') : String(value);
        const textExpected = options.countryMode ? (options.countryName || 'France') : String(value);
        if (afterType === expected || afterType === textExpected) {
            console.log(`      ✅ ${fieldName}: ${afterType}`);
            return true;
        }
    } catch (error) {}

    console.log(`      ⚠️ ${fieldName}: 値設定に失敗`);
    return false;
}

async function fillStripeFieldBySelectors(frame, selectors, value, fieldName, options = {}) {
    for (const selector of selectors) {
        try {
            const handle = await frame.waitForSelector(selector, { timeout: 1500, visible: true });
            if (!handle) {
                continue;
            }

            const filled = await fillStripeFieldHandle(handle, value, fieldName, options);
            if (filled) {
                return true;
            }
        } catch (error) {}
    }

    return false;
}

async function collectCheckoutSignals(target, subscribePatterns, confirmPatterns) {
    return await target.evaluate((subscribeKeywords, confirmKeywords) => {
        function normalizeText(node) {
            return [
                node?.textContent || '',
                node?.value || '',
                node?.getAttribute?.('aria-label') || '',
                node?.getAttribute?.('data-testid') || '',
                node?.id || ''
            ].join(' ').replace(/\s+/g, ' ').trim().toLowerCase();
        }

        function collectButtons() {
            return Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"], [role="tab"]'));
        }

        function matches(node, patterns) {
            const text = normalizeText(node);
            return patterns.some((pattern) => text.includes(pattern));
        }

        const buttons = collectButtons();
        const bodyText = (document.body?.innerText || '').toLowerCase();
        const subscribeButtons = buttons.filter((node) => matches(node, subscribeKeywords));
        const confirmButtons = buttons.filter((node) => matches(node, confirmKeywords) || node.id === 'consentButton');

        return {
            hasUnknownError: bodyText.includes('不明なエラーが発生しました') || bodyText.includes('an unknown error occurred'),
            hasSuccess: Boolean(
                document.querySelector('[data-testid="success"], .success-message, #payment-success') ||
                bodyText.includes('payment successful') ||
                window.location.href.includes('/success')
            ),
            hasSubscribeAction: subscribeButtons.length > 0,
            hasDisabledSubscribeAction: subscribeButtons.some((node) => node.disabled || node.getAttribute('aria-disabled') === 'true'),
            hasConfirmAction: confirmButtons.length > 0,
            hasAddressForm: Boolean(document.querySelector('#billingAddress-nameInput, #billingAddress-addressLine1Input, #billingAddress-postalCodeInput')),
            hasPayPalFrame: bodyText.includes('paypal') || Boolean(document.querySelector('#paypal-tab, [data-testid="paypal"], [aria-controls="paypal-panel"]')),
            currentUrl: window.location.href
        };
    }, subscribePatterns, confirmPatterns).catch(() => ({
        hasUnknownError: false,
        hasSuccess: false,
        hasSubscribeAction: false,
        hasDisabledSubscribeAction: false,
        hasConfirmAction: false,
        hasAddressForm: false,
        hasPayPalFrame: false,
        currentUrl: ''
    }));
}

async function collectCheckoutSnapshot(page, browser, subscribePatterns, confirmPatterns) {
    const pageSignals = await collectCheckoutSignals(page, subscribePatterns, confirmPatterns);
    const frameUrls = [];
    let hasUnknownError = pageSignals.hasUnknownError;
    let hasSuccess = pageSignals.hasSuccess;
    let hasSubscribeAction = pageSignals.hasSubscribeAction;
    let hasDisabledSubscribeAction = pageSignals.hasDisabledSubscribeAction;
    let hasConfirmAction = pageSignals.hasConfirmAction;
    let hasAddressForm = pageSignals.hasAddressForm;
    let hasPayPalFrame = pageSignals.hasPayPalFrame;

    for (const frame of page.frames()) {
        let frameUrl = '';
        try {
            frameUrl = frame.url();
        } catch (error) {}

        if (frameUrl) {
            frameUrls.push(frameUrl);
        }

        const frameSignals = await collectCheckoutSignals(frame, subscribePatterns, confirmPatterns);
        hasUnknownError = hasUnknownError || frameSignals.hasUnknownError;
        hasSuccess = hasSuccess || frameSignals.hasSuccess;
        hasSubscribeAction = hasSubscribeAction || frameSignals.hasSubscribeAction;
        hasDisabledSubscribeAction = hasDisabledSubscribeAction || frameSignals.hasDisabledSubscribeAction;
        hasConfirmAction = hasConfirmAction || frameSignals.hasConfirmAction;
        hasAddressForm = hasAddressForm || frameSignals.hasAddressForm;
        hasPayPalFrame = hasPayPalFrame || frameSignals.hasPayPalFrame;
    }

    const popupUrls = [];
    try {
        const pages = await browser.pages();
        for (const browserPage of pages) {
            try {
                const popupUrl = browserPage.url();
                if (popupUrl) {
                    popupUrls.push(popupUrl);
                }
            } catch (error) {}
        }
    } catch (error) {}

    const allUrls = [pageSignals.currentUrl, ...frameUrls, ...popupUrls].filter(Boolean);
    const hasPayPalPage = allUrls.some((url) => url.includes('paypal.com') || url.includes('captcha'));
    const hasPayPalPopup = popupUrls.some((url) => url.includes('paypal.com') || url.includes('captcha'));

    return {
        hasUnknownError,
        hasSuccess,
        hasSubscribeAction,
        hasDisabledSubscribeAction,
        hasConfirmAction,
        hasAddressForm,
        hasPayPalFrame,
        hasPayPalPage,
        hasPayPalPopup,
        currentUrl: pageSignals.currentUrl,
        hadSubscribeContext: true
    };
}

// Enterキー入力を待機（手動モード用）
function waitForEnter(timeoutMs = 60000) {
    return new Promise((resolve) => {
        const stdin = process.stdin;
        
        // タイムアウト設定
        const timeout = setTimeout(() => {
            stdin.removeListener('data', onData);
            stdin.setRawMode(false);
            stdin.pause();
            console.log('\n⏱️  タイムアウトしました。自動的に処理を継続します...');
            resolve();
        }, timeoutMs);
        
        function onData(key) {
            // Enterキー (13) または Ctrl+C (3)
            if (key[0] === 13 || key[0] === 3) {
                clearTimeout(timeout);
                stdin.removeListener('data', onData);
                stdin.setRawMode(false);
                stdin.pause();
                if (key[0] === 3) {
                    process.exit(0);
                }
                resolve();
            }
        }
        
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        stdin.on('data', onData);
    });
}

// HTTPリクエストヘルパー
async function httpRequest(url, options = {}) {
    if (axios) {
        const method = options.method || 'GET';
        const config = {
            url,
            method,
            headers: options.headers || {},
            data: options.body
        };
        const res = await axios(config);
        return res.data;
    } else {
        const res = await fetch(url, options);
        return await res.json();
    }
}

// フランス住所を生成
async function generateFrenchAddress() {
    console.log('🇫🇷 フランス住所を生成中...');
    try {
        const address = createFrenchBillingProfile();
        console.log(`  ✅ 住所生成: ${address.name} / ${address.street}, ${address.postalCode} ${address.city}`);
        return address;
    } catch (error) {
        console.error('  ❌ 住所生成エラー:', error.message);
        return {
            name: 'Camille Martin',
            street: '123 Rue de la Paix',
            postalCode: '75002',
            city: 'Paris',
            countryCode: 'FR',
            countryName: 'France'
        };
    }
}

// 12文字のランダム英数字パスワードを生成
function generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// ==================== generator.email クライアント ====================

async function createGeneratorEmail(browser) {
    console.log('📧 generator.email でアドレスを生成中...');
    const page = await browser.newPage();
    try {
        await page.goto('https://generator.email/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
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
            return el ? el.value || el.textContent.trim() : null;
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

async function getVerificationCode(browser, email, _unused, timeout = 300000) {
    console.log('📧 検証コードを取得中... (generator.email)');

    const inboxUrl = `https://generator.email/${encodeURIComponent(email)}`;
    console.log(`  📬 受信箱: ${inboxUrl}`);

    const page = await browser.newPage();
    try {
        await page.goto(inboxUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });
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

// ブラウザパス検出（Chrome通常版を優先、Dev版は除外）
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
        if (p && fs.existsSync(p)) {
            paths.brave = p;
            break;
        }
    }
    
    // Chrome通常版のみ（Dev版は除外）
    const chromePaths = [
        process.env.CHROME_PATH,
        ...(isMac ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'] : []),
        ...(isWindows ? [
            // 通常版Chrome（優先）
            path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ] : [])
    ];
    
    for (const p of chromePaths) {
        if (p && fs.existsSync(p)) {
            // Chrome Devを除外（パスに"Dev"が含まれる場合はスキップ）
            if (!p.toLowerCase().includes('dev')) {
                paths.chrome = p;
                break;
            }
        }
    }
    
    return paths;
}

// 実際のChromeプロファイルパスを取得
function getChromeProfilePath() {
    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    
    if (isWindows) {
        return path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
    } else if (isMac) {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    } else {
        // Linux
        return path.join(os.homedir(), '.config', 'google-chrome');
    }
}

// 実プロファイルをコピーして使用（安全な方法）
function setupRealProfileCopy() {
    const realProfilePath = getChromeProfilePath();
    const copyProfilePath = path.join(__dirname, '..', '.chrome_real_profile_copy');
    
    // 重要なファイルのみコピー（Cookie、ログイン情報など）
    const filesToCopy = [
        'Cookies',
        'Cookies-journal',
        'Login Data',
        'Login Data-journal',
        'Preferences',
        'Secure Preferences',
        'Bookmarks',
        'History',
        'Favicons'
    ];
    
    const defaultDir = path.join(realProfilePath, 'Default');
    const copyDefaultDir = path.join(copyProfilePath, 'Default');
    
    if (!fs.existsSync(defaultDir)) {
        console.log('  ⚠️ 実プロファイルが見つかりません:', defaultDir);
        return null;
    }
    
    // コピー先ディレクトリ作成
    if (!fs.existsSync(copyDefaultDir)) {
        fs.mkdirSync(copyDefaultDir, { recursive: true });
    }
    
    let copiedCount = 0;
    for (const file of filesToCopy) {
        const src = path.join(defaultDir, file);
        const dest = path.join(copyDefaultDir, file);
        
        if (fs.existsSync(src)) {
            try {
                fs.copyFileSync(src, dest);
                copiedCount++;
            } catch (e) {
                // ロックされているファイルはスキップ
            }
        }
    }
    
    // Local Stateもコピー
    const localStateSrc = path.join(realProfilePath, 'Local State');
    const localStateDest = path.join(copyProfilePath, 'Local State');
    if (fs.existsSync(localStateSrc)) {
        try {
            fs.copyFileSync(localStateSrc, localStateDest);
        } catch (e) {}
    }
    
    console.log(`  📁 実プロファイルから ${copiedCount} ファイルをコピーしました`);
    return copyProfilePath;
}

// ブラウザを起動（フォールバック機構付き）
async function launchBrowserWithFallback() {
    const browserPaths = detectBrowserPaths();
    
    // オプション1: 通常版Chrome + 実プロファイルコピー（最優先）
    if (browserPaths.chrome) {
        console.log(`🔄 Chrome通常版 (${browserPaths.chrome}) を使用`);
        console.log('📁 実プロファイルをコピーして使用します...');
        
        const profilePath = setupRealProfileCopy();
        
        if (profilePath) {
            try {
                const browser = await puppeteer.launch({
                    headless: false,
                    executablePath: browserPaths.chrome,
                    userDataDir: profilePath,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--window-size=1920,1080',
                        '--disable-blink-features=AutomationControlled',
                        '--profile-directory=Default'
                    ],
                    ignoreDefaultArgs: ['--enable-automation']
                });
                console.log('✅ Chrome（実プロファイルコピー付き）で起動しました');
                console.log('   注意: Cookieやログイン情報が引き継がれています');
                return browser;
            } catch (e) {
                console.log('⚠️ 実プロファイル付きChromeの起動に失敗:', e.message);
                console.log('   Chromeが起動中の場合は閉じてください');
            }
        }
        
        // プロファイルコピー失敗時は一時プロファイルでフォールバック
        console.log('🔄 一時プロファイルでフォールバック...');
        try {
            const tmpDir = path.join(__dirname, '..', `.activation_tmp_${Date.now()}`);
            const browser = await puppeteer.launch({
                headless: false,
                executablePath: browserPaths.chrome,
                userDataDir: tmpDir,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--window-size=1920,1080',
                    '--disable-blink-features=AutomationControlled'
                ],
                ignoreDefaultArgs: ['--enable-automation']
            });
            console.log('✅ Chrome（一時プロファイル）で起動しました');
            return browser;
        } catch (e) {
            console.log('⚠️ Chromeの起動に失敗:', e.message);
        }
    }
    
    // オプション2: Puppeteer内蔵Chromium
    console.log('🔄 Puppeteer内蔵Chromiumで起動を試みます...');
    try {
        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1920,1080',
                '--disable-blink-features=AutomationControlled'
            ],
            ignoreDefaultArgs: ['--enable-automation']
        });
        console.log('✅ Puppeteer内蔵Chromiumで起動しました');
        return browser;
    } catch (e) {
        console.log('⚠️ 内蔵Chromiumの起動に失敗:', e.message);
    }
    
    // オプション3: Brave
    if (browserPaths.brave) {
        console.log(`🔄 Brave (${browserPaths.brave}) で起動を試みます...`);
        try {
            const tmpDir = path.join(__dirname, '..', `.activation_tmp_${Date.now()}`);
            const browser = await puppeteer.launch({
                headless: false,
                executablePath: browserPaths.brave,
                userDataDir: tmpDir,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--window-size=1920,1080',
                    '--disable-blink-features=AutomationControlled'
                ],
                ignoreDefaultArgs: ['--enable-automation']
            });
            console.log('✅ Braveで起動しました');
            return browser;
        } catch (e) {
            console.log('⚠️ Braveの起動に失敗:', e.message);
        }
    }
    
    throw new Error('すべてのブラウザ起動方法が失敗しました。Puppeteerを再インストールしてください: npm install puppeteer');
}

// 安全なナビゲーション（再接続対応）
async function safeGoto(page, url, options = {}) {
    const maxRetries = 3;
    let retries = 0;
    
    while (retries < maxRetries) {
        try {
            retries++;
            if (retries > 1) {
                console.log(`  🔄 ナビゲーション再試行 (${retries}/${maxRetries})...`);
            }
            return await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000,
                ...options
            });
        } catch (error) {
            console.log(`  ⚠️ ナビゲーションエラー: ${error.message}`);
            if (retries >= maxRetries) {
                throw error;
            }
            await sleep(3000);
        }
    }
}

// メイン処理
async function activateFreeOffer(workspaceEmail, workspacePassword) {
    console.log('🚀 Workspace無料オファー有効化自動化\n');
    
    const browser = await launchBrowserWithFallback();
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        page.on('error', err => {
            console.log('  ⚠️ ページエラー:', err.message);
        });
        page.on('pageerror', err => {
            console.log('  ⚠️ ページ内エラー:', err.message);
        });
        
        // ===== 1. ChatGPTログイン =====
        console.log('\n📱 Step 1: ChatGPT Login');
        await safeGoto(page, 'https://chatgpt.com/auth/login');
        await sleep(5000);
        
        // Turnstile（Cloudflare）チェック
        console.log('  🔒 Turnstileチェック中...');
        const turnstileDetected = await page.evaluate(() => {
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                if (iframe.src && (
                    iframe.src.includes('challenges.cloudflare.com') ||
                    iframe.src.includes('turnstile')
                )) {
                    return true;
                }
            }
            const labels = document.querySelectorAll('label, span, div');
            for (const el of labels) {
                const text = el.textContent || '';
                if (text.includes('私はロボットではありません') || 
                    text.includes('I\'m not a robot') ||
                    text.includes('Verify you are human')) {
                    return true;
                }
            }
            return false;
        });
        
        if (turnstileDetected) {
            console.log('  ⚠️  Turnstile（Cloudflare）検出！');
            console.log('  ========================================');
            console.log('  手動でチェックボックスをクリックしてください。');
            console.log('  ========================================');
            
            for (let i = 0; i < 60; i++) {
                await sleep(1000);
                const stillThere = await page.evaluate(() => {
                    const iframes = document.querySelectorAll('iframe');
                    for (const iframe of iframes) {
                        if (iframe.src && (
                            iframe.src.includes('challenges.cloudflare.com') ||
                            iframe.src.includes('turnstile')
                        )) {
                            return true;
                        }
                    }
                    return false;
                });
                
                if (!stillThere) {
                    console.log('  ✅ Turnstile突破確認！');
                    break;
                }
                
                if (i % 10 === 0 && i > 0) {
                    console.log(`     待機中... ${i}秒経過`);
                }
            }
            
            await sleep(3000);
        } else {
            console.log('  ✅ Turnstileなし、または既に突破済み');
        }
        
        // 「ログイン」ボタン
        console.log('  🔘 「ログイン」ボタンを探してクリック...');
        const loginBtn = await page.$('button[data-testid="login-button"]');
        if (loginBtn) {
            await loginBtn.click();
            console.log('  ✅ ログインボタンをクリックしました');
        }
        await sleep(5000);
        
        // メールアドレス入力
        console.log('  ✉️ メールアドレスを入力...');
        const emailInput = await page.waitForSelector('input[type="email"]', { timeout: 30000 });
        await emailInput.type(workspaceEmail, { delay: 50 });
        console.log(`  ✅ メールアドレス入力: ${workspaceEmail}`);
        await sleep(5000);
        
        // 続行ボタン
        console.log('  🔘 続行ボタンを探してクリック...');
        const continueClicked = await page.evaluate(() => {
            const form = document.querySelector('form');
            if (form) {
                const buttons = Array.from(form.querySelectorAll('button[type="submit"], button'));
                const btn = buttons.find(b => {
                    const text = b.textContent.trim();
                    return text === '続行' || text === 'Continue' || text === 'Next';
                });
                if (btn) {
                    btn.click();
                    return true;
                }
            }
            return false;
        });
        if (continueClicked) {
            console.log('  ✅ 続行ボタンをクリックしました');
        }
        await sleep(5000);
        
        // パスワードまたは検証コードを待機
        console.log('  ⏳ パスワードまたは検証コード入力欄を待機中...');
        let passwordInput = null;
        let codeInput = null;
        
        while (true) {
            passwordInput = await page.$('input[type="password"], input[name="password"]').catch(() => null);
            codeInput = await page.$('input[maxlength="6"], input[autocomplete="one-time-code"], input[data-testid="otp-input"]').catch(() => null);
            
            if (passwordInput || codeInput) {
                break;
            }
            
            await sleep(1000);
        }
        
        if (codeInput) {
            console.log('📱 検証コード検出');
            const code = await getVerificationCode(browser, workspaceEmail, workspacePassword);
            if (code) {
                await codeInput.type(code, { delay: 100 });
                console.log(`  ✅ 検証コード入力: ${code}`);
            } else {
                console.log('  ⚠️ 検証コード取得失敗');
            }
        } else if (passwordInput) {
            console.log('🔑 パスワード入力');
            await passwordInput.type(workspacePassword, { delay: 50 });
            console.log('  ✅ パスワード入力完了');
        } else {
            console.log('  ⚠️ パスワード/検証コード入力欄が見つかりませんでした');
        }
        await sleep(3000);
        
        // ログイン続行
        console.log('  🔘 ログイン続行ボタンを探してクリック...');
        const loginContinueClicked = await page.evaluate(() => {
            const form = document.querySelector('form');
            if (form) {
                const buttons = Array.from(form.querySelectorAll('button[type="submit"], button'));
                const btn = buttons.find(b => {
                    const text = b.textContent.trim();
                    return text === '続行' || text === 'Continue' || text === 'Verify' || text === 'Log in' || text === 'ログイン' || text === 'Sign in';
                });
                if (btn) {
                    btn.click();
                    return true;
                }
            }
            const allButtons = Array.from(document.querySelectorAll('button[type="submit"], button'));
            const btn = allButtons.find(b => {
                const text = b.textContent.trim().toLowerCase();
                return text.includes('continue') || text.includes('log in') || text.includes('sign in') || text.includes('verify');
            });
            if (btn) {
                btn.click();
                return true;
            }
            return false;
        });
        if (loginContinueClicked) {
            console.log('  ✅ ログイン続行ボタンをクリックしました');
        } else {
            console.log('  ⚠️ ログイン続行ボタンが見つかりませんでした');
        }
        await sleep(5000);
        
        // ログイン成功を確認
        console.log('  🔍 ログイン状態を確認中...');
        while (true) {
            const isLoggedIn = await page.evaluate(() => {
                return window.location.href.includes('/c/') || 
                       window.location.href.includes('/g/') ||
                       document.querySelector('[data-testid="profile-button"]') !== null ||
                       document.querySelector('[data-testid="logout-button"]') !== null ||
                       document.querySelector('button[aria-label="Settings"]') !== null ||
                       document.querySelector('nav') !== null;
            });
            
            if (isLoggedIn) {
                console.log('  ✅ ログイン成功を確認しました');
                break;
            }
            
            await sleep(2000);
        }
        await sleep(3000);
        
        // ===== 2. 無料オファー画面へ =====
        console.log('\n🎁 Step 2: Get Free Offer');
        
        console.log('  🔄 料金ページへ移動中...');
        
        await page.evaluate(() => {
            window.location.hash = '#pricing';
        });
        
        while (true) {
            await sleep(2000);
            
            const isLoaded = await page.evaluate(() => {
                return document.querySelector('[data-testid="select-plan-button-teams-create"]') !== null ||
                       document.querySelector('button[class*="purple"]') !== null ||
                       Array.from(document.querySelectorAll('button')).some(b => 
                           b.textContent.includes('無料オファー') || 
                           b.textContent.includes('Get the free offer') ||
                           b.textContent.includes('Upgrade') ||
                           b.textContent.includes('Subscribe')
                       );
            });
            
            if (isLoaded) {
                console.log('  ✅ 料金ページが読み込まれました');
                break;
            }
            
            const currentUrl = await page.url();
            if (!currentUrl.includes('#pricing')) {
                await page.evaluate(() => {
                    window.location.hash = '#pricing';
                });
            }
        }
        await sleep(3000);
        
        // 「無料オファーを受け取る」ボタン
        console.log('  🔘 無料オファーボタンを探しています...');
        
        let offerBtn = await page.$('button[data-testid="select-plan-button-teams-create"]');
        
        if (offerBtn) {
            console.log('  ✅ 無料オファーボタンを検出しました（data-testid）');
            await offerBtn.click();
            console.log('  ✅ 無料オファーボタンをクリックしました');
            await sleep(30000);
        } else {
            const offerClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button[class*="purple"], button[class*="btn-"], button'));
                const btn = buttons.find(b => {
                    const text = b.textContent.trim();
                    return text === '無料オファーを受け取る' ||
                           text.includes('無料オファー') ||
                           text === 'Get the free offer' ||
                           text.includes('Start your free trial');
                });
                if (btn) {
                    btn.click();
                    return true;
                }
                return false;
            });
            
            if (offerClicked) {
                console.log('  ✅ 無料オファーボタンを検出してクリックしました（テキスト検索）');
                await sleep(30000);
            } else {
                while (true) {
                    const found = await page.evaluate(() => {
                        const buttons = Array.from(document.querySelectorAll('button[class*="purple"], button[class*="btn-"], button'));
                        const btn = buttons.find(b => {
                            const text = b.textContent.trim();
                            return text === '無料オファーを受け取る' ||
                                   text.includes('無料オファー') ||
                                   text === 'Get the free offer' ||
                                   text.includes('Start your free trial') ||
                                   text.toLowerCase().includes('upgrade') ||
                                   text.toLowerCase().includes('subscribe');
                        });
                        if (btn) {
                            btn.click();
                            return true;
                        }
                        return false;
                    });
                    
                    if (found) {
                        console.log('  ✅ 無料オファーボタンを検出してクリックしました');
                        await sleep(30000);
                        break;
                    }
                    
                    await sleep(1000);
                }
            }
        }
        
        // ===== 4. PayPalタブ選択 =====
        console.log('\n💳 Step 4: PayPal Selection');

        const stripePayPalSelectors = getStripePayPalTabSelectors();
        const stripePayPalFrameProbeSelectors = getStripePayPalFrameProbeSelectors();
        const paypalSelectionStart = Date.now();
        const paypalSelectionTimeoutMs = 45000;
        let stripeFrame = null;
        let stripeFrameDetected = false;
        let paypalTabClicked = false;
        let lastPayPalWaitLogAt = 0;
        let stripeCandidateSummaryLogged = false;

        while (!paypalTabClicked && Date.now() - paypalSelectionStart < paypalSelectionTimeoutMs) {
            const frameCandidates = getStripeFrameCandidates(page);
            const directFrameCandidates = pickStripePaymentDirectCandidates(frameCandidates, 3);

            if (!stripeFrame && frameCandidates.length > 0) {
                stripeFrame = frameCandidates[0].frame;
            }

            if (!stripeFrameDetected && frameCandidates.length > 0) {
                stripeFrameDetected = true;
                console.log(`  ✅ Stripe iframeを検出しました (${frameCandidates.length}件)`);
            }

            if (!stripeCandidateSummaryLogged && frameCandidates.length > 0) {
                stripeCandidateSummaryLogged = true;
                const preview = frameCandidates
                    .slice(0, 5)
                    .map((candidate, index) => {
                        const source = candidate.url || candidate.name || 'unknown';
                        return `    ${index + 1}. priority=${candidate.priority} ${source.substring(0, 120)}`;
                    });
                console.log('  📋 Stripe候補フレーム:');
                preview.forEach((line) => console.log(line));
            }

            if (!paypalTabClicked) {
                for (const candidate of directFrameCandidates) {
                    const exactClickResult = await tryClickExactPayPalHandle(candidate.frame);
                    if (exactClickResult.clicked) {
                        stripeFrame = candidate.frame;
                        paypalTabClicked = true;
                        console.log(`  ✅ Stripe iframe内のPayPalタブを選択しました (${exactClickResult.method})`);
                        break;
                    }

                    const clickResult = await tryClickPayPalTab(candidate.frame, stripePayPalSelectors, { allowDeepSearch: false });
                    if (!clickResult.clicked) {
                        continue;
                    }

                    stripeFrame = candidate.frame;
                    paypalTabClicked = true;
                    console.log(`  ✅ Stripe iframe内のPayPalタブを選択しました (${clickResult.selector} / ${clickResult.method})`);
                    break;
                }
            }

            if (!paypalTabClicked) {
                const pageExactClickResult = await tryClickExactPayPalHandle(page);
                if (pageExactClickResult.clicked) {
                    paypalTabClicked = true;
                    console.log(`  ✅ PayPalタブを選択しました (${pageExactClickResult.method})`);
                    break;
                }

                const pageClickResult = await tryClickPayPalTab(page, stripePayPalSelectors, { allowDeepSearch: false });
                if (pageClickResult.clicked) {
                    paypalTabClicked = true;
                    console.log(`  ✅ PayPalタブを選択しました (${pageClickResult.selector} / ${pageClickResult.method})`);
                    break;
                }
            }

            if (!paypalTabClicked && frameCandidates.length > 0) {
                const paymentFrameSearch = await findBestStripePaymentFrame(page, stripePayPalFrameProbeSelectors, frameCandidates);

                if (paymentFrameSearch.bestCandidate) {
                    stripeFrame = paymentFrameSearch.bestCandidate.frame;
                    console.log(`  🎯 PayPal候補フレームを選択しました (probe=${paymentFrameSearch.bestCandidate.matchedProbeCount || 0})`);
                    if (paymentFrameSearch.bestCandidate.matchedSelectors?.length) {
                        console.log(`  🧪 PayPal一致セレクタ: ${paymentFrameSearch.bestCandidate.matchedSelectors.join(', ')}`);
                    }

                    const exactClickResult = await tryClickExactPayPalHandle(stripeFrame);
                    if (exactClickResult.clicked) {
                        paypalTabClicked = true;
                        console.log(`  ✅ Stripe iframe内のPayPalタブを選択しました (${exactClickResult.method})`);
                    } else {
                        const clickResult = await tryClickPayPalTab(stripeFrame, stripePayPalSelectors, { allowDeepSearch: true });
                        if (clickResult.clicked) {
                            paypalTabClicked = true;
                            console.log(`  ✅ Stripe iframe内のPayPalタブを選択しました (${clickResult.selector} / ${clickResult.method})`);
                        }
                    }
                }
            }

            if (!paypalTabClicked && Date.now() - lastPayPalWaitLogAt >= 5000) {
                lastPayPalWaitLogAt = Date.now();
                const elapsedSeconds = Math.round((Date.now() - paypalSelectionStart) / 1000);
                console.log(`  ⏳ PayPalタブを探索中... (${elapsedSeconds}秒経過)`);
            }

            if (!paypalTabClicked) {
                await sleep(1000);
            }
        }

        if (!stripeFrameDetected) {
            console.log('  ⚠️ Stripe iframeを検出できませんでした');
        } else if (!paypalTabClicked) {
            console.log('  ⚠️ PayPalタブを選択できませんでした。住所フォームを直接探索します');
        } else {
            await sleep(5000);
        }
        
        // PayPal選択後、住所入力用のiframeを取得し直す
        console.log('🔑 PayPal選択確認...');
        console.log('  ⏳ 住所入力フォームの読み込みを待機中...');
        await sleep(5000);
        
        let addressFrame = null;
        const addressFrameProbeSelectors = getStripeAddressFrameProbeSelectors();
        let addressCandidateSummaryLogged = false;

        for (let i = 0; i < 15; i++) {
            const addressSearch = await findBestStripeAddressFrame(page, addressFrameProbeSelectors);

            if (!addressCandidateSummaryLogged && addressSearch.candidates.length > 0) {
                addressCandidateSummaryLogged = true;
                console.log('  📋 住所候補フレーム:');
                addressSearch.candidates.slice(0, 5).forEach((candidate, index) => {
                    const source = candidate.url || candidate.name || 'unknown';
                    console.log(`    ${index + 1}. priority=${candidate.priority} probe=${candidate.matchedProbeCount} inputs=${candidate.inputCount} ${source.substring(0, 120)}`);
                });
            }

            if (addressSearch.bestCandidate && (addressSearch.bestCandidate.matchedProbeCount || 0) > 0) {
                addressFrame = addressSearch.bestCandidate.frame;
                console.log(`  ✅ 住所入力用iframeを検出しました (probe=${addressSearch.bestCandidate.matchedProbeCount})`);
                if (addressSearch.bestCandidate.matchedSelectors?.length) {
                    console.log(`  🧪 一致セレクタ: ${addressSearch.bestCandidate.matchedSelectors.join(', ')}`);
                }
                break;
            }
            
            console.log(`    Waiting for address iframe... (${i + 1}/15)`);
            await sleep(2000);
        }
        
        if (!addressFrame) {
            console.log('  🔍 Searching in all frames...');
            const allFrames = page.frames();
            console.log(`    Total frames: ${allFrames.length}`);
            for (let i = 0; i < allFrames.length; i++) {
                try {
                    const url = allFrames[i].url();
                    console.log(`    Frame ${i}: ${url.substring(0, 80)}...`);
                    if (url.includes('stripe') && url.includes('address')) {
                        addressFrame = allFrames[i];
                        console.log('  ✅ Address iframe found in frames list');
                        break;
                    }
                } catch (e) {}
            }
        }
        
        if (!addressFrame) {
            addressFrame = stripeFrame;
        }
        
        if (addressFrame) {
            try {
                const frameUrl = addressFrame.url();
                console.log(`  📋 Address iframe URL: ${frameUrl.substring(0, 100)}...`);
            } catch (e) {}
        }
        
        if (addressFrame) {
            console.log('  ⏳ Waiting for iframe to fully load...');
            try {
                await addressFrame.waitForFunction(() => {
                    return document.readyState === 'complete' ||
                           document.querySelectorAll('input, select').length > 0;
                }, { timeout: 10000 });
                console.log('  ✅ Iframe loaded');
            } catch (e) {
                console.log('  ⚠️ Iframe load wait timeout, continuing anyway');
            }
        }
        
        // ===== 5. Address Entry =====
        console.log('\n🏠 Step 5: Entering French Address');
        const address = await generateFrenchAddress();
        console.log(`  📦 生成プロフィール: ${JSON.stringify(address)}`);
        
        console.log('  📝 Entering address...');
        
        try {
            await page.screenshot({ path: 'debug_address_form.png' });
            console.log('    📸 Screenshot saved: debug_address_form.png');
        } catch (e) {}
        
        let inputSuccess = false;
        const stripeAddressSelectors = getStripeAddressFieldSelectors();
        
        console.log('    📝 Trying page.evaluate() for Shadow DOM access...');
        try {
            const evalResult = await page.evaluate((addr) => {
                console.log('Starting address entry...');
                
                const iframes = document.querySelectorAll('iframe');
                console.log(`Found ${iframes.length} iframes`);
                
                function queryDeep(selector) {
                    let el = document.querySelector(selector);
                    if (el) return el;
                    
                    for (const iframe of document.querySelectorAll('iframe')) {
                        try {
                            if (iframe.contentDocument) {
                                el = iframe.contentDocument.querySelector(selector);
                                if (el) return el;
                            }
                        } catch (e) {}
                    }
                    
                    function searchShadowDOM(root, selector) {
                        const all = root.querySelectorAll('*');
                        for (const elem of all) {
                            if (elem.shadowRoot) {
                                const found = elem.shadowRoot.querySelector(selector);
                                if (found) return found;
                                const nested = searchShadowDOM(elem.shadowRoot, selector);
                                if (nested) return nested;
                            }
                        }
                        return null;
                    }
                    
                    return searchShadowDOM(document, selector);
                }
                
                let count = 0;
                const results = [];
                
                const allInputs = document.querySelectorAll('input, select');
                console.log(`Total inputs on page: ${allInputs.length}`);
                
                const name = queryDeep('#billingAddress-nameInput') || 
                            queryDeep('input[name="name"]') ||
                            queryDeep('input[autocomplete*="name"]');
                if (name) {
                    name.focus();
                    name.value = addr.name;
                    name.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    name.dispatchEvent(new Event('change', { bubbles: true }));
                    name.blur();
                    count++;
                    results.push('name');
                    console.log('Name filled:', addr.name);
                } else {
                    console.log('Name input not found');
                }
                
                const country = queryDeep('#billingAddress-countryInput') ||
                               queryDeep('select[name="country"]');
                if (country) {
                    country.value = addr.countryCode || 'FR';
                    country.dispatchEvent(new Event('input', { bubbles: true }));
                    country.dispatchEvent(new Event('change', { bubbles: true }));
                    count++;
                    results.push('country');
                    console.log('Country filled:', addr.countryCode || 'FR');
                }
                
                const street = queryDeep('#billingAddress-addressLine1Input') ||
                              queryDeep('input[name="addressLine1"]');
                if (street) {
                    street.focus();
                    street.value = addr.street;
                    street.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    street.dispatchEvent(new Event('change', { bubbles: true }));
                    street.blur();
                    count++;
                    results.push('street');
                    console.log('Street filled:', addr.street);
                }
                
                const postal = queryDeep('#billingAddress-postalCodeInput') ||
                              queryDeep('input[name="postalCode"]');
                if (postal) {
                    postal.focus();
                    postal.value = addr.postalCode;
                    postal.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    postal.dispatchEvent(new Event('change', { bubbles: true }));
                    postal.blur();
                    count++;
                    results.push('postal');
                    console.log('Postal filled:', addr.postalCode);
                }
                
                const city = queryDeep('#billingAddress-localityInput') ||
                            queryDeep('input[name="locality"]') ||
                            queryDeep('input[name="city"]');
                if (city) {
                    city.focus();
                    city.value = addr.city;
                    city.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    city.dispatchEvent(new Event('change', { bubbles: true }));
                    city.blur();
                    count++;
                    results.push('city');
                    console.log('City filled:', addr.city);
                }
                
                return { count, fields: results };
            }, address);
            
            console.log(`      Filled fields: ${evalResult.fields.join(', ')} (${evalResult.count}/5)`);
            if (evalResult.count >= 3) {
                console.log('      ✅ Address entered via page.evaluate()');
                inputSuccess = true;
            }
        } catch (e) {
            console.log('      ⚠️ page.evaluate() failed:', e.message);
        }

        if (!inputSuccess && addressFrame) {
            console.log('    📝 Trying addressFrame.evaluate() for Shadow DOM access...');
            try {
                const evalResult = await addressFrame.evaluate((addr, selectors) => {
                    function queryDeep(selector, root) {
                        const base = root || document;
                        const direct = base.querySelector(selector);
                        if (direct) return direct;

                        const nodes = base.querySelectorAll('*');
                        for (const node of nodes) {
                            if (node.shadowRoot) {
                                const found = queryDeep(selector, node.shadowRoot);
                                if (found) return found;
                            }
                        }
                        return null;
                    }

                    function dispatchInputEvents(el) {
                        el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                    }

                    function setNativeValue(el, value) {
                        const prototype = el.tagName === 'SELECT'
                            ? window.HTMLSelectElement.prototype
                            : el.tagName === 'TEXTAREA'
                                ? window.HTMLTextAreaElement.prototype
                                : window.HTMLInputElement.prototype;
                        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
                        if (descriptor && descriptor.set) {
                            descriptor.set.call(el, value);
                        } else {
                            el.value = value;
                        }
                    }

                    function setValue(el, value) {
                        try { el.focus(); } catch (e) {}
                        setNativeValue(el, value);
                        dispatchInputEvents(el);
                        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                        try { el.blur(); } catch (e) {}
                    }

                    function fillBySelectors(list, value, options) {
                        for (const selector of list) {
                            const el = queryDeep(selector);
                            if (!el) continue;

                            if (options && options.country) {
                                if (el.tagName === 'SELECT') {
                                    setNativeValue(el, addr.countryCode || 'FR');
                                    dispatchInputEvents(el);
                                    return selector;
                                }
                                if (el.tagName === 'INPUT') {
                                    setValue(el, addr.countryName || 'France');
                                    return selector;
                                }
                                if (el.tagName === 'BUTTON') {
                                    el.click();
                                    return selector;
                                }
                                continue;
                            }

                            setValue(el, value);
                            return selector;
                        }
                        return null;
                    }

                    const fields = [];
                    if (fillBySelectors(selectors.name, addr.name)) fields.push('name');
                    if (fillBySelectors(selectors.country, 'FR', { country: true })) fields.push('country');
                    if (fillBySelectors(selectors.line1, addr.street)) fields.push('street');
                    if (fillBySelectors(selectors.postal, addr.postalCode)) fields.push('postal');
                    if (fillBySelectors(selectors.city, addr.city)) fields.push('city');

                    return { count: fields.length, fields };
                }, address, stripeAddressSelectors);

                console.log(`      Filled fields (frame.evaluate): ${evalResult.fields.join(', ')} (${evalResult.count}/5)`);
                if (evalResult.count >= 3) {
                    console.log('      ✅ Address entered via addressFrame.evaluate()');
                    inputSuccess = true;
                }
            } catch (e) {
                console.log('      ⚠️ addressFrame.evaluate() failed:', e.message);
            }
        }
        
        if (!inputSuccess && addressFrame) {
            console.log('    📝 Trying verified ElementHandle fill method...');
            let successCount = 0;
            
            if (await fillStripeFieldBySelectors(addressFrame, stripeAddressSelectors.name, address.name, 'Name')) successCount++;
            await sleep(300);

            if (await fillStripeFieldBySelectors(
                addressFrame,
                stripeAddressSelectors.country,
                address.countryCode || 'FR',
                'Country',
                {
                    countryMode: true,
                    countryCode: address.countryCode || 'FR',
                    countryName: address.countryName || 'France'
                }
            )) {
                successCount++;
                await sleep(500);
            }

            if (await fillStripeFieldBySelectors(addressFrame, stripeAddressSelectors.line1, address.street, 'Address')) successCount++;
            await sleep(300);

            if (await fillStripeFieldBySelectors(addressFrame, stripeAddressSelectors.postal, address.postalCode, 'Postal Code')) successCount++;
            await sleep(300);

            if (await fillStripeFieldBySelectors(addressFrame, stripeAddressSelectors.city, address.city, 'City')) successCount++;

            console.log(`      Filled fields (verified handles): ${successCount}/5`);

            inputSuccess = successCount >= 3;
        }
        
        if (!inputSuccess) {
            console.log('  📝 Final fallback: searching on main page...');
            
            const nameInput = await page.$('#billingAddress-nameInput, input[name="name"]');
            if (nameInput) {
                await nameInput.type(address.name, { delay: 50 });
                console.log(`    ✅ Name: ${address.name}`);
            }
            
            const streetInput = await page.$('#billingAddress-addressLine1Input, input[name="addressLine1"]');
            if (streetInput) {
                await streetInput.type(address.street, { delay: 50 });
                console.log(`    ✅ Address: ${address.street}`);
            }
            
            const postalInput = await page.$('#billingAddress-postalCodeInput, input[name="postalCode"]');
            if (postalInput) {
                await postalInput.type(address.postalCode, { delay: 50 });
                console.log(`    ✅ Postal Code: ${address.postalCode}`);
            }
            
            const cityInput = await page.$('#billingAddress-localityInput, input[name="city"], input[name="locality"]');
            if (cityInput) {
                await cityInput.type(address.city, { delay: 50 });
                console.log(`    ✅ City: ${address.city}`);
            }
            
            await sleep(2000);
        }
        
        // エラーモニター関数
        async function monitorAndRetryError() {
            console.log('  🔍 エラーモニターを開始...');
            
            const subscribePatterns = ['subscribe', 'start trial', 'start your free', 'get started', 'continue', '登録', '開始'];
            const confirmPatterns = ['agree', 'confirm', 'pay', 'complete', '同意', '確定', 'authorize'];
            const maxCheckAttempts = 60;
            for (let i = 0; i < maxCheckAttempts; i++) {
                await sleep(2000);
                
                try {
                    const snapshot = await collectCheckoutSnapshot(page, browser, subscribePatterns, confirmPatterns);
                    const progress = classifyCheckoutProgress(snapshot);
                    
                    if (progress.state === 'error') {
                        console.log('  ⚠️ 不明なエラーを検出しました。「もう一度試す」ボタンを探します...');
                        
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
                            console.log('  ✅ 「もう一度試す」ボタンをクリックしました。処理を継続します...');
                            await sleep(5000);
                            return { action: 'retry', reason: progress.reason };
                        } else {
                            console.log('  ⚠️ 「もう一度試す」ボタンが見つかりませんでした');
                        }
                    }
                    
                    if (progress.state === 'success') {
                        console.log('  ✅ 成功画面が検出されました');
                        return { action: 'success', reason: progress.reason };
                    }

                    if (progress.state === 'progress') {
                        console.log(`  ✅ 次のステップへの進行を検出しました (${progress.reason})`);
                        return { action: 'progress', reason: progress.reason };
                    }
                    
                } catch (e) {}
                
                if (i % 15 === 0 && i > 0) {
                    console.log(`  ⏳ エラーモニター実行中... (${i * 2}秒経過)`);
                }
            }
            
            console.log('  ℹ️ エラーモニターを終了します');
            return { action: 'timeout', reason: 'timeout' };
        }
        
        // ===== 6. サブスクリプション登録（Subscribeボタン） =====
        console.log('\n📝 Step 6: Subscribe');
        await sleep(3000);
        
        async function findAndClickButton(textPatterns) {
            if (addressFrame) {
                try {
                    const clicked = await addressFrame.evaluate((patterns) => {
                        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                        const btn = buttons.find(b => {
                            const text = b.textContent.trim().toLowerCase();
                            return patterns.some(p => text.includes(p));
                        });
                        if (btn && !btn.disabled) {
                            btn.click();
                            return true;
                        }
                        return false;
                    }, textPatterns);
                    if (clicked) return 'iframe';
                } catch (e) {}
            }
            
            try {
                const clicked = await page.evaluate((patterns) => {
                    const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                    const btn = buttons.find(b => {
                        const text = b.textContent.trim().toLowerCase();
                        return patterns.some(p => text.includes(p));
                    });
                    if (btn && !btn.disabled) {
                        btn.click();
                        return true;
                    }
                    return false;
                }, textPatterns);
                if (clicked) return 'page';
            } catch (e) {}
            
            return false;
        }
        
        console.log('  🔘 Subscribeボタンを探しています...');
        while (true) {
            const subscribeSource = await findAndClickButton(['subscribe', 'start trial', 'start your free', 'get started', 'continue', '登録', '開始']);
            if (subscribeSource) {
                console.log(`  ✅ Subscribeボタンをクリックしました (${subscribeSource})`);
                await sleep(5000);
                
                const subscribeMonitorResult = await monitorAndRetryError();
                if (subscribeMonitorResult.action === 'retry') {
                    console.log('  🔄 エラーが検出されてリトライしました。処理を継続します...');
                } else if (subscribeMonitorResult.action === 'progress') {
                    console.log(`  ➡️ Subscribe後の進行を確認しました (${subscribeMonitorResult.reason})`);
                }
                break;
            }
            await sleep(1000);
        }
        
        // ===== PayPal手動認証モード =====
        console.log('\n========================================');
        console.log('👤 PayPal手動認証モード');
        console.log('========================================');
        console.log('PayPalのボット検出を回避するため、手動で認証を行ってください。');
        console.log('');
        console.log('【手順】');
        console.log('1. ブラウザでPayPalログイン画面が表示されます');
        console.log('2. PayPalアカウントでログインしてください');
        console.log('3. 支払い承認ボタンをクリックしてください');
        console.log('4. 処理が完了したら、このコンソールでEnterキーを押してください');
        console.log('========================================\n');
        
        console.log('⏳ PayPal画面の読み込みを待機中... (30秒)');
        await sleep(30000);
        
        const currentUrl = await page.url();
        console.log(`📍 現在のURL: ${currentUrl}`);
        
        if (currentUrl.includes('paypal.com') || currentUrl.includes('captcha')) {
            console.log('⚠️  PayPalの認証が必要です。ブラウザで手動操作を行ってください。');
        }
        
        console.log('\n🖱️  ブラウザでPayPal認証を完了してください。');
        console.log('✅ 完了したら、このコンソールでEnterキーを押してください...');
        console.log('⏱️  （タイムアウト: 10分）\n');
        
        await waitForEnter(600000);
        
        console.log('✅ 手動認証が完了しました。自動処理を再開します...\n');
        
        await sleep(5000);
        
        // ===== 7. 同意して続行（必要な場合） =====
        console.log('\n✅ Step 7: Confirm');
        
        let confirmClicked = false;
        for (let i = 0; i < 5; i++) {
            const consentSource = await findAndClickButton(['agree', 'confirm', 'pay', 'complete', '同意', '確定', 'authorize']);
            if (consentSource) {
                console.log(`  ✅ 同意/確定ボタンをクリックしました (${consentSource})`);
                await sleep(5000);
                confirmClicked = true;
                
                const confirmMonitorResult = await monitorAndRetryError();
                if (confirmMonitorResult.action === 'retry') {
                    console.log('  🔄 エラーが検出されてリトライしました。処理を継続します...');
                } else if (confirmMonitorResult.action === 'progress') {
                    console.log(`  ➡️ Confirm後の進行を確認しました (${confirmMonitorResult.reason})`);
                }
                break;
            }
            await sleep(1000);
        }
        
        if (!confirmClicked) {
            console.log('  ℹ️ 確定ボタンが見つかりませんでした（手動で処理済みの可能性）');
        }
        
        console.log('  🔍 最終エラーチェック...');
        const finalMonitorResult = await monitorAndRetryError();
        if (finalMonitorResult.action === 'retry') {
            console.log('  🔄 最終チェックでエラーが検出されてリトライしました');
        }
        
        console.log('\n🎉 Complete! 1-month free offer activated!');
        
        await browser.close();
        
        return {
            success: true,
            workspaceEmail,
            address
        };
        
    } catch (error) {
        console.error('❌ エラー:', error.message);
        try {
            await browser.close();
        } catch (closeError) {
            console.log('  ℹ️ ブラウザは既に閉じられています');
        }
        throw error;
    }
}

// コマンドライン実行
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('使用方法: node puppeteer_activation.js [workspace_email] [workspace_password]');
    console.log('例: node puppeteer_activation.js admin@example.com pass123');
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
