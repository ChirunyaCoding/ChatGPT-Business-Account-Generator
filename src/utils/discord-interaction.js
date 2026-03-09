/**
 * Discord interaction helper utilities.
 * Unknown interaction (10062) is treated as an expected expiration case.
 */

function isUnknownInteractionError(error) {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const code = error.code ?? error.rawError?.code;
    if (code === 10062) {
        return true;
    }

    return typeof error.message === 'string' && error.message.includes('Unknown interaction');
}

async function safeDeferReply(interaction, payload) {
    try {
        await interaction.deferReply(payload);
        return true;
    } catch (error) {
        if (isUnknownInteractionError(error)) {
            console.warn('⚠️ 期限切れのInteractionのためdeferReplyをスキップしました (10062)');
            return false;
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
            console.warn('⚠️ 期限切れのInteractionのためeditReplyをスキップしました (10062)');
            return false;
        }
        throw error;
    }
}

module.exports = {
    isUnknownInteractionError,
    safeDeferReply,
    safeEditReply
};
