const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getStripeAddressFieldSelectors,
    getStripeAddressFrameProbeSelectors,
    scoreStripeAddressFrameCandidate,
    sortStripeAddressFrameCandidates
} = require('../src/utils/stripe-address');

test('getStripeAddressFieldSelectors: 主要フィールドのセレクタが存在する', () => {
    const selectors = getStripeAddressFieldSelectors();

    assert.ok(selectors.name.length > 0);
    assert.ok(selectors.country.length > 0);
    assert.ok(selectors.line1.length > 0);
    assert.ok(selectors.postal.length > 0);
    assert.ok(selectors.city.length > 0);
});

test('getStripeAddressFieldSelectors: Stripe系のautocompleteに対応できる', () => {
    const selectors = getStripeAddressFieldSelectors();

    assert.ok(selectors.line1.some(s => s.includes('autocomplete') && s.includes('address-line1')));
    assert.ok(selectors.postal.some(s => s.includes('autocomplete') && s.includes('postal')));
    assert.ok(selectors.city.some(s => s.includes('autocomplete') && s.includes('address-level2')));
    assert.ok(selectors.country.some(s => s.includes('autocomplete') && s.includes('country')));
});

test('getStripeAddressFrameProbeSelectors: 住所フォーム主要IDを含む', () => {
    const selectors = getStripeAddressFrameProbeSelectors();
    const requiredSelectors = [
        '#billingAddress-nameInput',
        '#billingAddress-countryInput',
        '#billingAddress-addressLine1Input',
        '#billingAddress-postalCodeInput',
        '#billingAddress-localityInput'
    ];

    for (const selector of requiredSelectors) {
        assert.ok(selectors.includes(selector));
    }
});

test('getStripeAddressFrameProbeSelectors: 空文字や重複がない', () => {
    const selectors = getStripeAddressFrameProbeSelectors();
    const uniqueSelectors = new Set(selectors);

    assert.equal(selectors.length, uniqueSelectors.size);
    assert.ok(selectors.every(s => typeof s === 'string' && s.trim().length > 0));
});

test('scoreStripeAddressFrameCandidate: 住所フレームを支払いフレームより高く評価する', () => {
    const addressScore = scoreStripeAddressFrameCandidate({
        url: 'https://js.stripe.com/v3/elements-inner-address-123.html',
        name: '__privateStripeFrame9',
        matchedProbeCount: 5
    });
    const paymentScore = scoreStripeAddressFrameCandidate({
        url: 'https://js.stripe.com/v3/elements-inner-payment-123.html',
        name: '__privateStripeFrame8',
        matchedProbeCount: 0
    });

    assert.ok(addressScore > paymentScore);
});

test('sortStripeAddressFrameCandidates: probe一致の多い住所フレームを先頭に並べる', () => {
    const ranked = sortStripeAddressFrameCandidates([
        {
            id: 'payment',
            url: 'https://js.stripe.com/v3/elements-inner-payment-123.html',
            name: '__privateStripeFrame8',
            matchedProbeCount: 0
        },
        {
            id: 'maps',
            url: 'https://js.stripe.com/v3/google-maps-inner-123.html',
            name: '__privateStripeFrame10',
            matchedProbeCount: 0
        },
        {
            id: 'address',
            url: 'https://js.stripe.com/v3/elements-inner-address-123.html',
            name: '__privateStripeFrame9',
            matchedProbeCount: 5
        }
    ]);

    assert.equal(ranked[0].id, 'address');
});
