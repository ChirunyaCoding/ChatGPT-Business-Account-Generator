const DEFAULT_MAX_DESCRIPTION_LENGTH = 3500;
const MAX_PROGRESS_BLOCKS_PER_EMBED = 10;
const MAX_RESULT_BLOCKS_PER_EMBED = 8;

function splitLongLine(line, maxLength) {
    if (!line) {
        return [''];
    }

    const fragments = [];
    let startIndex = 0;

    while (startIndex < line.length) {
        fragments.push(line.slice(startIndex, startIndex + maxLength));
        startIndex += maxLength;
    }

    return fragments;
}

function splitOversizedBlock(block, maxLength) {
    const lines = String(block).split('\n');
    const parts = [];
    let current = '';

    const pushCurrent = () => {
        if (current) {
            parts.push(current);
            current = '';
        }
    };

    for (const line of lines) {
        const lineFragments = splitLongLine(line, maxLength);

        for (const fragment of lineFragments) {
            const candidate = current ? `${current}\n${fragment}` : fragment;

            if (candidate.length <= maxLength) {
                current = candidate;
                continue;
            }

            pushCurrent();
            current = fragment;
        }
    }

    pushCurrent();
    return parts;
}

function chunkTextBlocks(blocks, options = {}) {
    const maxLength = options.maxLength || DEFAULT_MAX_DESCRIPTION_LENGTH;
    const maxBlocks = options.maxBlocks || Number.POSITIVE_INFINITY;
    const joiner = options.joiner || '\n\n';
    const normalizedBlocks = [];

    for (const block of blocks || []) {
        if (!block) {
            continue;
        }

        const trimmed = String(block).trim();
        if (!trimmed) {
            continue;
        }

        if (trimmed.length > maxLength) {
            normalizedBlocks.push(...splitOversizedBlock(trimmed, maxLength));
            continue;
        }

        normalizedBlocks.push(trimmed);
    }

    const chunks = [];
    let currentBlocks = [];
    let currentDescription = '';

    const pushCurrent = () => {
        if (currentDescription) {
            chunks.push(currentDescription);
            currentBlocks = [];
            currentDescription = '';
        }
    };

    for (const block of normalizedBlocks) {
        const candidate = currentDescription ? `${currentDescription}${joiner}${block}` : block;
        const exceedsLength = candidate.length > maxLength;
        const exceedsBlockCount = currentBlocks.length >= maxBlocks;

        if (currentDescription && (exceedsLength || exceedsBlockCount)) {
            pushCurrent();
        }

        currentBlocks.push(block);
        currentDescription = currentDescription ? `${currentDescription}${joiner}${block}` : block;
    }

    pushCurrent();
    return chunks;
}

function buildCreateAccountProgressDescriptionChunks(options) {
    const count = options.count || 0;
    const progressStatus = options.progressStatus || {};
    const loadingFrame = options.loadingFrame || '⏳';
    const resultsCount = options.resultsCount || 0;
    const errorsCount = options.errorsCount || 0;
    const summaryProcessingCount = Math.max(0, count - resultsCount - errorsCount);
    const blocks = [];

    for (let index = 1; index <= count; index += 1) {
        const status = progressStatus[index] || {};
        const percent = Number.isFinite(status.percent) ? Math.max(0, Math.min(100, status.percent)) : 0;
        const filled = Math.floor(percent / 10);
        const empty = 10 - filled;
        const emoji = status.emoji || '🌐';
        const step = status.step || '待機中';

        if (status.status === '🔄') {
            blocks.push(`${loadingFrame} ${emoji} #${index}: ${'🟩'.repeat(filled)}${'⬜'.repeat(empty)} ${percent}%\n   └ ${step}`);
            continue;
        }

        if (status.status === '✅') {
            blocks.push(`✅ ${emoji} #${index}: 🟩🟩🟩🟩🟩🟩🟩🟩🟩🟩 100%\n   └ 完了`);
            continue;
        }

        if (status.status === '❌') {
            blocks.push(`❌ ${emoji} #${index}: 🟥🟥🟥🟥🟥🟥🟥🟥🟥🟥 ERROR\n   └ ${step}`);
            continue;
        }

        blocks.push(`⏳ ${emoji} #${index}: ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%\n   └ 待機中`);
    }

    blocks.push(
        `━━━━━━━━━━━━━━━━\n✅ 完了: ${resultsCount}  ⏳ 処理中: ${summaryProcessingCount}  ❌ エラー: ${errorsCount}`
    );

    return chunkTextBlocks(blocks, {
        maxLength: options.maxLength,
        maxBlocks: options.maxBlocks || MAX_PROGRESS_BLOCKS_PER_EMBED
    });
}

function buildCreateAccountResultDescriptionChunks(options) {
    const results = options.results || [];
    const savedAccounts = options.savedAccounts || [];
    const keepOpen = options.keepOpen || false;
    const errors = options.errors || [];
    const blocks = [];

    for (const result of results) {
        const browserEmoji = result.browser === 'brave' ? '🦁' : '🌐';
        blocks.push(
            `**アカウント ${result.index}** ${browserEmoji}\n📧 \`${result.email}\`\n🔑 \`${result.password}\``
        );
    }

    if (savedAccounts.length > 0) {
        blocks.push(
            `💾 JSON保存: ${savedAccounts.length}件\n${savedAccounts.map((account) => `・\`${account.name}\``).join('\n')}`
        );
    }

    if (keepOpen) {
        blocks.push('🖥️ keepモードが有効なため、完了後もChromeは開いたままです');
    }

    if (errors.length > 0) {
        blocks.push('**⚠️ エラー**');
        for (const error of errors) {
            const browserEmoji = error.browser === 'brave' ? '🦁' : '🌐';
            blocks.push(`アカウント ${error.index} ${browserEmoji}: ${error.error}`);
        }
    }

    return chunkTextBlocks(blocks, {
        maxLength: options.maxLength,
        maxBlocks: options.maxBlocks || MAX_RESULT_BLOCKS_PER_EMBED
    });
}

module.exports = {
    DEFAULT_MAX_DESCRIPTION_LENGTH,
    MAX_PROGRESS_BLOCKS_PER_EMBED,
    MAX_RESULT_BLOCKS_PER_EMBED,
    chunkTextBlocks,
    buildCreateAccountProgressDescriptionChunks,
    buildCreateAccountResultDescriptionChunks
};
