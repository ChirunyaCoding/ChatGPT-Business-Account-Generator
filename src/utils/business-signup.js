const BUSINESS_SIGNUP_DIRECT_URL = 'https://chatgpt.com/team-sign-up?promo_campaign=team1dollar';
const BUSINESS_SIGNUP_PRICING_URL = 'https://chatgpt.com/?promo_campaign=team1dollar#team-pricing';

const BUSINESS_SIGNUP_CTA_TEXTS = [
    'sign up for free',
    '無料でサインアップ',
    '無料で始める',
    'start for free',
    'まずは試してみましょう',
    'get started',
    'get team',
    'start now',
    'sign up'
];

const BUSINESS_SIGNUP_COOKIE_TEXTS = [
    'cookie を管理',
    'cookie の設定',
    'cookies を管理',
    'クッキーに関するポリシー',
    '必須項目以外を拒否する',
    'すべて受け入れる',
    'reject non-essential',
    'accept all'
];

const BUSINESS_SIGNUP_PAGE_HINT_TEXTS = [
    'team',
    'teams',
    'business',
    'workspace',
    'small teams',
    'for your team',
    'team plan',
    'チーム',
    'ワークスペース'
];

const BUSINESS_SIGNUP_HOMEPAGE_HINT_TEXTS = [
    'new chat',
    '新しいチャット',
    '画像',
    'image',
    'apps',
    'アプリ'
];

const BUSINESS_SIGNUP_EMAIL_SELECTORS = [
    'input[type="email"]',
    'input[name="email"]',
    'input[placeholder*="メールアドレス"]',
    'input[aria-label*="メールアドレス"]'
];

const BUSINESS_SIGNUP_PASSWORD_SELECTORS = [
    'input[type="password"]',
    'input[name="new-password"]',
    'input[autocomplete="new-password"]',
    'form[action*="/create-account/password"] input[type="password"]',
    'form[action*="/create-account/password"] input[name="new-password"]',
    'input[placeholder*="パスワード"]',
    'input[placeholder*="Password"]',
    'input[aria-label*="パスワード"]',
    'input[aria-label*="Password"]'
];

const BUSINESS_SIGNUP_PASSWORD_LINK_SELECTORS = [
    'a[href="/log-in/password"]',
    'a[href*="/log-in/password"]'
];

const BUSINESS_SIGNUP_CODE_SELECTORS = [
    'input[autocomplete="one-time-code"]',
    'input[name="code"]',
    'input[name="otp"]',
    'input[maxlength="6"]',
    'input[placeholder*="code"]',
    'input[placeholder*="Code"]',
    'input[placeholder*="コード"]',
    'form input[inputmode="numeric"]'
];

function normalizeSignupText(value = '') {
    return String(value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasBusinessSignupCtaText(text = '') {
    const normalizedText = normalizeSignupText(text);
    return BUSINESS_SIGNUP_CTA_TEXTS.some((candidate) =>
        normalizedText.includes(normalizeSignupText(candidate))
    );
}

function hasCookieConsentText(text = '') {
    const normalizedText = normalizeSignupText(text);
    return BUSINESS_SIGNUP_COOKIE_TEXTS.some((candidate) =>
        normalizedText.includes(normalizeSignupText(candidate))
    );
}

function hasBusinessSignupPageHints(text = '', url = '') {
    const normalizedText = normalizeSignupText(text);
    const normalizedUrl = normalizeSignupText(url);

    return normalizedUrl.includes('/team-sign-up') ||
        BUSINESS_SIGNUP_PAGE_HINT_TEXTS.some((candidate) =>
            normalizedText.includes(normalizeSignupText(candidate))
        );
}

function hasHomepageHints(text = '') {
    const normalizedText = normalizeSignupText(text);
    return BUSINESS_SIGNUP_HOMEPAGE_HINT_TEXTS.some((candidate) =>
        normalizedText.includes(normalizeSignupText(candidate))
    );
}

function classifyBusinessSignupEntryState({
    url = '',
    text = '',
    hasEmailField = false,
    buttonTexts = [],
    hasChatShellComposer = false,
    hasCookieBanner = false
} = {}) {
    if (hasEmailField) {
        return 'email';
    }

    if (hasCookieBanner || hasCookieConsentText(text)) {
        return 'cookie';
    }

    const hasCta = buttonTexts.some((buttonText) => hasBusinessSignupCtaText(buttonText));
    const hasTeamHints = hasBusinessSignupPageHints(text, url);

    if (hasChatShellComposer || (!hasTeamHints && hasHomepageHints(text))) {
        return 'homepage';
    }

    if (hasCta && (hasTeamHints || normalizeSignupText(url).includes('#team-pricing'))) {
        return 'cta';
    }

    return 'unknown';
}

function isPasswordStepState({ url = '', text = '', hasPasswordField = false } = {}) {
    return classifyEmailNextStepState({
        url,
        text,
        hasPasswordField
    }) === 'password';
}

function classifyEmailNextStepState({
    url = '',
    text = '',
    hasPasswordField = false,
    hasPasswordLink = false,
    hasCodeField = false
} = {}) {
    const normalizedUrl = String(url).toLowerCase();
    const normalizedText = String(text).toLowerCase();

    if (
        hasPasswordField ||
        hasPasswordLink ||
        normalizedUrl.includes('/create-account/password') ||
        normalizedText.includes('パスワードの作成') ||
        normalizedText.includes('create a password') ||
        normalizedText.includes('パスワードで続行') ||
        normalizedText.includes('パスワード')
    ) {
        return 'password';
    }

    if (
        hasCodeField ||
        normalizedUrl.includes('/verify') ||
        normalizedUrl.includes('/challenge') ||
        normalizedText.includes('受信箱を確認してください') ||
        normalizedText.includes('確認コード') ||
        normalizedText.includes('認証コード') ||
        normalizedText.includes('verification code') ||
        normalizedText.includes('one-time code') ||
        normalizedText.includes('コードを入力')
    ) {
        return 'code';
    }

    return 'unknown';
}

module.exports = {
    BUSINESS_SIGNUP_CTA_TEXTS,
    BUSINESS_SIGNUP_COOKIE_TEXTS,
    BUSINESS_SIGNUP_CODE_SELECTORS,
    BUSINESS_SIGNUP_DIRECT_URL,
    BUSINESS_SIGNUP_EMAIL_SELECTORS,
    BUSINESS_SIGNUP_PASSWORD_LINK_SELECTORS,
    BUSINESS_SIGNUP_PASSWORD_SELECTORS,
    BUSINESS_SIGNUP_PRICING_URL,
    classifyBusinessSignupEntryState,
    classifyEmailNextStepState,
    hasBusinessSignupPageHints,
    hasBusinessSignupCtaText,
    hasCookieConsentText,
    hasHomepageHints,
    isPasswordStepState
};
