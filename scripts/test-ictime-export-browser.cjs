const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const pw = require(process.env.MWI_PLAYWRIGHT_PATH || 'playwright');

(async () => {
    const server = http.createServer((req, res) => {
        const file = path.resolve(root, 'dist', '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
        if (!file.startsWith(path.join(root, 'dist') + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
        res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/plain');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await pw.chromium.launch({ channel: 'msedge', headless: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        await page.addInitScript(() => {
            localStorage.setItem('i18nextLng', 'zh');
            Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedJSON = text; } } });
        });
        await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
        await page.locator('#buttonSimulationHistory').click();
        assert(await page.locator('#buttonExportICTime').isDisabled());
        await page.locator('#simulationHistoryModal .btn-close').click();
        await page.evaluate(async () => {
            const record = (id, map, players) => ({
                id, schemaVersion: 2, mapType: 'zone', mapHrid: '/actions/combat/' + map,
                mapKey: 'zone:/actions/combat/' + map, difficulty: 0, createdAt: '2026-10-14T00:00:00Z',
                simulationHours: 24, encountersPerHour: 100, players, playerNames: players.map(p => p.name),
                teamSnapshot: { version: 1, encoding: 'json', data: '{}' },
            });
            const player = (name, slot, rate, food) => ({ name, slot, loadoutName: '', expectedDropsPerHour: { '/items/blue_key_fragment': rate }, consumablesPerHour: { [food]: 12 } });
            const records = [
                record('first', 'fly', [player('Alice', '1', 20, '/items/gummy')]),
                record('second', 'rat', [player('Bob', '1', 99, '/items/gummy'), player('Alice', '2', 25, '/items/super_magic_coffee')]),
            ];
            await new Promise((resolve, reject) => {
                const req = indexedDB.open('mwiCombatSimulatorHistory');
                req.onsuccess = () => {
                    const db = req.result, tx = db.transaction('records', 'readwrite');
                    records.forEach(record => tx.objectStore('records').put(record));
                    tx.oncomplete = () => { db.close(); resolve(); };
                    tx.onerror = () => reject(tx.error);
                };
                req.onerror = () => reject(req.error);
            });
        });
        await page.locator('#buttonSimulationHistory').click();
        await page.waitForFunction(() => document.querySelector('#selectICTimeCharacter option')?.value === 'Alice');
        const copy = async () => {
            await page.locator('#buttonCopyICTime').click();
            return JSON.parse(await page.evaluate(() => window.copiedJSON));
        };
        let data = await copy();
        assert.equal(data.type, 'ICTime_TimeCalculatorEntries');
        assert.equal(data.entries[0].quantityPer24h, 600);
        assert.equal(data.entries[0].drinks[0].itemHrid, '/items/super_magic_coffee');
        const downloadEvent = page.waitForEvent('download');
        await page.locator('#buttonExportICTime').click();
        const download = await downloadEvent;
        assert.match(download.suggestedFilename(), /^ictime-Alice-.*\.json$/);
        assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(), 'utf8')).entries, data.entries);
        await page.locator('#selectICTimeCharacter').selectOption('Bob');
        assert.equal((await copy()).entries[0].quantityPer24h, 2376);
        await page.locator('#selectSimulationHistoryMap').selectOption('zone:/actions/combat/fly');
        await page.locator('[data-history-selection="first"]').check();
        assert.equal(await page.locator('#selectICTimeCharacter').inputValue(), 'Alice');
        assert.equal((await copy()).entries[0].quantityPer24h, 480);
        assert((await page.locator('#ictimeExportSummary').textContent()).includes('已勾选记录'));
        await page.locator('#selectSimulationHistoryMap').selectOption('zone:/actions/combat/rat');
        assert.equal((await copy()).entries[0].quantityPer24h, 480);
        await page.locator('#buttonClearSimulationHistorySelection').click();
        assert.equal((await copy()).entries[0].quantityPer24h, 600);
        assert((await page.locator('#ictimeExportSummary').textContent()).includes('全部地图'));
        await page.screenshot({ path: path.join(root, '.bench/ictime-history-export.png'), fullPage: false });
        assert.deepEqual(errors, []);
        console.log('PASS ICTime export: empty state, best yield, matching consumables, per-character isolation, cross-map selection, download and clipboard');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
