/**
 * Discord interaction helper utilities.
 * Unknown interaction (10062) is treated as an expected expiration case.
 */

const expiredInteractions = new WeakSet();
const warnedExpiredInteractions = new WeakSet();

function canTrackInteraction(interaction) {
    return Boolean(interaction && typeof interaction === 'object');
}

function isExpiredInteraction(interaction) {
    return canTrackInteraction(interaction) && expiredInteractions.has(interaction);
}

function markExpiredInteraction(interaction) {
    if (!canTrackInteraction(interaction)) {
        return;
    }

    expiredInteractions.add(interaction);
}

function warnExpiredInteractionOnce(interaction, message) {
    if (!canTrackInteraction(interaction)) {
        console.warn(message);
        return;
    }

    if (warnedExpiredInteractions.has(interaction)) {
        return;
    }

    warnedExpiredInteractions.add(interaction);
    console.warn(message);
}

function isUnknownInteractionError(error) {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const code = error.code ?? error.rawError?.code;
    if (code === 10062 || code === 50027) {
        return true;
    }

    return typeof error.message === 'string' && (
        error.message.includes('Unknown interaction') ||
        error.message.includes('Invalid Webhook Token')
    );
}

function isAlreadyAcknowledgedInteractionError(error) {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const code = error.code ?? error.rawError?.code;
    if (code === 40060) {
        return true;
    }

    return typeof error.message === 'string' && error.message.includes('already been acknowledged');
}

async function safeDeferReply(interaction, payload) {
    if (isExpiredInteraction(interaction)) {
        return false;
    }

    if (interaction?.deferred || interaction?.replied) {
        // 既にACK済みのためdeferをスキップして継続する
        return true;
    }

    try {
        await interaction.deferReply(payload);
        return true;
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            markExpiredInteraction(interaction);
            warnExpiredInteractionOnce(interaction, '⚠️ 期限切れのInteractionのためdeferReplyをスキップしました (10062)');
            return false;
        }
        if (isAlreadyAcknowledgedInteractionError(error)) {
            console.warn('⚠️ 既にACK済みのInteractionのためdeferReplyをスキップしました (40060)');
            return true;
        }
        throw error;
    }
}

async function safeEditReply(interaction, payload) {
    if (isExpiredInteraction(interaction)) {
        return false;
    }

    try {
        await interaction.editReply(payload);
        return true;
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            markExpiredInteraction(interaction);
            warnExpiredInteractionOnce(interaction, '⚠️ 期限切れまたは無効化されたInteractionのためeditReplyをスキップしました');
            return false;
        }
        throw error;
    }
}

module.exports = {
    isUnknownInteractionError,
    isAlreadyAcknowledgedInteractionError,
    safeDeferReply,
    safeEditReply
};
