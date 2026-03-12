const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getStripePayPalTabSelectors,
    getStripePayPalKeywords,
    getStripePayPalFrameProbeSelectors,
    pickStripePaymentDirectCandidates,
    pickStripePaymentProbeCandidates,
    scoreStripeFrameCandidate,
    sortStripeFrameCandidates
} = require('../src/utils/stripe-payment');

test('getStripePayPalTabSelectors: 主要な PayPal タブセレクタを含む', () => {
    const selectors = getStripePayPalTabSelectors();

    assert.ok(selectors.includes('button[data-testid="paypal"]'));
    assert.ok(selectors.includes('[role="tab"][aria-label*="PayPal" i]'));
    assert.ok(selectors.includes('button[value="paypal"]'));
    assert.ok(selectors.includes('img[alt*="PayPal" i]'));
    assert.ok(selectors.includes('[class*="paypal" i]'));
});

test('getStripePayPalTabSelectors: 空文字や重複がない', () => {
    const selectors = getStripePayPalTabSelectors();
    const uniqueSelectors = new Set(selectors);

    assert.equal(selectors.length, uniqueSelectors.size);
    assert.ok(selectors.every((selector) => typeof selector === 'string' && selector.trim().length > 0));
});

test('getStripePayPalKeywords: PayPal関連の語句を保持する', () => {
    const keywords = getStripePayPalKeywords();

    assert.ok(keywords.includes('paypal'));
    assert.ok(keywords.includes('pay with paypal'));
    assert.ok(keywords.every((keyword) => typeof keyword === 'string' && keyword.trim().length > 0));
});

test('getStripePayPalFrameProbeSelectors: exact tab selectors を含む', () => {
    const selectors = getStripePayPalFrameProbeSelectors();

    assert.ok(selectors.includes('button[data-testid="paypal"]'));
    assert.ok(selectors.includes('#paypal-tab'));
    assert.ok(selectors.includes('[aria-controls="paypal-panel"]'));
});

test('scoreStripeFrameCandidate: 支払い系フレームを住所系より高く評価する', () => {
    const paymentScore = scoreStripeFrameCandidate({
        url: 'https://js.stripe.com/v3/elements-inner-payment-123.html',
        name: '__privateStripeFrame8'
    });
    const addressScore = scoreStripeFrameCandidate({
        url: 'https://js.stripe.com/v3/elements-inner-address-123.html',
        name: '__privateStripeFrame9'
    });

    assert.ok(paymentScore > addressScore);
});

test('scoreStripeFrameCandidate: payment iframe を universal-link-modal より高く評価する', () => {
    const paymentScore = scoreStripeFrameCandidate({
        url: 'https://js.stripe.com/v3/elements-inner-payment-123.html',
        name: '__privateStripeFrame8',
        matchedProbeCount: 1
    });
    const modalScore = scoreStripeFrameCandidate({
        url: 'https://js.stripe.com/v3/universal-link-modal-inner-123.html#apiKey=pk_live_xxx',
        name: '__privateStripeFrame7',
        matchedProbeCount: 0
    });

    assert.ok(paymentScore > modalScore);
});

test('sortStripeFrameCandidates: 支払いフレームを先頭に並べる', () => {
    const ranked = sortStripeFrameCandidates([
        { id: 'address', url: 'https://js.stripe.com/v3/elements-inner-address-123.html', name: '__privateStripeFrame9' },
        { id: 'modal', url: 'https://js.stripe.com/v3/universal-link-modal-inner-123.html#apiKey=pk_live_xxx', name: '__privateStripeFrame7', matchedProbeCount: 0 },
        { id: 'main', url: 'about:blank', name: '' },
        { id: 'payment', url: 'https://js.stripe.com/v3/elements-inner-payment-123.html', name: '__privateStripeFrame8', matchedProbeCount: 1 }
    ]);

    assert.equal(ranked[0].id, 'payment');
    assert.equal(ranked[1].id, 'address');
});

test('pickStripePaymentDirectCandidates: 上位候補だけを軽量探索対象にする', () => {
    const candidates = pickStripePaymentDirectCandidates([
        { id: 'address', url: 'https://js.stripe.com/v3/elements-inner-address-123.html', name: '__privateStripeFrame9' },
        { id: 'payment', url: 'https://js.stripe.com/v3/elements-inner-payment-123.html', name: '__privateStripeFrame8' },
        { id: 'maps', url: 'https://js.stripe.com/v3/google-maps-inner-123.html', name: '__privateStripeFrame10' },
        { id: 'autocomplete', url: 'https://js.stripe.com/v3/elements-inner-autocomplete-suggestions-123.html', name: '__privateStripeFrame11' }
    ], 2);

    assert.deepEqual(candidates.map((candidate) => candidate.id), ['payment', 'address']);
});

test('pickStripePaymentProbeCandidates: 深い probe を payment 系フレームに絞る', () => {
    const candidates = pickStripePaymentProbeCandidates([
        { id: 'address', url: 'https://js.stripe.com/v3/elements-inner-address-123.html', name: '__privateStripeFrame9' },
        { id: 'maps', url: 'https://js.stripe.com/v3/google-maps-inner-123.html', name: '__privateStripeFrame10' },
        { id: 'payment', url: 'https://js.stripe.com/v3/elements-inner-payment-123.html', name: '__privateStripeFrame8' },
        { id: 'autocomplete', url: 'https://js.stripe.com/v3/elements-inner-autocomplete-suggestions-123.html', name: '__privateStripeFrame11' }
    ], 2);

    assert.deepEqual(candidates.map((candidate) => candidate.id), ['payment']);
});

test('pickStripePaymentProbeCandidates: payment 系が無い場合は上位候補でフォールバックする', () => {
    const candidates = pickStripePaymentProbeCandidates([
        { id: 'address', url: 'https://js.stripe.com/v3/elements-inner-address-123.html', name: '__privateStripeFrame9' },
        { id: 'generic', url: 'https://js.stripe.com/v3/frame-123.html', name: '__privateStripeFrame8' }
    ], 1);

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].id, 'generic');
});
