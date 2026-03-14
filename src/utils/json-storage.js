const fs = require('fs');
const path = require('path');

function buildCorruptBackupPath(filePath) {
    const directory = path.dirname(filePath);
    const extension = path.extname(filePath);
    const basename = path.basename(filePath, extension);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    return path.join(directory, `${basename}.corrupt-${timestamp}${extension || '.json'}`);
}

function safeLoadJsonFile(filePath, defaultValue, options = {}) {
    const label = options.label || 'JSON';
    const backupCorruptFile = options.backupCorruptFile || false;

    try {
        if (!fs.existsSync(filePath)) {
            return defaultValue;
        }

        const content = fs.readFileSync(filePath, 'utf8');
        if (!content.trim()) {
            return defaultValue;
        }

        return JSON.parse(content);
    } catch (error) {
        if (backupCorruptFile && fs.existsSync(filePath)) {
            const backupPath = buildCorruptBackupPath(filePath);

            try {
                fs.renameSync(filePath, backupPath);
                console.warn(`⚠️ ${label}の壊れたJSONを退避しました: ${backupPath}`);
            } catch (backupError) {
                console.warn(`⚠️ ${label}の壊れたJSON退避に失敗しました: ${backupError.message}`);
            }
        }

        console.error(`${label}読み込みエラー:`, error.message);
        return defaultValue;
    }
}

function writeJsonFileAtomic(filePath, data, options = {}) {
    const ensureDir = options.ensureDir !== false;
    const directory = path.dirname(filePath);
    const tempFilePath = path.join(
        directory,
        `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`
    );

    if (ensureDir && !fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }

    try {
        fs.writeFileSync(tempFilePath, JSON.stringify(data, null, 2));
        fs.renameSync(tempFilePath, filePath);
    } finally {
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}

module.exports = {
    buildCorruptBackupPath,
    safeLoadJsonFile,
    writeJsonFileAtomic
};
