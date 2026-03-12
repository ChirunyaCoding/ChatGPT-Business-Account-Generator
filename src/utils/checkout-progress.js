function classifyCheckoutProgress(snapshot = {}) {
    if (snapshot.hasUnknownError) {
        return { state: 'error', reason: 'unknown-error' };
    }

    if (snapshot.hasSuccess) {
        return { state: 'success', reason: 'success' };
    }

    if (snapshot.hasPayPalPage || snapshot.hasPayPalPopup || snapshot.hasPayPalFrame) {
        return { state: 'progress', reason: 'paypal' };
    }

    if (snapshot.hasConfirmAction && !snapshot.hasSubscribeAction) {
        return { state: 'progress', reason: 'confirm' };
    }

    if (snapshot.hasDisabledSubscribeAction) {
        return { state: 'progress', reason: 'subscribe-disabled' };
    }

    if (!snapshot.hasSubscribeAction && (snapshot.hasAddressForm || snapshot.hadSubscribeContext)) {
        return { state: 'progress', reason: 'subscribe-dismissed' };
    }

    return { state: 'waiting', reason: 'waiting' };
}

module.exports = {
    classifyCheckoutProgress
};
