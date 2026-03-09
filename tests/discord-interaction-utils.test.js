const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isUnknownInteractionError,
    safeDeferReply,
    safeEditReply
} = require('../src/utils/discord-interaction');

test('isUnknownInteractionError: code 10062 を検知できる', () => {
    assert.equal(isUnknownInteractionError({ code: 10062 }), true);
    assert.equal(isUnknownInteractionError({ rawError: { code: 10062 } }), true);
    assert.equal(isUnknownInteractionError({ message: 'Unknown interaction' }), true);
});

test('safeDeferReply: 正常時に true を返す', async () => {
    const interaction = {
        deferReply: async () => undefined
    };

    const result = await safeDeferReply(interaction, { flags: 64 });
    assert.equal(result, true);
});

test('safeDeferReply: 10062 は例外化せず false を返す（回帰テスト）', async () => {
    const interaction = {
        deferReply: async () => {
            throw { code: 10062, message: 'Unknown interaction' };
        }
    };

    const result = await safeDeferReply(interaction, { flags: 64 });
    assert.equal(result, false);
});

test('safeEditReply: 10062 は例外化せず false を返す（回帰テスト）', async () => {
    const interaction = {
        editReply: async () => {
            throw { rawError: { code: 10062 } };
        }
    };

    const result = await safeEditReply(interaction, { embeds: [] });
    assert.equal(result, false);
});

test('safeDeferReply: 10062 以外は再スローする', async () => {
    const interaction = {
        deferReply: async () => {
            throw new Error('network error');
        }
    };

    await assert.rejects(() => safeDeferReply(interaction, { flags: 64 }), /network error/);
});
