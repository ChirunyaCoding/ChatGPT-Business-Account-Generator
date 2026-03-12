const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyCheckoutProgress } = require('../src/utils/checkout-progress');

test('classifyCheckoutProgress: unknown error を error と判定する', () => {
    const result = classifyCheckoutProgress({ hasUnknownError: true });
    assert.equal(result.state, 'error');
});

test('classifyCheckoutProgress: PayPal遷移を progress と判定する', () => {
    const result = classifyCheckoutProgress({ hasPayPalPage: true });
    assert.equal(result.state, 'progress');
    assert.equal(result.reason, 'paypal');
});

test('classifyCheckoutProgress: confirm 表示を progress と判定する', () => {
    const result = classifyCheckoutProgress({
        hasConfirmAction: true,
        hasSubscribeAction: false
    });
    assert.equal(result.state, 'progress');
    assert.equal(result.reason, 'confirm');
});

test('classifyCheckoutProgress: subscribe 無効化を progress と判定する', () => {
    const result = classifyCheckoutProgress({ hasDisabledSubscribeAction: true });
    assert.equal(result.state, 'progress');
});

test('classifyCheckoutProgress: 何もなければ waiting と判定する', () => {
    const result = classifyCheckoutProgress({});
    assert.equal(result.state, 'waiting');
});
