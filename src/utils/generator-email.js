const GENERATOR_EMAIL_FALLBACK_DOMAINS = [
    'payspun.com',
    'rroij.com',
    'mailto.plus',
    'fexpost.com',
    'fexbox.org'
];
const GENERATOR_EMAIL_MIN_APPROVED_UPTIME_DAYS = 600;

function buildGeneratorInboxUrl(email) {
    if (typeof email !== 'string' || email.length === 0) {
        return null;
    }

    return `https://generator.email/${encodeURIComponent(email)}`;
}

function extractGeneratorEmailAddress(html = '') {
    if (typeof html !== 'string' || html.length === 0) {
        return null;
    }

    const valueMatch = html.match(/value="([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/);
    if (valueMatch) {
        return valueMatch[1];
    }

    const textMatch = html.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    return textMatch ? textMatch[1] : null;
}

function createGeneratorFallbackEmail() {
    const domain = GENERATOR_EMAIL_FALLBACK_DOMAINS[
        Math.floor(Math.random() * GENERATOR_EMAIL_FALLBACK_DOMAINS.length)
    ];
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return `user${suffix}@${domain}`;
}

function extractGeneratorVerificationCode(text = '') {
    if (typeof text !== 'string' || text.length === 0) {
        return null;
    }

    const primaryMatch = text.match(/Your ChatGPT code is (\d{6})/i);
    if (primaryMatch) {
        return primaryMatch[1];
    }

    if (text.includes('ChatGPT') || text.includes('OpenAI')) {
        const fallbackMatch = text.match(/\b(\d{6})\b/);
        if (fallbackMatch) {
            return fallbackMatch[1];
        }
    }

    return null;
}

function extractGeneratorApprovedUptimeDays(text = '') {
    if (typeof text !== 'string' || text.length === 0) {
        return null;
    }

    const match = text.match(/uptime\s+(\d+)\s+days/i);
    if (!match) {
        return null;
    }

    return Number.parseInt(match[1], 10);
}

function isGeneratorApprovedUptimeAccepted(
    uptimeDays,
    minimumDays = GENERATOR_EMAIL_MIN_APPROVED_UPTIME_DAYS
) {
    return Number.isInteger(uptimeDays) && uptimeDays >= minimumDays;
}

async function dismissGeneratorConsentDialog(page) {
    if (!page || typeof page.evaluate !== 'function') {
        return 0;
    }

    return page.evaluate(() => {
        const selectors = [
            '.fc-consent-root',
            '.fc-dialog-overlay',
            '.fc-help-dialog-container'
        ];

        const removed = new Set();
        selectors.forEach((selector) => {
            document.querySelectorAll(selector).forEach((element) => {
                removed.add(element);
            });
        });

        removed.forEach((element) => element.remove());

        if (removed.size > 0) {
            document.documentElement.style.overflow = '';
            if (document.body) {
                document.body.style.overflow = '';
                document.body.style.position = '';
            }
        }

        return removed.size;
    });
}

async function enableGeneratorConsentGuard(page) {
    if (!page || typeof page.evaluateOnNewDocument !== 'function') {
        return 0;
    }

    await page.evaluateOnNewDocument(() => {
        const guardKey = '__generatorConsentGuardInstalled';
        if (window[guardKey]) {
            return;
        }

        const selectors = [
            '.fc-consent-root',
            '.fc-dialog-overlay',
            '.fc-help-dialog-container'
        ];

        const removeConsentDialog = () => {
            const removed = new Set();

            selectors.forEach((selector) => {
                document.querySelectorAll(selector).forEach((element) => {
                    removed.add(element);
                });
            });

            removed.forEach((element) => element.remove());

            if (removed.size > 0) {
                document.documentElement.style.overflow = '';
                if (document.body) {
                    document.body.style.overflow = '';
                    document.body.style.position = '';
                }
            }
        };

        window[guardKey] = true;
        window.__generatorConsentGuardRun = removeConsentDialog;

        const startObserver = () => {
            removeConsentDialog();

            const observer = new MutationObserver(() => {
                removeConsentDialog();
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });

            window.addEventListener('load', removeConsentDialog);
            window.setInterval(removeConsentDialog, 1000);
        };

        if (document.documentElement) {
            startObserver();
        } else {
            document.addEventListener('DOMContentLoaded', startObserver, { once: true });
        }
    });

    return dismissGeneratorConsentDialog(page).catch(() => 0);
}

async function waitForGeneratorVerificationCode(options = {}) {
    const email = options.email;
    const page = options.page;
    const timeout = options.timeout ?? 300000;
    const interval = options.interval ?? 5000;
    const inboxUrl = buildGeneratorInboxUrl(email);
    const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const readBodyText = options.readBodyText ?? (async () => page.evaluate(() => document.body?.innerText || ''));

    if (!inboxUrl) {
        throw new Error('generator.email の受信箱 URL を構築できません');
    }

    if (!page || typeof page.goto !== 'function') {
        throw new Error('generator.email の確認ページが未設定です');
    }

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        await page.goto(inboxUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(3000);

        const bodyText = await readBodyText();
        const verificationCode = extractGeneratorVerificationCode(bodyText);
        if (verificationCode) {
            return verificationCode;
        }

        await sleep(interval);
    }

    throw new Error('検証コード取得タイムアウト');
}

module.exports = {
    buildGeneratorInboxUrl,
    dismissGeneratorConsentDialog,
    enableGeneratorConsentGuard,
    GENERATOR_EMAIL_MIN_APPROVED_UPTIME_DAYS,
    GENERATOR_EMAIL_FALLBACK_DOMAINS,
    createGeneratorFallbackEmail,
    extractGeneratorEmailAddress,
    extractGeneratorApprovedUptimeDays,
    extractGeneratorVerificationCode,
    isGeneratorApprovedUptimeAccepted,
    waitForGeneratorVerificationCode
};
