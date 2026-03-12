const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isUnknownInteractionError,
    isAlreadyAcknowledgedInteractionError,
    safeDeferReply,
    safeEditReply
} = require('../src/utils/discord-interaction');

async function withMutedConsoleWarn(task) {
    const originalWarn = console.warn;
    console.warn = () => {};
    try {
        return await task();
    } finally {
        console.warn = originalWarn;
    }
}

test('isUnknownInteractionError: code 10062 を検知できる', () => {
    assert.equal(isUnknownInteractionError({ code: 10062 }), true);
    assert.equal(isUnknownInteractionError({ rawError: { code: 10062 } }), true);
    assert.equal(isUnknownInteractionError({ message: 'Unknown interaction' }), true);
});

test('isAlreadyAcknowledgedInteractionError: code 40060 を検知できる', () => {
    assert.equal(isAlreadyAcknowledgedInteractionError({ code: 40060 }), true);
    assert.equal(isAlreadyAcknowledgedInteractionError({ rawError: { code: 40060 } }), true);
    assert.equal(isAlreadyAcknowledgedInteractionError({ message: 'Interaction has already been acknowledged.' }), true);
});

test('safeDeferReply: 正常時に true を返す', async () => {
    const interaction = {
        deferReply: async () => undefined
    };

    const result = await safeDeferReply(interaction, { flags: 64 });
    assert.equal(result, true);
});

test('safeDeferReply: 既にACK済みなら deferReply を呼ばず true を返す', async () => {
    let called = false;
    const interaction = {
        deferred: true,
        deferReply: async () => {
            called = true;
        }
    };

    const result = await safeDeferReply(interaction, { flags: 64 });
    assert.equal(result, true);
    assert.equal(called, false);
});

test('safeDeferReply: 10062 は例外化せず false を返す（回帰テスト）', async () => {
    const interaction = {
        deferReply: async () => {
            throw { code: 10062, message: 'Unknown interaction' };
        }
    };

    const result = await withMutedConsoleWarn(() => safeDeferReply(interaction, { flags: 64 }));
    assert.equal(result, false);
});

test('safeDeferReply: 40060 は例外化せず true を返す（回帰テスト）', async () => {
    const interaction = {
        deferReply: async () => {
            throw { code: 40060, message: 'Interaction has already been acknowledged.' };
        }
    };

    const result = await withMutedConsoleWarn(() => safeDeferReply(interaction, { flags: 64 }));
    assert.equal(result, true);
});

test('safeEditReply: 10062 は例外化せず false を返す（回帰テスト）', async () => {
    const interaction = {
        editReply: async () => {
            throw { rawError: { code: 10062 } };
        }
    };

    const result = await withMutedConsoleWarn(() => safeEditReply(interaction, { embeds: [] }));
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
