function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout(task, timeoutMs, fallbackValue) {
    return await Promise.race([
        Promise.resolve().then(task),
        sleep(timeoutMs).then(() => fallbackValue)
    ]);
}

module.exports = {
    withTimeout
};
