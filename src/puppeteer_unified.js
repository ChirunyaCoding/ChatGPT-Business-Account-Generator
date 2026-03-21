/**
 * Puppeteer Unified - ChatGPTアカウント作成 (Chrome実ブラウザ)
 * https://chatgpt.com/auth/login から開始
 */

const puppeteer = require('puppeteer');
const {
    containsUnsupportedEmailError,
    createRetryableSignupError,
    formatTimeoutLimitLabel,
    GENERATOR_SESSION_TIMEOUT_CODE,
    getCreateAccountTimingProfile,
    isTransientNavigationError,
    isUnlimitedTimeoutMs,
    resolveCreateAccountKeepOpen,
    scaleCreateAccountDelay,
    shouldRetrySignupAttempt,
    withExecutionContextRetry
} = require('./utils/create-account-runtime');
const {
    containsGeneratorUnsupportedEmailStatus,
    createGeneratorFallbackEmail,
    dismissGeneratorConsentDialog,
    enableGeneratorConsentGuard,
    extractGeneratorEmailAddress,
    extractGeneratorApprovedUptimeDays,
    extractGeneratorVerificationCode,
    GENERATOR_EMAIL_MIN_APPROVED_UPTIME_DAYS,
    GENERATOR_EMAIL_SESSION_TIMEOUT_MS,
    GENERATOR_EMAIL_UNSUPPORTED_RETRY_LIMIT,
    hasGeneratorSessionTimedOut,
    isGeneratorApprovedEmailStatus,
    isGeneratorApprovedUptimeAccepted,
    shouldRestartGeneratorEmailFlow
} = require('./utils/generator-email');
const {
    BUSINESS_SIGNUP_CTA_TEXTS,
    BUSINESS_SIGNUP_CODE_SELECTORS,
    BUSINESS_SIGNUP_COOKIE_TEXTS,
    BUSINESS_SIGNUP_DIRECT_URL,
    BUSINESS_SIGNUP_EMAIL_SELECTORS,
    BUSINESS_SIGNUP_PASSWORD_LINK_SELECTORS,
    BUSINESS_SIGNUP_PASSWORD_SELECTORS,
    classifyBusinessSignupEntryState,
    classifyEmailNextStepState,
    isPasswordStepState
} = require('./utils/business-signup');
const {
    detectBrowserPaths,
    getChromeOnlyBrowserCandidates,
    launchRealBrowser
} = require('./utils/real-browser-launch');

const CREATE_ACCOUNT_TIMING = getCreateAccountTimingProfile();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
    const scaled = scaleCreateAccountDelay(min, max, {
        delayScale: CREATE_ACCOUNT_TIMING.delayScale
    });
    return Math.floor(Math.random() * (scaled.max - scaled.min + 1)) + scaled.min;
}

function normalizeText(value = '') {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createGeneratorSessionTimeoutError() {
    const timeoutMinutes = Math.ceil(GENERATOR_EMAIL_SESSION_TIMEOUT_MS / 60000);
    return createRetryableSignupError(
        `generator.email に ${timeoutMinutes}分以上滞在したため、ブラウザを閉じて最初からやり直します`,
        GENERATOR_SESSION_TIMEOUT_CODE
    );
}

async function gotoWithRetry(page, url, options) {
    const maxAttempts = 4;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await withExecutionContextRetry(() => page.goto(url, options), {
                retries: 2,
                delayMs: 800
            });
        } catch (error) {
            lastError = error;

            if (!isTransientNavigationError(error) || attempt === maxAttempts) {
                break;
            }

            const waitMs = 1200 * attempt;
            console.log(`   ⚠️ 一時的な通信エラーを検出したため再試行します (${attempt}/${maxAttempts - 1})`);
            await page.goto('about:blank', {
                waitUntil: 'domcontentloaded',
                timeout: CREATE_ACCOUNT_TIMING.aboutBlankTimeoutMs
            }).catch(() => null);
            await sleep(waitMs);
        }
    }

    if (isTransientNavigationError(lastError)) {
        throw createRetryableSignupError(
            `一時的な通信エラーのため再試行します: ${lastError.message}`,
            'TRANSIENT_NAVIGATION'
        );
    }

    throw lastError;
}

async function evaluateWithRetry(page, pageFunction, ...args) {
    return withExecutionContextRetry(() => page.evaluate(pageFunction, ...args), {
        retries: 2,
        delayMs: 500
    });
}

async function hasAnySelector(page, selectors) {
    return withExecutionContextRetry(async () => {
        return evaluateWithRetry(page, (candidates) => {
            const isVisible = (element) => {
                if (!element) {
                    return false;
                }

                const style = window.getComputedStyle(element);
                return style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    element.getClientRects().length > 0;
            };

            return candidates.some((selector) => {
                const element = document.querySelector(selector);
                return isVisible(element);
            });
        }, selectors);
    }, {
        retries: 2,
        delayMs: 500
    });
}

async function findFirstVisibleSelector(page, selectors) {
    return withExecutionContextRetry(async () => {
        return evaluateWithRetry(page, (candidates) => {
            const isVisible = (element) => {
                if (!element) {
                    return false;
                }

                const style = window.getComputedStyle(element);
                return style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    element.getClientRects().length > 0;
            };

            for (const selector of candidates) {
                const element = document.querySelector(selector);
                if (isVisible(element)) {
                    return selector;
                }
            }

            return null;
        }, selectors);
    }, {
        retries: 2,
        delayMs: 500
    });
}

async function waitForAnyVisibleSelector(page, selectors, timeout = CREATE_ACCOUNT_TIMING.selectorTimeoutMs, diagnosticsLabel = '入力欄') {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const selector = await findFirstVisibleSelector(page, selectors);
        if (selector) {
            return selector;
        }

        await sleep(300);
    }

    const diagnostics = await evaluateWithRetry(page, () => {
        return Array.from(document.querySelectorAll('input, button, a')).slice(0, 50).map((element) => ({
            tag: element.tagName.toLowerCase(),
            type: element.getAttribute('type'),
            name: element.getAttribute('name'),
            id: element.id,
            placeholder: element.getAttribute('placeholder'),
            text: (element.textContent || '').trim()
        }));
    }).catch(() => []);

    throw new Error(`${diagnosticsLabel}が見つかりません (URL: ${page.url()}) elements: ${JSON.stringify(diagnostics)}`);
}

async function getBusinessSignupEntrySnapshot(page) {
    const snapshot = await evaluateWithRetry(page, (emailSelectors, cookieTexts) => {
        const isVisible = (element) => {
            if (!element) {
                return false;
            }

            const style = window.getComputedStyle(element);
            return style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                element.getClientRects().length > 0;
        };

        const buttonTexts = Array.from(document.querySelectorAll('button, a'))
            .filter((element) => isVisible(element))
            .map((element) => [
                element.textContent || '',
                element.getAttribute('aria-label') || '',
                element.getAttribute('data-dd-action-name') || ''
            ].join(' ').trim())
            .filter(Boolean);

        const pageText = document.body?.innerText || '';
        const hasEmailField = emailSelectors.some((selector) => {
            const element = document.querySelector(selector);
            return isVisible(element);
        });
        const hasChatShellComposer = Boolean(
            document.querySelector('#composer-plus-btn') ||
            document.querySelector('#upload-photos') ||
            document.querySelector('#upload-camera')
        );
        const hasCookieBanner = cookieTexts.some((candidate) =>
            pageText.includes(candidate)
        );

        return {
            hasEmailField,
            buttonTexts,
            pageText,
            url: window.location.href,
            hasChatShellComposer,
            hasCookieBanner
        };
    }, BUSINESS_SIGNUP_EMAIL_SELECTORS, BUSINESS_SIGNUP_COOKIE_TEXTS).catch(() => ({
        hasEmailField: false,
        buttonTexts: [],
        pageText: '',
        url: page.url(),
        hasChatShellComposer: false,
        hasCookieBanner: false
    }));

    return {
        hasEmailField: snapshot.hasEmailField,
        buttonTexts: snapshot.buttonTexts,
        text: snapshot.pageText,
        url: snapshot.url,
        hasChatShellComposer: snapshot.hasChatShellComposer,
        hasCookieBanner: snapshot.hasCookieBanner,
        state: classifyBusinessSignupEntryState({
            url: snapshot.url,
            text: snapshot.pageText,
            hasEmailField: snapshot.hasEmailField,
            buttonTexts: snapshot.buttonTexts,
            hasChatShellComposer: snapshot.hasChatShellComposer,
            hasCookieBanner: snapshot.hasCookieBanner
        })
    };
}

async function waitForBusinessSignupEntryState(page, timeout = CREATE_ACCOUNT_TIMING.entryStateTimeoutMs) {
    const start = Date.now();
    let lastSnapshot = {
        hasEmailField: false,
        buttonTexts: [],
        state: 'unknown'
    };

    while (Date.now() - start < timeout) {
        lastSnapshot = await getBusinessSignupEntrySnapshot(page);
        if (lastSnapshot.state !== 'unknown') {
            return lastSnapshot;
        }

        await sleep(500);
    }

    return lastSnapshot;
}

async function dismissCookieBannerIfPresent(page) {
    const buttonSelector = 'button, a';
    const rejectTexts = [
        '必須項目以外を拒否する',
        'reject non-essential',
        'reject all'
    ];
    const acceptTexts = [
        'すべて受け入れる',
        'accept all'
    ];

    const rejected = await clickElementByText(page, buttonSelector, rejectTexts).catch(() => false);
    if (rejected) {
        console.log('   Cookieバナーを拒否しました');
        await sleep(CREATE_ACCOUNT_TIMING.shortDelayMs);
        return true;
    }

    const accepted = await clickElementByText(page, buttonSelector, acceptTexts).catch(() => false);
    if (accepted) {
        console.log('   Cookieバナーを閉じました');
        await sleep(CREATE_ACCOUNT_TIMING.shortDelayMs);
        return true;
    }

    return false;
}

async function clearOpenAIAuthState(page) {
    const session = await page.target().createCDPSession().catch(() => null);
    if (!session) {
        return 0;
    }

    let clearedOrigins = 0;

    try {
        const origins = [
            'https://chatgpt.com',
            'https://auth.openai.com',
            'https://openai.com'
        ];

        for (const origin of origins) {
            try {
                await session.send('Storage.clearDataForOrigin', {
                    origin,
                    storageTypes: 'all'
                });
                clearedOrigins += 1;
            } catch (error) {
                // origin 単位の削除失敗は無視する
            }
        }
    } finally {
        await session.detach().catch(() => null);
    }

    if (clearedOrigins > 0) {
        console.log('   🧼 ChatGPT関連セッションを初期化しました');
    }

    return clearedOrigins;
}

async function prepareBusinessSignupEmailEntry(page) {
    let lastSnapshot = null;
    const recoveryUrls = [BUSINESS_SIGNUP_DIRECT_URL, BUSINESS_SIGNUP_DIRECT_URL];

    for (let attempt = 0; attempt < recoveryUrls.length + 1; attempt++) {
        lastSnapshot = await waitForBusinessSignupEntryState(
            page,
            attempt === 0
                ? CREATE_ACCOUNT_TIMING.entryStateTimeoutMs
                : CREATE_ACCOUNT_TIMING.retryEntryStateTimeoutMs
        );

        if (lastSnapshot.state === 'cookie') {
            const dismissed = await dismissCookieBannerIfPresent(page);
            if (dismissed) {
                continue;
            }
        }

        if (lastSnapshot.state === 'email') {
            console.log('   メール入力欄が既に表示されているため、CTAクリックをスキップします');
            return lastSnapshot;
        }

        if (lastSnapshot.state === 'cta') {
            const signupClicked = await clickElementByText(
                page,
                'button, a',
                BUSINESS_SIGNUP_CTA_TEXTS,
                { waitForNavigation: true, navigationTimeout: CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs }
            );

            if (signupClicked) {
                console.log('   ボタンをクリックしました');
                await sleep(randomDelay(4000, 6000));
                continue;
            }
        }

        if (attempt >= recoveryUrls.length) {
            break;
        }

        console.log(`   ⚠️ チーム登録フォームを再取得します (${attempt + 1}/${recoveryUrls.length})`);
        await clearOpenAIAuthState(page);
        await gotoWithRetry(page, recoveryUrls[attempt], {
            waitUntil: 'domcontentloaded',
            timeout: CREATE_ACCOUNT_TIMING.navigationTimeoutMs
        });
        await sleep(randomDelay(2200, 3200));
    }

    throw new Error(
        `チーム登録フォームに到達できません ` +
        `(state: ${lastSnapshot?.state || 'unknown'}, url: ${lastSnapshot?.url || page.url()}, buttons: ${JSON.stringify((lastSnapshot?.buttonTexts || []).slice(0, 10))})`
    );
}

async function clickElementByText(page, selector, textCandidates, options = {}) {
    const waitForNavigation = options.waitForNavigation ?? false;
    const navigationTimeout = options.navigationTimeout ?? CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs;
    const normalizedCandidates = textCandidates.map((candidate) => normalizeText(candidate));

    return withExecutionContextRetry(async () => {
        const hasTarget = await evaluateWithRetry(page, (candidateSelector, candidates) => {
            const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase();
            const isVisible = (element) => {
                if (!element) {
                    return false;
                }

                const style = window.getComputedStyle(element);
                return style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    element.getClientRects().length > 0;
            };

            const target = Array.from(document.querySelectorAll(candidateSelector)).find((element) => {
                if (!isVisible(element)) {
                    return false;
                }

                const text = normalize([
                    element.textContent || '',
                    element.getAttribute('aria-label') || '',
                    element.getAttribute('data-dd-action-name') || ''
                ].join(' '));

                return candidates.some((candidate) => text.includes(candidate));
            });

            return Boolean(target);
        }, selector, normalizedCandidates);

        if (!hasTarget) {
            return false;
        }

        const navigationPromise = waitForNavigation
            ? page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: navigationTimeout }).catch(() => null)
            : null;

        await evaluateWithRetry(page, (candidateSelector, candidates) => {
            const normalize = (value = '') => String(value).replace(/\s+/g, ' ').trim().toLowerCase();
            const isVisible = (element) => {
                if (!element) {
                    return false;
                }

                const style = window.getComputedStyle(element);
                return style.display !== 'none' &&
                    style.visibility !== 'hidden' &&
                    element.getClientRects().length > 0;
            };

            const target = Array.from(document.querySelectorAll(candidateSelector)).find((element) => {
                if (!isVisible(element)) {
                    return false;
                }

                const text = normalize([
                    element.textContent || '',
                    element.getAttribute('aria-label') || '',
                    element.getAttribute('data-dd-action-name') || ''
                ].join(' '));

                return candidates.some((candidate) => text.includes(candidate));
            });

            if (!target) {
                return false;
            }

            target.scrollIntoView({ block: 'center', inline: 'center' });
            target.click();
            return true;
        }, selector, normalizedCandidates);

        if (navigationPromise) {
            await navigationPromise;
        }

        return true;
    }, {
        retries: 2,
        delayMs: 500
    });
}

async function clickSubmitButton(page, options = {}) {
    const waitForNavigation = options.waitForNavigation ?? false;
    const navigationTimeout = options.navigationTimeout ?? CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs;
    const selectors = [
        'button[type="submit"]',
        'button[data-testid="continue-button"]'
    ];

    return withExecutionContextRetry(async () => {
        for (const selector of selectors) {
            const clicked = await clickFirstMatchingSelector(page, [selector], {
                waitForNavigation,
                navigationTimeout
            });
            if (clicked) {
                return true;
            }
        }

        return false;
    }, {
        retries: 2,
        delayMs: 500
    });
}

async function clickFirstMatchingSelector(page, selectors, options = {}) {
    const waitForNavigation = options.waitForNavigation ?? false;
    const navigationTimeout = options.navigationTimeout ?? CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs;

    return withExecutionContextRetry(async () => {
        for (const selector of selectors) {
            const hasTarget = await evaluateWithRetry(page, (candidateSelector) => {
                const element = document.querySelector(candidateSelector);
                if (!element) {
                    return false;
                }

                const style = window.getComputedStyle(element);
                if (style.display === 'none' || style.visibility === 'hidden' || element.getClientRects().length === 0) {
                    return false;
                }

                return true;
            }, selector);

            if (!hasTarget) {
                continue;
            }

            const navigationPromise = waitForNavigation
                ? page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: navigationTimeout }).catch(() => null)
                : null;

            await evaluateWithRetry(page, (candidateSelector) => {
                const element = document.querySelector(candidateSelector);
                if (!element) {
                    return false;
                }

                const style = window.getComputedStyle(element);
                if (style.display === 'none' || style.visibility === 'hidden' || element.getClientRects().length === 0) {
                    return false;
                }

                element.scrollIntoView({ block: 'center', inline: 'center' });
                element.click();
                return true;
            }, selector);

            if (navigationPromise) {
                await navigationPromise;
            }

            return true;
        }

        return false;
    }, {
        retries: 2,
        delayMs: 500
    });
}

async function fillInputValue(page, selector, value) {
    await withExecutionContextRetry(async () => {
        await evaluateWithRetry(page, (candidateSelector) => {
            const element = document.querySelector(candidateSelector);
            if (!element) {
                throw new Error(`入力対象が見つかりません: ${candidateSelector}`);
            }

            element.scrollIntoView({ block: 'center', inline: 'center' });
            element.focus();
            if ('value' in element) {
                element.value = '';
            }
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
        }, selector);

        await page.click(selector, { clickCount: 3 }).catch(() => null);
        await sleep(150);
        await page.keyboard.press('Control+A').catch(() => null);
        await page.keyboard.press('Meta+A').catch(() => null);
        await page.keyboard.press('Backspace').catch(() => null);
        await sleep(100);
        await page.type(selector, value, { delay: 0 });

        let currentValue = await evaluateWithRetry(page, (candidateSelector) => {
            const element = document.querySelector(candidateSelector);
            return element ? (element.value || '') : null;
        }, selector);

        if (currentValue !== value) {
            await evaluateWithRetry(page, (candidateSelector, nextValue) => {
                const element = document.querySelector(candidateSelector);
                if (!element) {
                    return false;
                }

                element.focus();
                element.value = nextValue;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }, selector, value);

            currentValue = await evaluateWithRetry(page, (candidateSelector) => {
                const element = document.querySelector(candidateSelector);
                return element ? (element.value || '') : null;
            }, selector);
        }

        if (currentValue !== value) {
            throw new Error(`入力値の反映に失敗しました: expected=${value} actual=${currentValue}`);
        }
    }, {
        retries: 2,
        delayMs: 500
    });
}

async function getPageTextSnapshot(page) {
    return evaluateWithRetry(page, () => document.body?.innerText || '').catch(() => '');
}

async function throwIfUnsupportedEmailError(page) {
    const pageText = await getPageTextSnapshot(page);
    if (!containsUnsupportedEmailError(pageText)) {
        return;
    }

    await clickElementByText(page, 'button', ['もう一度試す', 'try again']).catch(() => false);
    await sleep(1500);

    throw createRetryableSignupError(
        'The email you provided is not supported. 新しいメールで最初から再試行します。',
        'UNSUPPORTED_EMAIL'
    );
}

async function waitForPasswordStep(page, timeout = CREATE_ACCOUNT_TIMING.nextStepTimeoutMs) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const hasPasswordField = await hasAnySelector(page, BUSINESS_SIGNUP_PASSWORD_SELECTORS);
        const pageText = await getPageTextSnapshot(page);
        const currentUrl = page.url();

        if (isPasswordStepState({
            url: currentUrl,
            text: pageText,
            hasPasswordField
        })) {
            return true;
        }

        await sleep(500);
    }

    return false;
}

async function waitForEmailNextStep(page, timeout = CREATE_ACCOUNT_TIMING.nextStepTimeoutMs) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        const hasPasswordField = await hasAnySelector(page, BUSINESS_SIGNUP_PASSWORD_SELECTORS);
        const hasPasswordLink = await hasAnySelector(page, BUSINESS_SIGNUP_PASSWORD_LINK_SELECTORS);
        const hasCodeField = await hasAnySelector(page, BUSINESS_SIGNUP_CODE_SELECTORS);
        const pageText = await getPageTextSnapshot(page);
        const currentUrl = page.url();
        const state = classifyEmailNextStepState({
            url: currentUrl,
            text: pageText,
            hasPasswordField,
            hasPasswordLink,
            hasCodeField
        });

        if (state !== 'unknown') {
            return state;
        }

        await sleep(500);
    }

    return 'unknown';
}

async function waitForPasswordInput(page, timeout = CREATE_ACCOUNT_TIMING.inputTimeoutMs) {
    return waitForAnyVisibleSelector(
        page,
        BUSINESS_SIGNUP_PASSWORD_SELECTORS,
        timeout,
        'パスワード入力欄'
    );
}

async function waitForCodeInput(page, timeout = CREATE_ACCOUNT_TIMING.inputTimeoutMs) {
    return waitForAnyVisibleSelector(
        page,
        BUSINESS_SIGNUP_CODE_SELECTORS,
        timeout,
        '検証コード入力欄'
    );
}

async function fillEmailStep(page, email, label = `メール入力完了: ${email}`) {
    const emailSelector = await waitForAnyVisibleSelector(
        page,
        BUSINESS_SIGNUP_EMAIL_SELECTORS,
        CREATE_ACCOUNT_TIMING.selectorTimeoutMs,
        'メール入力欄'
    );

    await fillInputValue(page, emailSelector, email);
    console.log(`   ${label}`);
    await sleep(randomDelay(500, 1000));
}

async function fillNameStep(page, fullName, label = `名前入力完了: ${fullName}`) {
    const nameSelector = await waitForAnyVisibleSelector(
        page,
        ['input[name="name"]', 'input[placeholder*="Full name"]'],
        CREATE_ACCOUNT_TIMING.selectorTimeoutMs,
        '名前入力欄'
    );

    await fillInputValue(page, nameSelector, fullName);
    console.log(`   ${label}`);
    await sleep(randomDelay(500, 1000));
}

async function ensurePasswordStepReady(page) {
    const hasPasswordField = await hasAnySelector(page, BUSINESS_SIGNUP_PASSWORD_SELECTORS);
    if (hasPasswordField) {
        return;
    }

    const passwordLinkClicked = await clickFirstMatchingSelector(
        page,
        BUSINESS_SIGNUP_PASSWORD_LINK_SELECTORS,
        {
            waitForNavigation: true,
            navigationTimeout: CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs
        }
    );

    if (passwordLinkClicked) {
        console.log('   「パスワードで続行」をクリックしました');
        await sleep(randomDelay(4000, 6000));
    }
}

async function fillPasswordStepInput(page, account, label = 'パスワード入力完了') {
    await ensurePasswordStepReady(page);
    const passwordSelector = await waitForPasswordInput(page, CREATE_ACCOUNT_TIMING.inputTimeoutMs);

    await fillInputValue(page, passwordSelector, account.password);
    console.log(`   ${label}`);
    await sleep(randomDelay(500, 1000));
}

async function submitPrimaryAction(page, errorMessage, options = {}) {
    const waitForNavigation = options.waitForNavigation ?? true;
    const navigationTimeout = options.navigationTimeout ?? CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs;
    const waitMin = options.waitMin ?? 5000;
    const waitMax = options.waitMax ?? 7000;

    const actionClicked = await clickSubmitButton(page, {
        waitForNavigation,
        navigationTimeout
    });
    if (!actionClicked) {
        throw new Error(errorMessage);
    }

    await sleep(randomDelay(waitMin, waitMax));
}

async function fillVerificationCodeInput(page, verificationCode, label = `コード入力完了: ${verificationCode}`) {
    await page.screenshot({ path: 'debug_before_code_input.png', fullPage: false });

    const inputInfo = await evaluateWithRetry(page, () => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map((input, i) => ({
            index: i,
            type: input.type,
            name: input.name,
            id: input.id,
            autocomplete: input.autocomplete,
            maxlength: input.maxLength,
            placeholder: input.placeholder,
            value: input.value,
            visible: input.offsetParent !== null,
            rect: input.getBoundingClientRect()
        }));
    });
    console.log('   検出された入力欄:', JSON.stringify(inputInfo, null, 2));

    const codeSelector = await waitForCodeInput(page, CREATE_ACCOUNT_TIMING.inputTimeoutMs);
    await page.click(codeSelector, { clickCount: 3 }).catch(() => null);
    await sleep(500);

    console.log('   方法1: evaluateで直接値を設定');
    await evaluateWithRetry(page, (selectors, code) => {
        const input = selectors
            .map((selector) => document.querySelector(selector))
            .find(Boolean);
        if (!input) {
            return false;
        }

        input.value = code;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        return true;
    }, BUSINESS_SIGNUP_CODE_SELECTORS, verificationCode);

    await sleep(500);

    const currentValue = await evaluateWithRetry(page, (selectors) => {
        const input = selectors
            .map((selector) => document.querySelector(selector))
            .find(Boolean);
        return input ? input.value : null;
    }, BUSINESS_SIGNUP_CODE_SELECTORS);
    console.log(`   現在の値: ${currentValue}`);

    if (!currentValue || currentValue.length === 0) {
        console.log('   方法2: キーボード入力を試行');
        await page.click(codeSelector).catch(() => null);
        await sleep(200);
        await page.type(codeSelector, verificationCode, { delay: 50 });
    }

    await sleep(500);
    console.log(`   ${label}`);
    await sleep(1000);
}

async function fillBirthdayStep(page, birthday, label = `生年月日入力完了: ${birthday.month}/${birthday.day}/${birthday.year} (${birthday.age}歳)`) {
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

    const selectEls = await page.$$('select[tabindex="-1"]');
    if (selectEls.length >= 3 && !monthEl) {
        await evaluateWithRetry(page, (year, month, day) => {
            const selects = document.querySelectorAll('select[tabindex="-1"]');
            selects.forEach(select => {
                const options = Array.from(select.options);
                const hasYear = options.some(o => o.value.length === 4 && parseInt(o.value) > 1900);
                const hasMonth = options.some(o => parseInt(o.value) >= 1 && parseInt(o.value) <= 12 && o.textContent.includes('月'));
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

    console.log(`   ${label}`);
    await sleep(randomDelay(500, 1000));
}

async function completePasswordStep(page, account, errorMonitor) {
    console.log('\n🔑 Step 6: パスワード入力');
    await fillPasswordStepInput(page, account);

    console.log('\n➡️ Step 7: Continueボタン');

    if (errorMonitor) {
        errorMonitor.setRecoveryContext({
            stepName: 'Step 7',
            pageStartStepLabel: 'Step 6',
            maxRetries: 2,
            retryPageStart: async (attempt) => {
                console.log(`\n🔑 Step 6 (Retry ${attempt}): パスワード再入力`);
                await fillPasswordStepInput(page, account, 'パスワード再入力完了');
                console.log(`\n➡️ Step 7 (Retry ${attempt}): Continueボタン`);
                await submitPrimaryAction(page, '再試行時のContinueボタンが見つかりません', {
                    waitForNavigation: true,
                    navigationTimeout: CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs,
                    waitMin: 5000,
                    waitMax: 7000
                });
            }
        });
    }

    await submitPrimaryAction(page, 'パスワード送信用のContinueボタンが見つかりません', {
        waitForNavigation: true,
        navigationTimeout: CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs,
        waitMin: 5000,
        waitMax: 7000
    });

    if (errorMonitor) {
        await errorMonitor.waitForIdle();
    }
}

async function completeVerificationCodeStep(page, mailClient, errorMonitor) {
    const waitLimitLabel = formatTimeoutLimitLabel(CREATE_ACCOUNT_TIMING.verificationCodeTimeoutMs);
    console.log(`\n⏳ Step 8: 検証コード待機（${waitLimitLabel}）...`);
    console.log(`   🌐 ${CREATE_ACCOUNT_TIMING.profile.toUpperCase()} モードのため待機を長めにしています`);
    const verificationCode = await mailClient.waitForVerificationCode();

    console.log('\n🔢 Step 9: 検証コード入力');
    console.log(`   検証コード: ${verificationCode}`);
    await fillVerificationCodeInput(page, verificationCode);

    console.log('\n➡️ Step 10: Continueボタン');

    if (errorMonitor) {
        errorMonitor.setRecoveryContext({
            stepName: 'Step 10',
            pageStartStepLabel: 'Step 9',
            maxRetries: 2,
            retryPageStart: async (attempt) => {
                console.log(`\n🔢 Step 9 (Retry ${attempt}): 検証コード再入力`);
                await fillVerificationCodeInput(page, verificationCode, `コード再入力完了: ${verificationCode}`);
                console.log(`\n➡️ Step 10 (Retry ${attempt}): Continueボタン`);
                await submitPrimaryAction(page, '再試行時のContinueボタンが見つかりません', {
                    waitForNavigation: true,
                    navigationTimeout: CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs,
                    waitMin: 4000,
                    waitMax: 6000
                });
            }
        });
    }

    await submitPrimaryAction(page, 'コード送信用のContinueボタンが見つかりません', {
        waitForNavigation: true,
        navigationTimeout: CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs,
        waitMin: 4000,
        waitMax: 6000
    });

    if (errorMonitor) {
        await errorMonitor.waitForIdle();
    }
}

// 「不明なエラー」監視と自動対処クラス
class ErrorMonitor {
    constructor(page) {
        this.page = page;
        this.isRunning = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.lastErrorTime = 0;
        this.errorCooldown = 10000; // 10秒以内の連続エラーは無視
        this.recoveryContext = null;
        this.recoveryPromise = null;
        this.isRecovering = false;
        this.lastRecoveryError = null;
    }

    setRecoveryContext(context) {
        this.recoveryContext = {
            stepName: context.stepName || '不明ステップ',
            pageStartStepLabel: context.pageStartStepLabel || '前のページ先頭',
            maxRetries: context.maxRetries ?? 2,
            retryPageStart: context.retryPageStart,
            attemptCount: 0
        };
        this.retryCount = 0;
        this.lastErrorTime = 0;
        this.lastRecoveryError = null;
    }

    clearRecoveryContext() {
        this.recoveryContext = null;
        this.retryCount = 0;
        this.lastRecoveryError = null;
    }

    async waitForIdle() {
        if (this.recoveryPromise) {
            await this.recoveryPromise;
        }

        if (this.lastRecoveryError) {
            const recoveryError = this.lastRecoveryError;
            this.lastRecoveryError = null;
            throw recoveryError;
        }
    }

    // 監視開始
    start() {
        this.isRunning = true;
        this.monitorLoop();
    }

    // 監視停止
    stop() {
        this.isRunning = false;
    }

    // 監視ループ
    async monitorLoop() {
        while (this.isRunning) {
            try {
                await this.checkAndHandleError();
                await sleep(CREATE_ACCOUNT_TIMING.shortDelayMs);
            } catch (e) {
                console.log(`   ⚠️ エラー監視の復旧処理に失敗: ${e.message}`);
            }
        }
    }

    // エラーチェックと対処
    async checkAndHandleError() {
        const now = Date.now();

        if (this.isRecovering) {
            return;
        }
        
        // クールダウンチェック
        if (now - this.lastErrorTime < this.errorCooldown) {
            return;
        }

        // エラーメッセージを検索
        const errorInfo = await evaluateWithRetry(this.page, () => {
            const errorElements = document.querySelectorAll('span, div, p, h1, h2, h3');
            for (const el of errorElements) {
                const text = el.textContent.trim();
                if (text.includes('不明なエラーが発生しました') ||
                    text.includes('An unknown error occurred') ||
                    text.includes('エラーが発生しました') ||
                    text.includes('An error occurred') ||
                    text.includes('問題が発生しました') ||
                    text.includes('Something went wrong')) {
                    return {
                        found: true,
                        text: text,
                        hasRetryButton: Array.from(document.querySelectorAll('button')).some((button) => {
                            const buttonText = (button.textContent || '').trim();
                            return buttonText.includes('もう一度試す') ||
                                buttonText.includes('Try again') ||
                                button.getAttribute('data-dd-action-name') === 'Try again';
                        })
                    };
                }
            }
            return { found: false };
        });

        if (errorInfo.found) {
            this.lastErrorTime = now;
            this.retryCount++;
            
            console.log(`   ⚠️ エラー検出: "${errorInfo.text}" (リトライ ${this.retryCount}/${this.maxRetries})`);

            if (this.retryCount > this.maxRetries) {
                console.log('   ❌ 最大リトライ回数に達しました');
                throw new Error('最大リトライ回数に達しました: ' + errorInfo.text);
            }

            // 「もう一度試す」ボタンを探してクリック
            if (errorInfo.hasRetryButton) {
                const clicked = await clickElementByText(this.page, 'button', ['もう一度試す', 'try again']);

                if (clicked) {
                    console.log('   ✅ 「もう一度試す」ボタンをクリックしました');
                    const recoveryContext = this.recoveryContext;
                    if (recoveryContext && typeof recoveryContext.retryPageStart === 'function') {
                        recoveryContext.attemptCount += 1;

                        if (recoveryContext.attemptCount > recoveryContext.maxRetries) {
                            throw new Error(`${recoveryContext.stepName} の前段リトライ上限に達しました`);
                        }

                        console.log(
                            `   ↩️ 前のページの先頭 (${recoveryContext.pageStartStepLabel}) からやり直します ` +
                            `(${recoveryContext.attemptCount}/${recoveryContext.maxRetries})`
                        );

                        this.isRecovering = true;
                        this.recoveryPromise = (async () => {
                            await sleep(randomDelay(3000, 5000));
                            try {
                                await recoveryContext.retryPageStart(recoveryContext.attemptCount);
                                this.lastRecoveryError = null;
                            } catch (error) {
                                this.lastRecoveryError = error;
                                throw error;
                            }
                        })();

                        try {
                            await this.recoveryPromise;
                        } finally {
                            this.isRecovering = false;
                            this.recoveryPromise = null;
                        }
                    } else {
                        await sleep(randomDelay(5000, 8000));
                    }
                } else {
                    // ボタンがない場合はページリロード
                    console.log('   🔄 ページをリロードします');
                    await this.page.reload({ waitUntil: 'domcontentloaded' });
                    await sleep(randomDelay(5000, 8000));
                }
            } else {
                // リトライボタンがない場合は少し待つ
                console.log('   ⏳ リトライボタンなし、待機します');
                await sleep(randomDelay(3000, 5000));
            }
        }
    }
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

// 12文字のランダム英数字パスワードを生成
function generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

class GeneratorEmailClient {
    constructor(browserType, browserPath) {
        this.browserType = browserType;
        this.browserPath = browserPath;
        this.email = null;
        this.mailDays = null;
        this.password = generateRandomPassword();
    }

    async createAccount() {
        console.log('  📧 generator.email でアドレスを生成中...');

        const browser = await launchBrowser(this.browserType, this.browserPath, {
            slowMo: 0,
            preferRealChromeProfile: this.browserType === 'chrome',
            profilePrefix: 'create_account_generator'
        });
        const page = await browser.newPage();
        await enableGeneratorConsentGuard(page).catch(() => 0);
        const generatorSessionStartedAt = Date.now();

        try {
            let email = null;
            let uptimeDays = null;
            let unsupportedCount = 0;

            const throwIfGeneratorSessionTimedOut = () => {
                if (hasGeneratorSessionTimedOut(generatorSessionStartedAt, GENERATOR_EMAIL_SESSION_TIMEOUT_MS)) {
                    throw createGeneratorSessionTimeoutError();
                }
            };

            const response = await gotoWithRetry(page, 'https://generator.email/', {
                waitUntil: 'domcontentloaded',
                timeout: CREATE_ACCOUNT_TIMING.generatorNavigationTimeoutMs
            }).catch(() => null);
            throwIfGeneratorSessionTimedOut();

            const readGeneratorStatusInfo = async () => {
                return evaluateWithRetry(page, () => {
                    const statusElement = document.querySelector('#checkdomainset');
                    if (!statusElement) {
                        return null;
                    }

                    return {
                        text: statusElement.textContent || '',
                        className: statusElement.className || ''
                    };
                }).catch(() => null);
            };

            const waitForStableGeneratorStatusInfo = async () => {
                const maxChecks = 6;
                const stableReadsRequired = 2;
                const settleDelayMs = Math.max(CREATE_ACCOUNT_TIMING.shortDelayMs, 700);
                let previousStableKey = null;
                let stableReads = 0;
                let latestStatusInfo = null;

                for (let attempt = 1; attempt <= maxChecks; attempt++) {
                    throwIfGeneratorSessionTimedOut();
                    const statusInfo = await readGeneratorStatusInfo();
                    latestStatusInfo = statusInfo;

                    const statusText = statusInfo?.text || '';
                    const statusClassName = statusInfo?.className || '';
                    const settled =
                        containsGeneratorUnsupportedEmailStatus(statusText, statusClassName) ||
                        isGeneratorApprovedEmailStatus(statusText, statusClassName);

                    if (settled) {
                        const stableKey = `${statusClassName}::${statusText}`;
                        stableReads = stableKey === previousStableKey ? stableReads + 1 : 1;
                        previousStableKey = stableKey;

                        if (stableReads >= stableReadsRequired) {
                            return statusInfo;
                        }
                    } else {
                        previousStableKey = null;
                        stableReads = 0;
                    }

                    if (attempt < maxChecks) {
                        throwIfGeneratorSessionTimedOut();
                        await sleep(settleDelayMs);
                    }
                }

                return latestStatusInfo;
            };

            const readGeneratorCandidate = async () => {
                throwIfGeneratorSessionTimedOut();
                const removedCount = await dismissGeneratorConsentDialog(page).catch(() => 0);
                if (removedCount > 0) {
                    console.log('  ⚠️ generator.email の同意ダイアログを除去しました');
                    await sleep(300);
                }

                const statusInfo = await waitForStableGeneratorStatusInfo();
                const html = await page.content().catch(() => '');
                const bodyText = await evaluateWithRetry(page, () => document.body?.innerText || '').catch(() => '');
                const statusText = statusInfo?.text || '';
                const statusClassName = statusInfo?.className || '';
                return {
                    email: extractGeneratorEmailAddress(html) || extractGeneratorEmailAddress(bodyText),
                    uptimeDays: extractGeneratorApprovedUptimeDays(statusText || `${html}\n${bodyText}`),
                    unsupported: containsGeneratorUnsupportedEmailStatus(statusText, statusClassName)
                };
            };

            const generateNewEmail = async () => {
                throwIfGeneratorSessionTimedOut();
                const removedCount = await dismissGeneratorConsentDialog(page).catch(() => 0);
                if (removedCount > 0) {
                    console.log('  ⚠️ generator.email の同意ダイアログを除去しました');
                    await sleep(300);
                }

                const clicked = await evaluateWithRetry(page, () => {
                    const buttons = Array.from(document.querySelectorAll('button.btn-success, button'));
                    const button = buttons.find((candidate) =>
                        (candidate.textContent || '').includes('Generate new e-mail')
                    );
                    if (!button) {
                        return false;
                    }

                    button.click();
                    return true;
                }).catch(() => false);

                if (!clicked) {
                    await gotoWithRetry(page, 'https://generator.email/', {
                        waitUntil: 'domcontentloaded',
                        timeout: CREATE_ACCOUNT_TIMING.generatorNavigationTimeoutMs
                    }).catch(() => null);
                }

                throwIfGeneratorSessionTimedOut();
                await sleep(CREATE_ACCOUNT_TIMING.shortDelayMs);
                throwIfGeneratorSessionTimedOut();
            };

            // unsupported と uptime 不足は generator.email 内で再生成し、unsupported 連発時は全体再試行へ戻す。
            const readAcceptedCandidate = async (candidate) => {
                let currentCandidate = candidate;

                while (currentCandidate) {
                    throwIfGeneratorSessionTimedOut();
                    if (currentCandidate.unsupported) {
                        unsupportedCount += 1;
                        console.log(
                            `  ↻ Email not supported のため再生成します (${unsupportedCount}/${GENERATOR_EMAIL_UNSUPPORTED_RETRY_LIMIT})`
                        );

                        if (shouldRestartGeneratorEmailFlow(unsupportedCount)) {
                            throw createRetryableSignupError(
                                'generator.email で Email not supported が続いたため、最初からやり直します',
                                'UNSUPPORTED_EMAIL'
                            );
                        }

                        await generateNewEmail();
                        currentCandidate = await readGeneratorCandidate();
                        continue;
                    }

                    if (
                        currentCandidate.email &&
                        !isGeneratorApprovedUptimeAccepted(
                            currentCandidate.uptimeDays,
                            GENERATOR_EMAIL_MIN_APPROVED_UPTIME_DAYS
                        )
                    ) {
                        const uptimeLabel =
                            currentCandidate.uptimeDays === null ? '不明' : `${currentCandidate.uptimeDays}`;
                        console.log(
                            `  ↻ uptime ${uptimeLabel} days のため再生成します (基準: ${GENERATOR_EMAIL_MIN_APPROVED_UPTIME_DAYS}日以上)`
                        );
                        await generateNewEmail();
                        currentCandidate = await readGeneratorCandidate();
                        continue;
                    }

                    return currentCandidate;
                }

                return currentCandidate;
            };

            if (response) {
                throwIfGeneratorSessionTimedOut();
                const candidate = await readAcceptedCandidate(await readGeneratorCandidate());
                email = candidate.email;
                uptimeDays = candidate.uptimeDays;
            }

            if (!email) {
                await generateNewEmail();

                await evaluateWithRetry(page, () => {
                    const button = document.querySelector('#copbtn');
                    if (button) {
                        button.click();
                    }
                }).catch(() => null);
                await sleep(500);
                throwIfGeneratorSessionTimedOut();

                const candidate = await readAcceptedCandidate(await readGeneratorCandidate());
                email = candidate.email;
                uptimeDays = candidate.uptimeDays;
            }

            if (!email) {
                email = createGeneratorFallbackEmail();
                console.log('  ⚠️ generator.email の自動取得に失敗したため、既知ドメインでフォールバックします');
            } else if (uptimeDays !== null) {
                console.log(`  ✅ uptime ${uptimeDays} days のアドレスを採用します`);
            }

            this.email = email;
            this.mailDays = uptimeDays !== null ? String(uptimeDays) : null;
            this.password = generateRandomPassword();

            console.log(`  ✅ メールアドレス: ${this.email}`);
            if (this.mailDays !== null) {
                console.log(`  📅 MailDays: ${this.mailDays}`);
            }
            console.log(`  🔑 パスワード: ${this.password}`);
            return { email: this.email, password: this.password, mailDays: this.mailDays };
        } finally {
            await page.close().catch(() => null);
            await browser.close().catch(() => null);
        }
    }

    async waitForVerificationCode(
        timeout = CREATE_ACCOUNT_TIMING.verificationCodeTimeoutMs,
        interval = CREATE_ACCOUNT_TIMING.verificationCodeIntervalMs
    ) {
        const startTime = Date.now();
        const unlimitedWait = isUnlimitedTimeoutMs(timeout);
        const inboxUrl = `https://generator.email/${encodeURIComponent(this.email)}`;

        console.log('📧 検証コードを取得中... (generator.email)');
        console.log(`  📬 受信箱: ${inboxUrl}`);

        const browser = await launchBrowser(this.browserType, this.browserPath, {
            slowMo: 0,
            preferRealChromeProfile: false,
            profilePrefix: 'create_account_inbox'
        });
        const page = await browser.newPage();
        await enableGeneratorConsentGuard(page).catch(() => 0);
        const generatorSessionStartedAt = Date.now();

        try {
            let attempt = 0;
            const throwIfGeneratorSessionTimedOut = () => {
                if (hasGeneratorSessionTimedOut(generatorSessionStartedAt, GENERATOR_EMAIL_SESSION_TIMEOUT_MS)) {
                    throw createGeneratorSessionTimeoutError();
                }
            };

            while (unlimitedWait || Date.now() - startTime < timeout) {
                attempt += 1;
                throwIfGeneratorSessionTimedOut();

                await gotoWithRetry(page, inboxUrl, {
                    waitUntil: 'domcontentloaded',
                    timeout: CREATE_ACCOUNT_TIMING.generatorNavigationTimeoutMs
                }).catch(() => null);
                throwIfGeneratorSessionTimedOut();
                const removedCount = await dismissGeneratorConsentDialog(page).catch(() => 0);
                if (removedCount > 0) {
                    console.log('  ⚠️ generator.email の同意ダイアログを除去しました');
                    await sleep(300);
                }
                await sleep(randomDelay(2200, 3200));
                throwIfGeneratorSessionTimedOut();

                const bodyText = await evaluateWithRetry(page, () => document.body?.innerText || '').catch(() => '');
                const code = extractGeneratorVerificationCode(bodyText);

                if (code) {
                    console.log(`  ✅ 検証コード取得: ${code}`);
                    return code;
                }

                if (attempt % 4 === 0) {
                    const elapsed = Math.round((Date.now() - startTime) / 1000);
                    console.log(`  ⏳ メール待機中... (${elapsed}秒経過)`);
                }

                throwIfGeneratorSessionTimedOut();
                await sleep(interval);
            }

            throw new Error('generator.email検証コード取得タイムアウト');
        } finally {
            await page.close().catch(() => null);
            await browser.close().catch(() => null);
        }
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
async function launchBrowser(browserType, browserPath, launchOptions = {}) {
    const options = {
        browserType,
        browserPath,
        baseDir: __dirname,
        slowMo: launchOptions.slowMo ?? 50,
        timeout: launchOptions.timeout ?? CREATE_ACCOUNT_TIMING.browserLaunchTimeoutMs,
        protocolTimeout: launchOptions.protocolTimeout ?? CREATE_ACCOUNT_TIMING.browserProtocolTimeoutMs,
        preferRealChromeProfile: launchOptions.preferRealChromeProfile ?? (browserType === 'chrome'),
        profilePrefix: launchOptions.profilePrefix || 'create_account',
        log: console.log,
        keepOpen: launchOptions.keepOpen ?? false
    };

    if (browserType === 'brave') {
        console.log('🦁 Braveを起動中...');
        return launchRealBrowser(puppeteer, options);
    }

    console.log('🌐 Chromeを起動中...');
    return launchRealBrowser(puppeteer, options);
}

// メイン処理
async function signupWithBrowser(browserType, browserPath, mailClient, account) {
    const keepOpen = resolveCreateAccountKeepOpen();
    const browser = await launchBrowser(browserType, browserPath, { keepOpen });
    
    // エラーモニターを初期化（後で開始）
    let errorMonitor = null;
    
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        // エラーモニター開始
        errorMonitor = new ErrorMonitor(page);
        errorMonitor.start();
        console.log('   🔍 エラー監視を開始しました');
        
        await clearOpenAIAuthState(page);

        // Step 2: ChatGPTチームサインアップページへ
        console.log('\n🌐 Step 2: ChatGPTチームサインアップページへ移動');
        await gotoWithRetry(page, BUSINESS_SIGNUP_DIRECT_URL, {
            waitUntil: 'domcontentloaded',
            timeout: CREATE_ACCOUNT_TIMING.navigationTimeoutMs
        });
        await sleep(randomDelay(2200, 3200));
        console.log('   ✅ ページ読み込み成功');
        
        // Step 3: チームプラン登録ボタン
        console.log('\n👆 Step 3: チームプラン登録ボタンを探してクリック');
        await sleep(randomDelay(2000, 4000));
        await prepareBusinessSignupEmailEntry(page);
        
        // Step 4: メールアドレス入力
        console.log('\n✉️ Step 4: メールアドレス入力');
        await fillEmailStep(page, account.email);
        
        // Step 5: Continueボタン
        console.log('\n➡️ Step 5: Continueボタン');

        if (errorMonitor) {
            errorMonitor.setRecoveryContext({
                stepName: 'Step 5',
                pageStartStepLabel: 'Step 4',
                maxRetries: 2,
                retryPageStart: async (attempt) => {
                    console.log(`\n✉️ Step 4 (Retry ${attempt}): メール再入力`);
                    await fillEmailStep(page, account.email, `メール再入力完了: ${account.email}`);
                    console.log(`\n➡️ Step 5 (Retry ${attempt}): Continueボタン`);
                    await submitPrimaryAction(page, 'Continueボタンが見つかりません', {
                        waitForNavigation: true,
                        navigationTimeout: CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs,
                        waitMin: 5000,
                        waitMax: 7000
                    });
                }
            });
        }

        await submitPrimaryAction(page, 'Continueボタンが見つかりません', {
            waitForNavigation: true,
            navigationTimeout: CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs,
            waitMin: 5000,
            waitMax: 7000
        });
        console.log('   Continueボタンをクリックしました');

        if (errorMonitor) {
            await errorMonitor.waitForIdle();
        }
        
        const nextStep = await waitForEmailNextStep(page, CREATE_ACCOUNT_TIMING.nextStepTimeoutMs);
        if (errorMonitor) {
            errorMonitor.clearRecoveryContext();
        }

        if (nextStep === 'password') {
            await completePasswordStep(page, account, errorMonitor);
            await completeVerificationCodeStep(page, mailClient, errorMonitor);
        } else if (nextStep === 'code') {
            console.log('   次の画面は確認コード入力です');
            await completeVerificationCodeStep(page, mailClient, errorMonitor);

            const postCodeStep = await waitForEmailNextStep(page, CREATE_ACCOUNT_TIMING.retryEntryStateTimeoutMs);
            if (postCodeStep === 'password') {
                console.log('   コード認証後にパスワード設定へ進んだため、続けて処理します');
                await completePasswordStep(page, account, errorMonitor);
            }
        } else {
            throw new Error(`メール入力後の次画面を判定できません (URL: ${page.url()})`);
        }
        
        // Step 11: 名前入力
        console.log('\n👤 Step 11: 名前入力');
        const fullName = generateName();
        if (errorMonitor) {
            errorMonitor.clearRecoveryContext();
        }
        await fillNameStep(page, fullName);
        
        // Step 12: 生年月日入力
        console.log('\n📅 Step 12: 生年月日設定');
        const birthday = generateBirthday();
        await fillBirthdayStep(page, birthday);
        
        // Step 13: Finish creating account
        console.log('\n✅ Step 13: Finish creating account');
        if (errorMonitor) {
            errorMonitor.setRecoveryContext({
                stepName: 'Step 13',
                pageStartStepLabel: 'Step 11',
                maxRetries: 2,
                retryPageStart: async (attempt) => {
                    console.log(`\n👤 Step 11 (Retry ${attempt}): 名前再入力`);
                    await fillNameStep(page, fullName, `名前再入力完了: ${fullName}`);
                    console.log(`\n📅 Step 12 (Retry ${attempt}): 生年月日再入力`);
                    await fillBirthdayStep(
                        page,
                        birthday,
                        `生年月日再入力完了: ${birthday.month}/${birthday.day}/${birthday.year} (${birthday.age}歳)`
                    );
                    console.log(`\n✅ Step 13 (Retry ${attempt}): Finish creating account`);
                    await submitPrimaryAction(page, 'アカウント作成完了ボタンが見つかりません', {
                        waitForNavigation: true,
                        navigationTimeout: CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs,
                        waitMin: 5000,
                        waitMax: 7000
                    });
                }
            });
        }

        await submitPrimaryAction(page, 'アカウント作成完了ボタンが見つかりません', {
            waitForNavigation: true,
            navigationTimeout: CREATE_ACCOUNT_TIMING.navigationShortTimeoutMs,
            waitMin: 5000,
            waitMax: 7000
        });

        if (errorMonitor) {
            await errorMonitor.waitForIdle();
        }
        await throwIfUnsupportedEmailError(page);
        if (errorMonitor) {
            errorMonitor.clearRecoveryContext();
        }
        
        // Step 14: オンボーディングフロー処理（Okay, let's go / Skip）
        console.log('\n👋 Step 14: オンボーディングフロー処理');
        
        // 現在のURLを確認
        let currentUrl = page.url();
        console.log(`   現在のURL: ${currentUrl}`);
        
        // pricingページにリダイレクトされた場合はchatgpt.comに移動
        if (currentUrl.includes('#pricing') || currentUrl.includes('/pricing')) {
            console.log('   pricingページを検出、チャットページに移動します');
            await gotoWithRetry(page, 'https://chatgpt.com', {
                waitUntil: 'domcontentloaded',
                timeout: CREATE_ACCOUNT_TIMING.navigationTimeoutMs
            });
            await sleep(randomDelay(4000, 6000));
            currentUrl = page.url();
        }
        
        // "Okay, let's go" または "Skip" ボタンを探してクリック
        const maxRetries = 5;
        for (let i = 0; i < maxRetries; i++) {
            await throwIfUnsupportedEmailError(page);

            const buttonClicked = await clickElementByText(
                page,
                'button',
                ["okay, let's go", 'okay', 'skip', 'start', 'get started', '始めましょう', 'スキップ']
            );
            
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
                await sleep(CREATE_ACCOUNT_TIMING.shortDelayMs);
            }
        }
        
        console.log('   ✅ アカウント作成プロセス完了');
        
        // エラーモニター停止
        if (errorMonitor) {
            errorMonitor.stop();
            console.log('   🔍 エラー監視を停止しました');
        }
        
        if (keepOpen) {
            console.log('   🖥️ keepモード: Chromeを開いたままにします。手動で閉じてください');
            await browser.disconnect();
        } else {
            await browser.close();
        }
        
        return {
            success: true,
            browser: browserType,
            email: account.email,
            password: account.password,
            name: fullName
        };
    } catch (error) {
        // エラーモニター停止
        if (errorMonitor) {
            errorMonitor.stop();
            console.log('   🔍 エラー監視を停止しました');
        }
        await browser.close();
        throw error;
    }
}

// メイン処理（自動フォールバック）
async function signupUnified() {
    console.log('🚀 ChatGPTアカウント作成開始（Chrome実ブラウザ）\n');
    console.log(`🌐 ネットワーク配慮モード: ${CREATE_ACCOUNT_TIMING.profile.toUpperCase()}\n`);
    
    // ブラウザパスを検出
    const browserPaths = detectBrowserPaths();
    console.log('🔍 ブラウザ検出結果:');
    console.log(`   Chrome: ${browserPaths.chrome || '未検出'}`);
    console.log('');
    
    const browsers = getChromeOnlyBrowserCandidates(browserPaths);
    
    if (browsers.length === 0) {
        throw new Error('Chrome が見つかりません。Google Chrome をインストールしてください。');
    }
    
    // 各ブラウザで試行（retryable error は新しいアカウントで継続リトライ）
    let lastError = null;
    
    for (const browser of browsers) {
        console.log(`\n${'='.repeat(50)}`);
        console.log(`🔄 ${browser.type.toUpperCase()} で試行します`);
        console.log(`${'='.repeat(50)}\n`);

        let attempt = 1;
        while (true) {
            try {
                // ブラウザごとに新しい generator.email アカウントを作成
                console.log('📧 Step 1: generator.email アドレス生成');
                const mailClient = new GeneratorEmailClient(browser.type, browser.path);
                const account = await mailClient.createAccount();
                console.log(`   Email: ${account.email}`);
                if (account.mailDays !== null) {
                    console.log(`   MailDays: ${account.mailDays}`);
                }
                console.log(`   Pass: ${account.password}`);
                console.log('');

                const result = await signupWithBrowser(browser.type, browser.path, mailClient, account);

                console.log('\n✅ サインアップ完了！');
                console.log(`   使用ブラウザ: ${result.browser}`);
                console.log(`   Email: ${result.email}`);
                console.log(`   Password: ${result.password}`);
                if (result.mailDays !== null) {
                    console.log(`   MailDays: ${result.mailDays}`);
                }
                console.log(`   Name: ${result.name}`);

                return result;

            } catch (error) {
                console.error(`\n❌ ${browser.type} で失敗:`, error.message);
                lastError = error;

                if (shouldRetrySignupAttempt(error)) {
                    console.log(`⏳ 再試行対象のため、新しいメールでやり直します... (${attempt + 1}回目)`);
                    attempt += 1;
                    await sleep(randomDelay(2200, 3200));
                    continue;
                }

                break;
            }
        }

        // 次のブラウザがある場合は続行
        if (browsers.indexOf(browser) < browsers.length - 1) {
            console.log('⏳ 次のブラウザでリトライします...');
            await sleep(randomDelay(2200, 3200));
        }
    }
    
    // すべてのブラウザで失敗
    console.error('\n❌ すべてのブラウザで失敗しました');
    throw lastError || new Error('アカウント作成に失敗しました');
}

signupUnified().then(() => {
    process.exit(0);
}).catch(err => {
    console.error(err.message);
    process.exit(1);
});
