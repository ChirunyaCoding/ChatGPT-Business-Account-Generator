function getStripeAddressFieldSelectors() {
    return {
        name: [
            '#billingAddress-nameInput',
            'input[name="name"]',
            'input[autocomplete*="name"]',
            'input[autocomplete*="given-name"]',
            'input[autocomplete*="family-name"]',
            'input[id*="name" i]',
            'input[placeholder*="氏名" i]',
            'input[placeholder*="Name" i]',
            'input[aria-label*="name" i]',
            '[data-testid*="name"] input'
        ],
        country: [
            '#billingAddress-countryInput',
            'select[name="country"]',
            'input[name="country"]',
            'input[autocomplete*="country"]',
            'button[role="combobox"][aria-label*="Country"]',
            'button[role="combobox"][aria-label*="国"]',
            '[role="combobox"][aria-label*="country" i]',
            'select[id*="country" i]'
        ],
        line1: [
            '#billingAddress-addressLine1Input',
            'input[name="addressLine1"]',
            'input[name="line1"]',
            'input[name="address_line1"]',
            'input[autocomplete*="address-line1"]',
            'input[autocomplete*="address line1"]',
            'input[id*="address" i]',
            'input[placeholder*="住所" i]',
            'input[placeholder*="Address" i]',
            'input[aria-label*="address" i]',
            '[data-testid*="address"] input'
        ],
        postal: [
            '#billingAddress-postalCodeInput',
            'input[name="postalCode"]',
            'input[name="postal_code"]',
            'input[name="postal"]',
            'input[autocomplete*="postal-code"]',
            'input[autocomplete*="postal_code"]',
            'input[autocomplete*="zip"]',
            'input[id*="postal" i]',
            'input[placeholder*="郵便" i]',
            'input[placeholder*="Postal" i]',
            'input[placeholder*="ZIP" i]',
            'input[aria-label*="postal" i]'
        ],
        city: [
            '#billingAddress-localityInput',
            'input[name="locality"]',
            'input[name="city"]',
            'input[autocomplete*="address-level2"]',
            'input[autocomplete*="city"]',
            'input[id*="city" i]',
            'input[placeholder*="市" i]',
            'input[placeholder*="City" i]',
            'input[aria-label*="city" i]',
            '[data-testid*="city"] input'
        ]
    };
}

function getStripeAddressFrameProbeSelectors() {
    const selectors = [
        '#billingAddress-nameInput',
        '#billingAddress-countryInput',
        '#billingAddress-addressLine1Input',
        '#billingAddress-postalCodeInput',
        '#billingAddress-localityInput',
        'input[name="addressLine1"]',
        'input[name="postalCode"]',
        'input[name="locality"]'
    ];

    const normalized = selectors
        .filter((value) => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim());

    return Array.from(new Set(normalized));
}

function scoreStripeAddressFrameCandidate(candidate = {}) {
    const haystack = [
        candidate.url || '',
        candidate.name || '',
        candidate.id || ''
    ].join(' ').toLowerCase();

    let score = 0;

    if (haystack.includes('stripe')) score += 4;
    if (haystack.includes('__privatestripeframe')) score += 3;
    if (haystack.includes('elements-inner-address')) score += 10;
    if (haystack.includes('address')) score += 7;
    if (haystack.includes('autocomplete')) score += 2;
    if (haystack.includes('payment')) score -= 6;
    if (haystack.includes('universal-link')) score -= 8;
    if (haystack.includes('google-maps')) score -= 4;

    score += Math.max(0, Number(candidate.matchedProbeCount) || 0) * 12;

    return score;
}

function sortStripeAddressFrameCandidates(candidates = []) {
    return [...candidates]
        .map((candidate) => ({
            ...candidate,
            priority: scoreStripeAddressFrameCandidate(candidate)
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

module.exports = {
    getStripeAddressFieldSelectors,
    getStripeAddressFrameProbeSelectors,
    scoreStripeAddressFrameCandidate,
    sortStripeAddressFrameCandidates
};
