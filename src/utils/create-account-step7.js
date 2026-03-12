const VERIFICATION_CODE_INPUT_SELECTORS = [
    'input[autocomplete="one-time-code"]',
    'input[maxlength="6"]',
    'input[name="code"]',
    'input#code',
    'input[placeholder*="code"]',
    'input[placeholder*="コード"]',
    'input[type="text"]'
];

const PASSWORD_INPUT_SELECTORS = [
    'input[type="password"]',
    'input[name="new-password"]'
];

const RETRY_BUTTON_TEXTS = [
    'もう一度試す',
    'Try again'
];

const RETRYABLE_ERROR_TEXTS = [
    '不明なエラーが発生しました',
    'An unknown error occurred',
    'エラーが発生しました',
    'An error occurred',
    '問題が発生しました',
    'Something went wrong',
    'Operation timed out'
];

function includesKnownText(text = '', candidates = []) {
    if (typeof text !== 'string' || text.length === 0) {
        return false;
    }

    return candidates.some((candidate) => text.includes(candidate));
}

function hasRetryButton(buttons = []) {
    if (!Array.isArray(buttons)) {
        return false;
    }

    return buttons.some((button) => {
        const text = typeof button?.text === 'string' ? button.text.trim() : '';
        const actionName = typeof button?.actionName === 'string' ? button.actionName : '';
        return includesKnownText(text, RETRY_BUTTON_TEXTS) || actionName === 'Try again';
    });
}

function analyzeStep7State(snapshot = {}) {
    const bodyText = typeof snapshot.bodyText === 'string' ? snapshot.bodyText : '';
    const verificationCodeVisible = Boolean(snapshot.hasVerificationCodeInput);
    const passwordVisible = Boolean(snapshot.hasPasswordInput);
    const retryButtonVisible = hasRetryButton(snapshot.buttons);
    const retryableErrorVisible = includesKnownText(bodyText, RETRYABLE_ERROR_TEXTS);

    if (verificationCodeVisible) {
        return {
            state: 'verification_code',
            shouldRetry: false,
            shouldWaitForCode: true
        };
    }

    if (retryableErrorVisible) {
        return {
            state: 'retryable_error',
            shouldRetry: retryButtonVisible || passwordVisible,
            shouldWaitForCode: false
        };
    }

    if (passwordVisible) {
        return {
            state: 'password',
            shouldRetry: false,
            shouldWaitForCode: false
        };
    }

    return {
        state: 'unknown',
        shouldRetry: false,
        shouldWaitForCode: false
    };
}

module.exports = {
    PASSWORD_INPUT_SELECTORS,
    RETRYABLE_ERROR_TEXTS,
    RETRY_BUTTON_TEXTS,
    VERIFICATION_CODE_INPUT_SELECTORS,
    analyzeStep7State,
    hasRetryButton
};
