function normalizeUnique(values) {
    return Array.from(new Set(
        (values || [])
            .filter((value) => typeof value === 'string' && value.trim().length > 0)
            .map((value) => value.trim())
    ));
}

function buildStripeFrameCandidateHaystack(candidate = {}) {
    return [
        candidate.url || '',
        candidate.name || '',
        candidate.id || ''
    ].join(' ').toLowerCase();
}

// Step 4 の PayPalタブ探索で使う主要セレクタを集約する。
function getStripePayPalTabSelectors() {
    return normalizeUnique([
        'button[data-testid="paypal"]',
        '[data-testid="paypal"]',
        '[data-testid*="paypal" i]',
        'button[value="paypal"]',
        '[value="paypal"]',
        'button[name="paypal"]',
        '[name="paypal"]',
        '#paypal-tab',
        '[role="tab"][data-testid="paypal"]',
        '[role="tab"][aria-label*="PayPal" i]',
        'button[aria-label*="PayPal" i]',
        'label[for*="paypal" i]',
        '[for*="paypal" i]',
        '[aria-controls*="paypal" i]',
        'img[alt*="PayPal" i]',
        'img[src*="paypal"]',
        '[src*="paypal"]',
        '[class*="paypal" i]',
        '[id*="paypal" i]'
    ]);
}

function getStripePayPalKeywords() {
    return normalizeUnique([
        'paypal',
        'pay with paypal',
        'paypalで支払う',
        'paypal checkout'
    ]);
}

function getStripePayPalFrameProbeSelectors() {
    return normalizeUnique([
        'button[data-testid="paypal"]',
        '#paypal-tab',
        'button[value="paypal"]',
        '[data-testid="paypal"]',
        '[aria-controls="paypal-panel"]',
        '[role="tab"][aria-controls="paypal-panel"]'
    ]);
}

// 支払い用フレームを住所用フレームより先に探索するための優先度。
function scoreStripeFrameCandidate(candidate = {}) {
    const haystack = buildStripeFrameCandidateHaystack(candidate);

    let score = 0;

    if (haystack.includes('stripe')) score += 4;
    if (haystack.includes('__privatestripeframe')) score += 3;
    if (haystack.includes('buy.stripe.com')) score += 6;
    if (haystack.includes('checkout.stripe.com')) score += 6;
    if (haystack.includes('elements-inner')) score += 4;
    if (haystack.includes('elements-inner-payment')) score += 12;
    if (haystack.includes('payment')) score += 7;
    if (haystack.includes('paypal')) score += 4;
    if (haystack.includes('pay')) score += 2;
    if (haystack.includes('address')) score -= 6;
    if (haystack.includes('universal-link-modal')) score -= 12;
    if (haystack.includes('google-maps')) score -= 8;
    if (haystack.includes('autocomplete-suggestions')) score -= 6;
    if (haystack.includes('captcha')) score -= 4;
    score += Math.max(0, Number(candidate.matchedProbeCount) || 0) * 15;

    return score;
}

function sortStripeFrameCandidates(candidates = []) {
    return [...candidates]
        .map((candidate) => ({
            ...candidate,
            priority: scoreStripeFrameCandidate(candidate)
        }))
        .filter((candidate) => candidate.priority > 0)
        .sort((left, right) => {
            if (right.priority !== left.priority) {
                return right.priority - left.priority;
            }
            if ((right.matchedProbeCount || 0) !== (left.matchedProbeCount || 0)) {
                return (right.matchedProbeCount || 0) - (left.matchedProbeCount || 0);
            }
            return (left.url || '').length - (right.url || '').length;
        });
}

// Step 4 の最初は URL と name のみで上位候補へ軽く当てる。
function pickStripePaymentDirectCandidates(candidates = [], limit = 3) {
    return sortStripeFrameCandidates(candidates).slice(0, Math.max(1, limit));
}

// 重い probe は payment / paypal 系の強い候補に限定する。
function pickStripePaymentProbeCandidates(candidates = [], limit = 2) {
    const ranked = sortStripeFrameCandidates(candidates);
    const strongMatches = ranked.filter((candidate) => {
        const haystack = buildStripeFrameCandidateHaystack(candidate);
        return haystack.includes('elements-inner-payment') ||
            haystack.includes('payment') ||
            haystack.includes('paypal');
    });

    return (strongMatches.length > 0 ? strongMatches : ranked).slice(0, Math.max(1, limit));
}

module.exports = {
    getStripePayPalTabSelectors,
    getStripePayPalKeywords,
    getStripePayPalFrameProbeSelectors,
    pickStripePaymentDirectCandidates,
    pickStripePaymentProbeCandidates,
    scoreStripeFrameCandidate,
    sortStripeFrameCandidates
};
