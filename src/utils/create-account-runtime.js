const DEFAULT_CREATE_ACCOUNT_CHILD_TIMEOUT_MS = 0;
const MIN_CREATE_ACCOUNT_CHILD_TIMEOUT_MS = 0;
const DEFAULT_CREATE_ACCOUNT_NETWORK_PROFILE = 'vpn';

const CREATE_ACCOUNT_TIMING_PROFILES = {
    standard: {
        delayScale: 1,
        shortDelayMs: 1200,
        selectorTimeoutMs: 15000,
        entryStateTimeoutMs: 20000,
        retryEntryStateTimeoutMs: 10000,
        navigationTimeoutMs: 60000,
        navigationShortTimeoutMs: 30000,
        aboutBlankTimeoutMs: 15000,
        nextStepTimeoutMs: 45000,
        inputTimeoutMs: 45000,
        generatorNavigationTimeoutMs: 45000,
        verificationCodeTimeoutMs: 0,
        verificationCodeIntervalMs: 5000,
        browserLaunchTimeoutMs: 120000,
        browserProtocolTimeoutMs: 120000
    },
    vpn: {
        delayScale: 1.35,
        shortDelayMs: 1800,
        selectorTimeoutMs: 25000,
        entryStateTimeoutMs: 30000,
        retryEntryStateTimeoutMs: 16000,
        navigationTimeoutMs: 90000,
        navigationShortTimeoutMs: 45000,
        aboutBlankTimeoutMs: 25000,
        nextStepTimeoutMs: 70000,
        inputTimeoutMs: 65000,
        generatorNavigationTimeoutMs: 70000,
        verificationCodeTimeoutMs: 0,
        verificationCodeIntervalMs: 7000,
        browserLaunchTimeoutMs: 180000,
        browserProtocolTimeoutMs: 180000
    }
};

function parseCreateAccountResult(output = '') {
    const result = {
        email: null,
        password: null,
        workspace: null,
        browser: null
    };

    const emailMatch = output.match(/Email:\s*([^\s]+@[\w.-]+)/i);
    if (emailMatch) {
        result.email = emailMatch[1];
    }

    const passwordMatch = output.match(/(?:Password|Pass):\s*(\S+)/i);
    if (passwordMatch) {
        result.password = passwordMatch[1];
    }

    const workspaceMatch = output.match(/Workspace:\s*(\S+)/i);
    if (workspaceMatch) {
        result.workspace = workspaceMatch[1];
    }

    const browserMatch = output.match(/(Brave|Chrome)を起動中/i);
    if (browserMatch) {
        result.browser = browserMatch[1].toLowerCase();
    }

    return result;
}

function resolvePuppeteerHeadlessMode(headlessValue) {
    if (headlessValue === true || headlessValue === 'true' || headlessValue === 'new') {
        return 'new';
    }

    return false;
}

function resolveCreateAccountKeepOpen(options = {}) {
    const argv = Array.isArray(options.argv) ? options.argv : process.argv.slice(2);
    const env = options.env || process.env;

    if (env.CREATE_ACCOUNT_KEEP_OPEN === 'true') {
        return true;
    }

    return argv.includes('keep');
}

function resolveCreateAccountChildTimeoutMs(options = {}) {
    const env = options.env || process.env;
    const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_CREATE_ACCOUNT_CHILD_TIMEOUT_MS;
    const minTimeoutMs = options.minTimeoutMs ?? MIN_CREATE_ACCOUNT_CHILD_TIMEOUT_MS;
    const rawValue = options.value ?? env.CREATE_ACCOUNT_CHILD_TIMEOUT_MS;

    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
        return defaultTimeoutMs;
    }

    const normalized = String(rawValue).trim().toLowerCase();
    if (['0', 'off', 'none', 'unlimited', 'infinite', 'false'].includes(normalized)) {
        return 0;
    }

    const parsed = Number.parseInt(String(rawValue ?? ''), 10);

    if (!Number.isFinite(parsed) || parsed < minTimeoutMs) {
        return defaultTimeoutMs;
    }

    return parsed;
}

function isUnlimitedTimeoutMs(timeoutMs) {
    return !Number.isFinite(timeoutMs) || timeoutMs <= 0;
}

function formatTimeoutLimitLabel(timeoutMs, unitLabel = '分') {
    if (isUnlimitedTimeoutMs(timeoutMs)) {
        return '上限なし';
    }

    return `最大${Math.ceil(timeoutMs / 60000)}${unitLabel}`;
}

function resolveCreateAccountNetworkProfile(options = {}) {
    const env = options.env || process.env;
    const rawValue = String(
        options.value ??
        env.CREATE_ACCOUNT_NETWORK_PROFILE ??
        (env.CREATE_ACCOUNT_VPN_MODE === 'true' ? 'vpn' : DEFAULT_CREATE_ACCOUNT_NETWORK_PROFILE)
    ).trim().toLowerCase();

    if (rawValue === 'standard' || rawValue === 'normal') {
        return 'standard';
    }

    if (rawValue === 'vpn' || rawValue === 'slow' || rawValue === 'relaxed') {
        return 'vpn';
    }

    return DEFAULT_CREATE_ACCOUNT_NETWORK_PROFILE;
}

function getCreateAccountTimingProfile(options = {}) {
    const profile = resolveCreateAccountNetworkProfile(options);
    return {
        profile,
        ...CREATE_ACCOUNT_TIMING_PROFILES[profile]
    };
}

function scaleCreateAccountDelay(min, max, options = {}) {
    const delayScale = options.delayScale ??
        getCreateAccountTimingProfile(options).delayScale;

    const scaledMin = Math.max(0, Math.round(min * delayScale));
    const scaledMax = Math.max(scaledMin, Math.round(max * delayScale));

    return {
        min: scaledMin,
        max: scaledMax
    };
}

function isExecutionContextDestroyedError(error) {
    const message = error && typeof error.message === 'string' ? error.message : '';

    return Boolean(
        message.includes('Execution context was destroyed') ||
        message.includes('Cannot find context with specified id') ||
        message.includes('Node is detached from document') ||
        message.includes('JSHandle is disposed')
    );
}

function isTransientNavigationError(error) {
    const message = error && typeof error.message === 'string' ? error.message : '';

    return Boolean(
        message.includes('net::ERR_HTTP2_SERVER_REFUSED_STREAM') ||
        message.includes('net::ERR_HTTP2_PROTOCOL_ERROR') ||
        message.includes('net::ERR_CONNECTION_CLOSED') ||
        message.includes('net::ERR_CONNECTION_RESET') ||
        message.includes('net::ERR_NETWORK_CHANGED') ||
        message.includes('net::ERR_TIMED_OUT') ||
        message.includes('net::ERR_ABORTED')
    );
}

function containsUnsupportedEmailError(text = '') {
    if (typeof text !== 'string' || text.length === 0) {
        return false;
    }

    const normalized = text.toLowerCase();
    return normalized.includes('the email you provided is not supported') ||
        normalized.includes('email you provided is not supported');
}

function createRetryableSignupError(message, code = 'RETRYABLE_SIGNUP') {
    const error = new Error(message);
    error.code = code;
    return error;
}

function shouldRetrySignupAttempt(error) {
    return Boolean(
        error &&
        (
            error.code === 'UNSUPPORTED_EMAIL' ||
            error.code === 'RETRYABLE_SIGNUP' ||
            error.code === 'TRANSIENT_NAVIGATION'
        )
    );
}

function trimLogTail(text, maxLines = 12) {
    if (typeof text !== 'string' || text.trim().length === 0) {
        return '';
    }

    return text
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .slice(-maxLines)
        .join('\n');
}

function summarizeCreateAccountFailure({ code, signal, stdout = '', stderr = '' }) {
    const details = [];

    if (typeof code === 'number' && code !== 0) {
        details.push(`終了コード: ${code}`);
    }

    if (signal) {
        details.push(`終了シグナル: ${signal}`);
    }

    const stderrTail = trimLogTail(stderr);
    const stdoutTail = trimLogTail(stdout);

    if (stderrTail) {
        details.push(stderrTail);
    } else if (stdoutTail) {
        details.push(stdoutTail);
    }

    if (details.length === 0) {
        return 'アカウント情報の取得に失敗しました';
    }

    return `アカウント情報の取得に失敗しました\n${details.join('\n')}`;
}

async function withExecutionContextRetry(task, options = {}) {
    const retries = options.retries ?? 2;
    const delayMs = options.delayMs ?? 500;
    const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await task();
        } catch (error) {
            if (!isExecutionContextDestroyedError(error) || attempt === retries) {
                throw error;
            }

            await sleep(delayMs);
        }
    }

    throw new Error('Execution context retry exceeded unexpectedly');
}

module.exports = {
    containsUnsupportedEmailError,
    createRetryableSignupError,
    CREATE_ACCOUNT_TIMING_PROFILES,
    DEFAULT_CREATE_ACCOUNT_CHILD_TIMEOUT_MS,
    DEFAULT_CREATE_ACCOUNT_NETWORK_PROFILE,
    formatTimeoutLimitLabel,
    isExecutionContextDestroyedError,
    isTransientNavigationError,
    isUnlimitedTimeoutMs,
    MIN_CREATE_ACCOUNT_CHILD_TIMEOUT_MS,
    getCreateAccountTimingProfile,
    parseCreateAccountResult,
    resolveCreateAccountChildTimeoutMs,
    resolveCreateAccountNetworkProfile,
    resolveCreateAccountKeepOpen,
    resolvePuppeteerHeadlessMode,
    scaleCreateAccountDelay,
    shouldRetrySignupAttempt,
    summarizeCreateAccountFailure,
    withExecutionContextRetry
};
