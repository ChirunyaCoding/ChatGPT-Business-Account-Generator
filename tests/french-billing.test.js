const test = require('node:test');
const assert = require('node:assert/strict');

const { createFrenchBillingProfile } = require('../src/utils/french-billing');

test('createFrenchBillingProfile: 必須フィールドを返す', () => {
    const profile = createFrenchBillingProfile();

    assert.match(profile.name, /^[A-Za-z][A-Za-z -]+$/);
    assert.match(profile.street, /^\d{1,3} [A-Za-z0-9' -]+$/);
    assert.match(profile.postalCode, /^\d{5}$/);
    assert.ok(profile.city.length > 0);
    assert.equal(profile.countryCode, 'FR');
    assert.equal(profile.countryName, 'France');
});

test('createFrenchBillingProfile: 固定名 chihalu を返さない', () => {
    const profile = createFrenchBillingProfile();
    assert.notEqual(profile.name.toLowerCase(), 'chihalu');
});
