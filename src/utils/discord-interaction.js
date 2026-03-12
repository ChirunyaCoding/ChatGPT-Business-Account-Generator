/**
 * Discord interaction helper utilities.
 * Unknown interaction (10062) is treated as an expected expiration case.
 */

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
    if (interaction?.deferred || interaction?.replied) {
        // 既にACK済みのためdeferをスキップして継続する
        return true;
    }

    try {
        await interaction.deferReply(payload);
        return true;
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            console.warn('⚠️ 期限切れのInteractionのためdeferReplyをスキップしました (10062)');
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
    try {
        await interaction.editReply(payload);
        return true;
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            console.warn('⚠️ 期限切れまたは無効化されたInteractionのためeditReplyをスキップしました');
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
