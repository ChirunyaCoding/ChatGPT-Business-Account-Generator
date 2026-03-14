function buildCreateAccountLogPrefix(options = {}) {
    const accountIndex = options.accountIndex || 0;
    const totalCount = options.totalCount || 0;
    const browserType = options.browserType ? String(options.browserType).toUpperCase() : null;
    const browserLabel = browserType ? ` ${browserType}` : '';

    return `[アカウント ${accountIndex}/${totalCount}${browserLabel}]`;
}

function createPrefixedLineLogger(options = {}) {
    const prefix = options.prefix || '[LOG]';
    const writer = typeof options.writer === 'function' ? options.writer : console.log;
    let buffer = '';

    return {
        push(chunk) {
            if (!chunk) {
                return;
            }

            buffer += String(chunk).replace(/\r\n/g, '\n');

            while (buffer.includes('\n')) {
                const newlineIndex = buffer.indexOf('\n');
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                writer(line ? `${prefix} ${line}` : prefix);
            }
        },
        flush() {
            if (!buffer) {
                return;
            }

            writer(`${prefix} ${buffer}`);
            buffer = '';
        }
    };
}

module.exports = {
    buildCreateAccountLogPrefix,
    createPrefixedLineLogger
};
