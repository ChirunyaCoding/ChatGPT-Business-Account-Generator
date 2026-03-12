const DEFAULT_DISCORD_STARTUP_MAX_ATTEMPTS = 4;
const DEFAULT_DISCORD_STARTUP_RETRY_DELAY_MS = 4000;

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableDiscordStartupError(error) {
    if (!error) {
        return false;
    }

    const code = typeof error.code === 'string' ? error.code : '';
    const message = typeof error.message === 'string' ? error.message : '';
    const hostname = typeof error.hostname === 'string' ? error.hostname.toLowerCase() : '';
    const normalizedMessage = message.toLowerCase();
    const status = Number.isFinite(error.status) ? error.status : null;

    if (['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED'].includes(code)) {
        return true;
    }

    if (status !== null && [429, 500, 502, 503, 504].includes(status)) {
        return true;
    }

    return Boolean(
        hostname === 'discord.com' ||
        hostname === 'discordapp.com' ||
        normalizedMessage.includes('getaddrinfo enotfound discord.com') ||
        normalizedMessage.includes('getaddrinfo enotfound discordapp.com') ||
        normalizedMessage.includes('fetch failed') ||
        normalizedMessage.includes('network error') ||
        normalizedMessage.includes('connect timeout') ||
        normalizedMessage.includes('socket hang up')
    );
}

function formatDiscordStartupError(error) {
    if (!error) {
        return '不明な起動エラーが発生しました。';
    }

    const code = typeof error.code === 'string' ? error.code : '';
    const hostname = typeof error.hostname === 'string' ? error.hostname : '';
    const message = typeof error.message === 'string' ? error.message : String(error);

    if (isRetryableDiscordStartupError(error)) {
        if (code === 'ENOTFOUND' && hostname) {
            return `${hostname} の名前解決に失敗しました。VPN または DNS の状態を確認してください。`;
        }

        return `Discord への接続に失敗しました。VPN またはネットワークの状態を確認してください。\n${message}`;
    }

    return message;
}

async function retryDiscordStartupStep(stepName, task, options = {}) {
    const maxAttempts = options.maxAttempts ?? DEFAULT_DISCORD_STARTUP_MAX_ATTEMPTS;
    const retryDelayMs = options.retryDelayMs ?? DEFAULT_DISCORD_STARTUP_RETRY_DELAY_MS;
    const log = options.log ?? console.log;

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await task();
        } catch (error) {
            lastError = error;

            if (!isRetryableDiscordStartupError(error) || attempt === maxAttempts) {
                break;
            }

            const waitMs = retryDelayMs * attempt;
            log(
                `⚠️ ${stepName} に失敗しました。` +
                `一時的なネットワーク障害の可能性があるため再試行します ` +
                `(${attempt}/${maxAttempts - 1}, ${Math.ceil(waitMs / 1000)}秒待機)`
            );
            await sleep(waitMs);
        }
    }

    throw lastError;
}

module.exports = {
    DEFAULT_DISCORD_STARTUP_MAX_ATTEMPTS,
    DEFAULT_DISCORD_STARTUP_RETRY_DELAY_MS,
    formatDiscordStartupError,
    isRetryableDiscordStartupError,
    retryDiscordStartupStep
};
