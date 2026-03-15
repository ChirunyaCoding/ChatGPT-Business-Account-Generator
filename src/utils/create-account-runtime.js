const DEFAULT_CREATE_ACCOUNT_CHILD_TIMEOUT_MS = 0;
const MIN_CREATE_ACCOUNT_CHILD_TIMEOUT_MS = 0;
const DEFAULT_CREATE_ACCOUNT_NETWORK_PROFILE = 'vpn';
const GENERATOR_SESSION_TIMEOUT_CODE = 'GENERATOR_SESSION_TIMEOUT';
const CREATE_ACCOUNT_PROGRESS_MARKERS = [
    {
        step: 'メールアドレス生成中',
        percent: 15,
        matchers: [/Step 1(?:\s*\(Retry \d+\))?:/i]
    },
    {
        step: 'ブラウザ起動中',
        percent: 30,
        matchers: [/Step 2(?:\s*\(Retry \d+\))?:/i]
    },
    {
        step: 'メールアドレス入力中',
        percent: 40,
        matchers: [
            /Step 3(?:\s*\(Retry \d+\))?:/i,
            /Step 4(?:\s*\(Retry \d+\))?:/i
        ]
    },
    {
        step: 'アカウント作成開始',
        percent: 45,
        matchers: [/Step 5(?:\s*\(Retry \d+\))?:/i]
    },
    {
        step: 'パスワード設定中',
        percent: 55,
        matchers: [
            /Step 6(?:\s*\(Retry \d+\))?:/i,
            /Step 7(?:\s*\(Retry \d+\))?:/i
        ]
    },
    {
        step: '検証コード待機中',
        percent: 65,
        matchers: [/Step 8(?:\s*\(Retry \d+\))?:/i]
    },
    {
        step: '検証コード入力中',
        percent: 75,
        matchers: [/Step 9(?:\s*\(Retry \d+\))?:/i]
    },
    {
        step: '検証コード送信中',
        percent: 80,
        matchers: [/Step 10(?:\s*\(Retry \d+\))?:/i]
    },
    {
        step: 'プロフィール設定中',
        percent: 85,
        matchers: [/Step 11(?:\s*\(Retry \d+\))?:/i]
    },
    {
        step: '生年月日設定中',
        percent: 90,
        matchers: [/Step 12(?:\s*\(Retry \d+\))?:/i]
    },
    {
        step: 'アカウント確定中',
        percent: 95,
        matchers: [/Step 13(?:\s*\(Retry \d+\))?:/i]
    },
    {
        step: 'オンボーディング処理中',
        percent: 97,
        matchers: [/Step 14(?:\s*\(Retry \d+\))?:/i]
    },
    {
        step: '完了！',
        percent: 100,
        matchers: [/サインアップ完了/i, /アカウント作成完了/i]
    }
];

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
        mailDays: null,
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

    const mailDaysMatch = output.match(/MailDays:\s*(\d+)/i);
    if (mailDaysMatch) {
        result.mailDays = mailDaysMatch[1];
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

function getLastProgressMatcherIndex(output, matcher) {
    if (typeof output !== 'string' || output.length === 0 || !(matcher instanceof RegExp)) {
        return -1;
    }

    const flags = matcher.flags.includes('g') ? matcher.flags : `${matcher.flags}g`;
    const regex = new RegExp(matcher.source, flags);
    let lastIndex = -1;

    for (const match of output.matchAll(regex)) {
        lastIndex = match.index ?? lastIndex;
    }

    return lastIndex;
}

function resolveCreateAccountProgressUpdate(output = '') {
    if (typeof output !== 'string' || output.length === 0) {
        return null;
    }

    let latestMatch = null;

    for (const marker of CREATE_ACCOUNT_PROGRESS_MARKERS) {
        let markerIndex = -1;

        for (const matcher of marker.matchers) {
            markerIndex = Math.max(markerIndex, getLastProgressMatcherIndex(output, matcher));
        }

        if (markerIndex < 0) {
            continue;
        }

        if (!latestMatch || markerIndex > latestMatch.index) {
            latestMatch = {
                index: markerIndex,
                step: marker.step,
                percent: marker.percent
            };
        }
    }

    return latestMatch
        ? {
            step: latestMatch.step,
            percent: latestMatch.percent
        }
        : null;
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
            error.code === GENERATOR_SESSION_TIMEOUT_CODE ||
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
    GENERATOR_SESSION_TIMEOUT_CODE,
    isExecutionContextDestroyedError,
    isTransientNavigationError,
    isUnlimitedTimeoutMs,
    MIN_CREATE_ACCOUNT_CHILD_TIMEOUT_MS,
    getCreateAccountTimingProfile,
    parseCreateAccountResult,
    resolveCreateAccountProgressUpdate,
    resolveCreateAccountChildTimeoutMs,
    resolveCreateAccountNetworkProfile,
    resolveCreateAccountKeepOpen,
    resolvePuppeteerHeadlessMode,
    scaleCreateAccountDelay,
    shouldRetrySignupAttempt,
    summarizeCreateAccountFailure,
    withExecutionContextRetry
};
