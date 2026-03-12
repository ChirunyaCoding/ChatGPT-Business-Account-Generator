const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('src/puppeteer_activation.js: 重複宣言を含む構文エラーがない', () => {
    const filePath = path.join(__dirname, '..', 'src', 'puppeteer_activation.js');
    const source = fs.readFileSync(filePath, 'utf8');
    const wrappedSource = `(function(exports, require, module, __filename, __dirname) {\n${source}\n})`;

    assert.doesNotThrow(() => {
        new vm.Script(wrappedSource, { filename: filePath });
    });
});
