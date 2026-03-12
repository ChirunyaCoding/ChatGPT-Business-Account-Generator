const test = require('node:test');
const assert = require('node:assert/strict');

const { withTimeout } = require('../src/utils/promise-timeout');

test('withTimeout: 期限内に完了した task の結果を返す', async () => {
    const result = await withTimeout(() => 'ok', 50, 'fallback');
    assert.equal(result, 'ok');
});

test('withTimeout: timeout 時は fallback を返す', async () => {
    const result = await withTimeout(
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 30)),
        5,
        'fallback'
    );
    assert.equal(result, 'fallback');
});
