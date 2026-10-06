const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { root } = require('./rust-tools.cjs');
const { sha256 } = require('../bench/lib/reference.cjs');

// This records a runtime compatibility risk; it does not change or bless the
// immutable Node/V8 oracle. Run with the Node version required by Playwright.
async function main() {
    const pw = process.env.MWI_PLAYWRIGHT_PATH ? require(process.env.MWI_PLAYWRIGHT_PATH) : require('playwright');
    const reference = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/encounters/manifest.json')));
    const bytes = fs.readFileSync(path.join(root, '.wasm-build/encounters/math.json'));
    assert.equal(sha256(bytes), reference.math.sha256);
    const math = JSON.parse(bytes);
    const browser = await pw.chromium.launch({ channel: process.env.MWI_BROWSER_CHANNEL || 'msedge', headless: true });
    try {
        const page = await browser.newPage();
        const actual = await page.evaluate(values => JSON.parse(JSON.stringify(values.map(x => Math.pow(x, 1.4)))), math.cases[0].values);
        const differences = actual.map((value, index) => ({ index, input: math.cases[0].values[index],
            expected: math.expected[0][index], actual: value })).filter(row => row.expected !== row.actual);
        const report = { schemaVersion: 1, phase: 'P2.2', createdAt: new Date().toISOString(), browserVersion: browser.version(),
            referenceRuntime: reference.referenceRuntime, engineSourceSha256: reference.engineSourceSha256,
            dataFingerprint: reference.dataFingerprint, mathSha256: reference.math.sha256,
            values: actual.length, differences: differences.length, firstDifferences: differences.slice(0, 10),
            matchesFrozenPow: differences.length === 0 };
        const output = path.join(root, '.bench/rust-wasm-p2-events'); fs.mkdirSync(output, { recursive: true });
        fs.writeFileSync(path.join(output, 'browser-pow-audit.json'), JSON.stringify(report, null, 2));
        console.log(`Edge ${report.browserVersion}: ${report.differences}/${report.values} native pow values differ from the frozen JS runtime; audit saved`);
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
