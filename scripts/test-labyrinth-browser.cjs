const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const playwright = require(process.env.MWI_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '..');
const calculator = process.env.MWI_LABYRINTH_SCRIPT;
if (!calculator) throw Error('Set MWI_LABYRINTH_SCRIPT to the calculator userscript');

async function main() {
    const dist = path.join(root, 'dist');
    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/game-test') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body>Calculator test origin</body></html>'); return; }
        const file = path.resolve(dist, '.' + decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
        if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
        res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm' })[path.extname(file)] || 'text/plain');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, resolve));
    const port = server.address().port, base = `http://127.0.0.1:${port}/`;
    const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
    const report = { checks: [], browser: browser.version() };
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        page.on('dialog', dialog => dialog.dismiss());
        await page.addInitScript(() => {
            localStorage.setItem('i18nextLng', 'zh');
            window.testWorkers = [];
            const Native = Worker;
            window.Worker = class extends Native {
                constructor(url, options) { super(url, options); this.testUrl = String(url); this.sent = []; this.received = []; window.testWorkers.push(this); this.addEventListener('message', e => this.received.push(e.data)); }
                postMessage(data) { this.sent.push(data); return super.postMessage(data); }
            };
        });
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => window.testWorkers.length >= 2 && document.getElementById('labyrinthCombatDamageLevel'));
        assert.equal(await page.locator('#simAllLabyrinthsToggle').count(), 0);
        const player = { hrid: 'player1', staminaLevel: 190, intelligenceLevel: 190, attackLevel: 190, meleeLevel: 190, defenseLevel: 190, rangedLevel: 190, magicLevel: 190, equipment: {}, food: [], drinks: [], abilities: [], houseRooms: {}, achievements: {} };
        const importSet = { player: { ...player, equipment: [] }, food: { '/action_types/combat': [] }, drinks: { '/action_types/combat': [] }, abilities: Array.from({length: 5}, () => ({abilityHrid: '', level: 1})), triggerMap: {}, houseRooms: {}, achievements: {}, labyrinth: { labyrinthCombatDamageLevel: 7, labyrinthAttackSpeedLevel: 3, labyrinthCastSpeedLevel: 2, labyrinthCriticalRateLevel: 1, labyrinthExperienceLevel: 4 } };
        await page.evaluate(importSet => {
            document.querySelectorAll('#importTab .nav-link').forEach(el => el.classList.remove('active'));
            document.getElementById('solo-tab').classList.add('active');
            document.getElementById('inputSetSolo').value = JSON.stringify(importSet);
            document.getElementById('buttonImportSet').click();
            const toggle = document.getElementById('simLabyrinthToggle'); toggle.checked = true; toggle.dispatchEvent(new Event('change'));
        }, importSet);
        assert.equal(await page.locator('#labyrinthCombatDamageLevel').inputValue(), '7');
        assert(await page.locator('#personalBuffsSection').evaluate(el => el.classList.contains('d-none')));
        assert(!(await page.locator('#labyrinthUpgradesSection').evaluate(el => el.classList.contains('d-none'))));
        // Unsaved control edits must reach the simulation, not be lost on player DTO reload.
        await page.evaluate(() => {
            document.getElementById('labyrinthCombatDamageLevel').value = '9';
            document.getElementById('personalBuffsToggle').checked = true;
            document.getElementById('seal_of_damageToggle').checked = true;
            document.getElementById('inputRoomLevel').value = '20';
            document.getElementById('inputSimulationTime').value = '1';
            document.querySelectorAll('.player-checkbox').forEach(el => el.checked = el.id === 'player1');
            document.getElementById('buttonStartSimulation').click();
        });
        const beforeRun = await page.evaluate(() => ({ invalid: [...document.querySelectorAll(':invalid')].map(e => [e.id, e.value]), sent: window.testWorkers.map(w => w.sent.length) }));
        assert.deepEqual(errors, []);
        assert.deepEqual(beforeRun.invalid, []);
        assert(beforeRun.sent.some(n => n > 0), JSON.stringify(beforeRun));
        await page.waitForFunction(() => window.testWorkers.some(w => w.received.some(m => m.type === 'simulation_result' || m.type === 'simulation_error')), null, { timeout: 60000 });
        const run = await page.evaluate(() => { const worker = window.testWorkers.find(w => w.sent.some(m => m.type === 'start_simulation')); return { request: worker.sent.at(-1), response: worker.received.at(-1), url: worker.testUrl }; });
        assert.equal(run.response.type, 'simulation_result', JSON.stringify(run.response));
        assert.equal(run.response.execution.engine, 'rust-wasm-worker');
        assert.equal(run.request.players[0].labyrinthUpgrades.labyrinthCombatDamageLevel, 9);
        assert.deepEqual(run.request.extra.personalBuffs, []);
        await page.evaluate(() => {
            for (const id of ['simLabyrinthToggle']) { const el = document.getElementById(id); el.checked = false; el.dispatchEvent(new Event('change')); }
        });
        assert(!(await page.locator('#personalBuffsSection').evaluate(el => el.classList.contains('d-none'))));
        assert.equal(await page.locator('#labyrinthCombatDamageLevel').inputValue(), '9');
        // Switch player tabs and come back: independent level values must survive.
        await page.locator('#player2-tab').click();
        assert.equal(await page.locator('#labyrinthCombatDamageLevel').inputValue(), '0');
        await page.locator('#player1-tab').click();
        assert.equal(await page.locator('#labyrinthCombatDamageLevel').inputValue(), '9');
        report.checks.push('UI mode replacement, imported upgrades, unsaved edits, per-player persistence, real WASM simulation');
        // Compare calculator API and standard simulator with the same seed/inputs.
        const apiResults = await page.evaluate(async ({ base, player, normalUrl }) => {
            const source = await (await fetch(base + 'labyrinth-worker.js')).text();
            const url = URL.createObjectURL(new Blob(['self.__mwiLabAssetBase=' + JSON.stringify(base) + ';\n' + source], { type: 'text/javascript' }));
            const worker = new Worker(url);
            function resultFrom(w, request, terminal) { return new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(Error('Worker timeout')), 30000);
                w.onmessage = ({ data }) => { if (terminal.includes(data.type)) { clearTimeout(timer); resolve(data); } };
                w.onerror = e => { clearTimeout(timer); reject(Error(e.message)); }; w.postMessage(request);
            }); }
            player.labyrinthUpgrades = { labyrinthCombatDamageLevel: 8, labyrinthAttackSpeedLevel: 4 };
            const first = await resultFrom(worker, { type: 'simulate_room', apiVersion: 1, requestId: 1, seed: 7, playerDto: player, monsterHrid: '/monsters/giant_scorpion', mazeDifficulty: 20, mazeCrateItemHrids: [], roomDurationSeconds: 120, trials: 10 }, ['room_result','room_error']);
            const second = await resultFrom(worker, { type: 'simulate_room', apiVersion: 1, requestId: 2, seed: 7, playerDto: player, monsterHrid: '/monsters/giant_scorpion', mazeDifficulty: 20, mazeCrateItemHrids: [], roomDurationSeconds: 120, trials: 10 }, ['room_result','room_error']);
            const normal = new Worker(normalUrl);
            const standard = await resultFrom(normal, { type: 'start_simulation', seed: 7, players: [player], labyrinth: { labyrinthHrid: '/monsters/giant_scorpion', roomLevel: 20, crates: [] }, extra: {}, simulationTimeLimit: 1200e9 }, ['simulation_result','simulation_error']);
            worker.terminate(); normal.terminate(); URL.revokeObjectURL(url);
            return { first, second, standard };
        }, { base, player, normalUrl: run.url });
        assert.equal(apiResults.first.type, 'room_result', JSON.stringify(apiResults.first));
        assert.equal(apiResults.first.execution.engine, 'rust-wasm-worker');
        assert.equal(apiResults.first.trials, apiResults.first.successes + apiResults.first.failedByDeath + apiResults.first.failedByTimeout);
        assert.equal(apiResults.first.successes, apiResults.standard.simResult.encounters);
        assert.equal(apiResults.first.successes, apiResults.second.successes);
        report.checks.push('Blob WASM API, reusable engine, same-seed frontend/API results');
        const game = await context.newPage();
        const gameErrors = []; game.on('pageerror', e => gameErrors.push(String(e)));
        await game.goto(`http://localhost:${port}/game-test`);
        let userscript = fs.readFileSync(calculator, 'utf8').replace('const COMBAT_SIM_BASE_URL = "https://c12597259.github.io/MWICombatSimulatorTest/dist/";', 'const COMBAT_SIM_BASE_URL = ' + JSON.stringify(base) + ';');
        userscript = userscript.replace('    migrateLegacySimulatorBridgeUrl();', '    window.__labTest={simulateCombatRoomWithWorker,applySimulatorBridgeFieldsOnPage}; return;');
        await game.addScriptTag({ content: userscript });
        const gameResult = await game.evaluate(async playerDto => {
            const start = performance.now();
            const result = await window.__labTest.simulateCombatRoomWithWorker({ playerDto, monsterHrid: '/monsters/giant_scorpion', mazeDifficulty: 20, mazeCrateItemHrids: [], roomDurationSeconds: 120, trials: 10 }, null);
            return { result, ms: performance.now() - start };
        }, player);
        assert.equal(gameResult.result.execution.engine, 'rust-wasm-worker');
        report.checks.push('Actual calculator cross-origin fetch -> Blob Worker -> WASM assets');
        // Calculator bridge applies all levels to the actual UI, with missing fields reset.
        await page.addScriptTag({ content: userscript });
        await page.evaluate(() => window.__labTest.applySimulatorBridgeFieldsOnPage({ monsterHrid: '/monsters/giant_scorpion', mazeDifficulty: 40 }, { labyrinth: { labyrinthCombatDamageLevel: 11 }, simulationTime: '1' }));
        assert.equal(await page.locator('#labyrinthCombatDamageLevel').inputValue(), '11');
        assert.equal(await page.locator('#labyrinthAttackSpeedLevel').inputValue(), '0');
        assert.equal(await page.locator('#simLabyrinthToggle').isChecked(), true);
        await page.locator('#buttonSimulationSetup').click();
        await page.waitForFunction(() => document.querySelector('#labyrinthUpgradesSection h6').textContent === '迷宫升级');
        await page.screenshot({ path: path.join(root, '.bench/labyrinth-upgrades.png'), fullPage: false });
        assert.deepEqual(errors, []); assert.deepEqual(gameErrors, []);
        report.checks.push('Calculator right-click bridge fields on real simulator UI');
        report.calculator = gameResult;
        fs.writeFileSync(path.join(root, '.bench/labyrinth-browser-report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
