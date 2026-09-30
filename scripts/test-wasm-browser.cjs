const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { root } = require('./rust-tools.cjs');

async function main() {
    const playwright = process.env.MWI_PLAYWRIGHT_PATH ? require(process.env.MWI_PLAYWRIGHT_PATH) : require('playwright');
    const oldReports = path.join(root, '.bench/rust-wasm-p1');
    const historical = path.join(oldReports, 'p1-20260930');
    fs.mkdirSync(historical, { recursive: true });
    for (const name of ['browser-root.json', 'browser-pages.json']) {
        const previous = path.join(oldReports, name), backup = path.join(historical, name);
        if (fs.existsSync(previous) && !fs.existsSync(backup)) fs.copyFileSync(previous, backup, fs.constants.COPYFILE_EXCL);
    }
    const server = spawn(process.execPath, ['scripts/serve-wasm-prototype.cjs'], {
        cwd: root, env: { ...process.env, MWI_PROTOTYPE_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let browser;
    try {
        const origin = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Prototype server startup timeout')), 10_000);
            server.once('error', error => { clearTimeout(timer); reject(error); });
            server.once('exit', code => { clearTimeout(timer); reject(new Error(`Prototype server exited ${code}`)); });
            server.stdout.on('data', chunk => {
                const match = String(chunk).match(/P1 prototype: (http:\/\/127\.0\.0\.1:\d+\/)/);
                if (match) { clearTimeout(timer); resolve(match[1]); }
            });
            server.stderr.on('data', chunk => process.stderr.write(chunk));
        });
        browser = await playwright.chromium.launch({ channel: process.env.MWI_BROWSER_CHANNEL || 'msedge', headless: true });
        const context = await browser.newContext();
        for (const [relative, phase, count] of [['', 'P1', 12], ['MWICombatSimulatorTest/dist/', 'P1', 12],
            ['attributes.html', 'P2.1', 7], ['MWICombatSimulatorTest/dist/attributes.html', 'P2.1', 7],
            ['encounters.html', 'P2.2', 11], ['MWICombatSimulatorTest/dist/encounters.html', 'P2.2', 11]]) {
            const page = await context.newPage();
            const saved = page.waitForResponse(response => response.url().endsWith(phase === 'P1' ? '/__prototype_report' : phase === 'P2.1' ? '/__attribute_report' : '/__encounter_report'), { timeout: 180_000 });
            await page.goto(origin + relative);
            const response = await saved;
            if (!response.ok()) throw new Error(`Browser report save failed: ${relative}`);
            const report = await page.locator('#details').textContent().then(JSON.parse);
            if (!report.passed || report.tests.length !== count || report.tests.some(test => !test.passed)) {
                throw new Error(`${relative || '/'}: ${JSON.stringify(report.tests.filter(test => !test.passed))}`);
            }
            console.log(`${relative || '/'}: ${count}/${count} passed in actual headless Edge Worker`);
            await page.close();
        }
    } finally {
        if (browser) await browser.close();
        server.kill();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
