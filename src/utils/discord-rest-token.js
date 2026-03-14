function hasDiscordRestToken(discordClient) {
    return Boolean(discordClient?.rest?.token);
}

function ensureDiscordRestToken(discordClient, token) {
    if (hasDiscordRestToken(discordClient)) {
        return true;
    }

    if (!discordClient?.rest || typeof discordClient.rest.setToken !== 'function' || !token) {
        return false;
    }

    discordClient.rest.setToken(token);
    return hasDiscordRestToken(discordClient);
}

function isMissingDiscordRestTokenError(error) {
    if (!error || typeof error !== 'object') {
        return false;
    }

    return typeof error.message === 'string' &&
        error.message.includes('Expected token to be set for this request');
}

module.exports = {
    hasDiscordRestToken,
    ensureDiscordRestToken,
    isMissingDiscordRestTokenError
};
