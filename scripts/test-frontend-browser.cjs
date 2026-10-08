const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const playwright = require(process.env.MWI_PLAYWRIGHT_PATH || 'playwright');
const read = file => JSON.parse(fs.readFileSync(file));
const strip = value => {
    value = structuredClone(value);
    for (const wipe of value.wipeEvents || []) delete wipe.timestamp;
    return value;
};
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
function requestFromInput(input) {
    return {
        type: 'start_simulation', seed: input.seed, simulationTimeLimit: input.timeLimit,
        extra: { ...input.players[0].extra, enableHpMpVisualization: input.visualization },
        zone: input.zone && { zoneHrid: input.zone.hrid, difficultyTier: input.zone.difficultyTier },
        labyrinth: input.labyrinth && { labyrinthHrid: input.labyrinth.hrid, roomLevel: input.labyrinth.roomLevel, crates: input.labyrinth.crates },
        players: input.players.map(({ input: player }) => ({
            hrid: player.hrid,
            ...Object.fromEntries(['stamina', 'intelligence', 'attack', 'melee', 'defense', 'ranged', 'magic'].map((name, index) => [name + 'Level', player.levels[index]])),
            equipment: Object.fromEntries(player.equipment.map(item => [item.slot, item])),
            food: player.food, drinks: player.drinks, abilities: player.abilities,
            houseRooms: Object.fromEntries(player.houseRooms), achievements: player.achievements,
            guildCombatBuffLevels: Object.fromEntries(['force', 'tempo', 'spirit', 'rarity', 'scholar'].map((name, index) => [name, player.shrines[index]])),
            guildCombatBuffs: player.guildBuffs, debuffOnLevelGap: player.debuffOnLevelGap,
        })),
    };
}
async function main() {
    const report = { date: new Date().toISOString(), checks: [], resources: [] };
    const dist = path.join(root, 'dist');
    const server = http.createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const relative = pathname.replace(/^\/MWICombatSimulatorTest\/dist\//, '').replace(/^\//, '') || 'index.html';
        const file = path.resolve(dist, relative);
        if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
        res.setHeader('Content-Type', ({ '.wasm': 'application/wasm', '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html' })[path.extname(file)] || 'text/plain');
        res.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const local = `http://127.0.0.1:${server.address().port}`;
    const base = process.env.MWI_FRONTEND_URL || local + '/MWICombatSimulatorTest/dist/';
    const browser = await playwright.chromium.launch({ channel: 'msedge', headless: true });
    report.browser = browser.version(); report.url = base;
    const context = await browser.newContext();
    try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        page.on('response', response => { if (/\.(wasm|json)(\?|$)/.test(response.url()) && response.url().includes('/assets/')) report.resources.push({url:response.url(),status:response.status()}); });
        await page.addInitScript(() => {
            const NativeWorker = window.Worker;
            window.testWorkers = [];
            window.Worker = class extends NativeWorker {
                constructor(url, options) {
                    super(url, options); this.testUrl = String(url); this.testMessages = [];
                    this.addEventListener('message', ({ data }) => this.testMessages.push(data));
                    window.testWorkers.push(this);
                }
            };
        });
        await page.goto(base, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForFunction(() => window.testWorkers.length >= 2);
        const urls = await page.evaluate(() => window.testWorkers.slice(0, 2).map(worker => worker.testUrl));
        async function run(request, batch = false, keep = false) {
            return page.evaluate(({ url, request, keep }) => new Promise((resolve, reject) => {
                const worker = keep && window.testReusableWorker || new Worker(url);
                if (keep) window.testReusableWorker = worker;
                const messages = [], start = performance.now();
                const timer = setTimeout(() => { worker.terminate(); reject(Error('Frontend Worker timed out')); }, 120000);
                worker.onerror = e => { clearTimeout(timer); worker.terminate(); reject(Error(e.message)); };
                worker.onmessage = ({ data }) => {
                    if (data.type === 'simulation_progress') messages.push({progress:data.progress, samples:data.timeSeriesData?.timestamps.length || 0});
                    else {
                        clearTimeout(timer); if (!keep) worker.terminate();
                        resolve({message:data, progress:messages, ms:performance.now()-start});
                    }
                };
                worker.postMessage(request);
            }), {url:urls[batch ? 1 : 0],request,keep});
        }
        const references = process.env.MWI_SIMULATION_REFERENCE;
        let inputs;
        if (references) {
            const manifest = read(path.join(references, 'manifest.json'));
            inputs = manifest.cases.map(spec => read(path.join(references, spec.file)));
        } else {
            inputs = [{ name:'frontend-fixture', request:read(path.join(root,'tests/fixtures/combat/frontend-request.json')) }];
        }
        for (const item of inputs) {
            const value = await run(requestFromInput(item.request), false, true);
            assert.equal(value.message.type, 'simulation_result', JSON.stringify(value.message));
            assert.equal(value.message.execution.engine, 'rust-wasm-worker');
            assert.equal(value.message.execution.randomness.seed, item.request.seed);
            if (item.expected) assert.deepEqual(strip(value.message.simResult), strip(item.expected.result), item.name);
            assert.equal(value.progress[0].progress, 0);
            assert.equal(value.progress.at(-1).progress, 1);
            assert.ok(value.progress.every((p,i,a)=>i===0 || p.progress>=a[i-1].progress));
            if (item.request.visualization) assert.ok(value.progress.some(p=>p.samples>0));
            report.checks.push({name:item.name,ms:value.ms,exact:!!item.expected,engine:value.message.execution.engine});
            console.log('PASS', item.name);
        }
        if (process.env.MWI_FRONTEND_CASES) {
            for (const item of read(process.env.MWI_FRONTEND_CASES)) {
                const value = await run(item.workerRequest, false, true);
                assert.equal(value.message.type, 'simulation_result');
                assert.equal(value.message.execution.engine, 'rust-wasm-worker');
                const hash = createHash('sha256').update(JSON.stringify(sorted(strip(value.message.simResult)))).digest('hex');
                assert.equal(hash, item.expectedHash, item.name);
                report.checks.push({name:item.name,ms:value.ms,exact:true,engine:value.message.execution.engine});
                console.log('PASS', item.name);
            }
        }
        const sample = requestFromInput(inputs[0].request);
        sample.simulationTimeLimit = 0.05 * 3600e9;
        const bad = await run({...sample, zone:{zoneHrid:'/invalid',difficultyTier:0}}, false, true);
        assert.equal(bad.message.type, 'simulation_error');
        assert.equal((await run(sample,false,true)).message.execution.engine, 'rust-wasm-worker');
        report.checks.push({name:'invalid input followed by reuse'});
        const zones = [{zoneHrid:'/actions/combat/crab',difficultyTier:0}, {zoneHrid:'/actions/combat/aqua_planet',difficultyTier:1}, sample.zone];
        const batch = await run({...sample,type:'start_simulation_all_zones',zones},true);
        assert.equal(batch.message.type,'simulation_result_allZones');
        assert.equal(batch.message.simResults.length,zones.length);
        assert.equal(batch.message.execution.engine,'rust-wasm-worker');
        for(let i=0;i<zones.length;i++) {
            const replay = await run({...sample,zone:zones[i],seed:batch.message.execution.executions[i].randomness.seed});
            assert.deepEqual(strip(replay.message.simResult),strip(batch.message.simResults[i]));
        }
        const labyrinths=[{labyrinthHrid:'/monsters/cyclops',roomLevel:100,crates:[]},{labyrinthHrid:'/monsters/cyclops',roomLevel:150,crates:['/items/basic_food_crate']}];
        const lab = await run({...sample,type:'start_simulation_all_labyrinths',labyrinths},true);
        assert.equal(lab.message.type,'simulation_result_allLabyrinths');
        assert.equal(lab.message.simResults.length,2);
        assert.equal(lab.message.execution.engine,'rust-wasm-worker');
        report.checks.push({name:'zone and labyrinth batches, ordered output and recorded seeds'});

        // Private integrations are absent for visitors and can register after startup.
        assert.equal(await page.locator('#teamPresetComparisonBar').isVisible(), false);
        await page.evaluate(() => {
            window.privateBaselineRequests = 0;
            document.addEventListener('mwi-private-loadout-baseline-request', () => window.privateBaselineRequests++);
            document.getElementById('buttonCompareTeamPreset').click();
        });
        assert.equal(await page.evaluate(() => window.privateBaselineRequests), 0);
        assert.equal(await page.locator('#teamPresetComparisonModal').isVisible(), false);
        await page.evaluate(() => document.documentElement.dataset.mwiPrivateLoadoutBaselineBridge = '1');
        await page.waitForFunction(() => !document.getElementById('teamPresetComparisonBar').classList.contains('d-none'));
        assert.equal(await page.locator('#teamPresetComparisonBar').isVisible(), true);
        await page.evaluate(() => delete document.documentElement.dataset.mwiPrivateLoadoutBaselineBridge);
        await page.waitForFunction(() => document.getElementById('teamPresetComparisonBar').classList.contains('d-none'));
        report.checks.push({name:'private entry hidden for visitors, guarded clicks, late bridge registration and removal'});

        // Exercise the real controls, renderer, history and export, not only Workers.
        await page.locator('#buttonSimulationSetup').click();
        await page.locator('#inputSimulationTime').fill('1');
        await page.locator('#player1').check();
        await page.locator('#buttonStartSimulation').click();
        await page.waitForFunction(()=>window.testWorkers[0].testMessages.some(m=>m.type==='simulation_result'),null,{timeout:120000});
        await page.waitForFunction(()=>!document.querySelector('#buttonStartSimulation').disabled);
        assert.equal(await page.evaluate(()=>window.testWorkers[0].testMessages.find(m=>m.type==='simulation_result').execution.engine),'rust-wasm-worker');
        const downloadPromise=page.waitForEvent('download');
        await page.locator('#buttonExportSimulationRecord').click();
        const download=await downloadPromise;
        const exported=read(await download.path());
        assert.equal(exported.latestRun.engine,'rust-wasm-worker');
        assert.equal(exported.latestRun.randomness.exactReplay,true);
        assert.ok(exported.records.length>0);
        assert.equal(exported.records[0].teamSnapshot.simulationRecord.engine,'rust-wasm-worker');
        report.checks.push({name:'page single run, rendered results, saved history and export'});
        await page.locator('#buttonSimulationSetup').click();
        await page.locator('#inputSimulationTime').fill('2500');
        await page.locator('#buttonStartSimulation').click();
        await page.locator('#buttonStopSimulation').click();
        assert.equal(await page.locator('#buttonStartSimulation').isDisabled(),false);
        await page.locator('#buttonSimulationSetup').click();
        await page.locator('#inputSimulationTime').fill('1');
        await page.locator('#buttonStartSimulation').click();
        await page.waitForFunction(()=>!document.querySelector('#buttonStartSimulation').disabled,null,{timeout:120000});
        report.checks.push({name:'cancel and restart through page controls'});
        await page.locator('#buttonSimulationSetup').click();
        await page.locator('#simAllZoneToggle').check();
        await page.locator('#buttonStartSimulation').click();
        await page.waitForFunction(()=>!document.querySelector('#buttonStartSimulation').disabled,null,{timeout:120000});
        assert.ok(await page.locator('#buttonShowAllSimData').isVisible());
        const batchDownloadPromise=page.waitForEvent('download');
        await page.locator('#buttonExportSimulationRecord').click();
        const batchDownload=await batchDownloadPromise;
        const batchArchive=read(await batchDownload.path());
        assert.equal(batchArchive.latestRun.engine,'rust-wasm-worker');
        assert.equal(batchArchive.latestRun.result.length,batchArchive.latestRun.request.zones.length);
        assert.equal(batchArchive.latestRun.execution.executions.length,batchArchive.latestRun.result.length);
        report.checks.push({name:'page all maps, rendered batch and export'});
        await page.evaluate(() => caches.delete('mwi-combat-wasm-assets-v1'));
        await context.route('**/*.wasm',route=>route.abort());
        const fallback = await run(sample);
        assert.equal(fallback.message.type,'simulation_result');
        assert.equal(fallback.message.execution.engine,'javascript-worker');
        assert.equal(fallback.message.execution.randomness.exactReplay,false);
        report.checks.push({name:'WASM unavailable falls back to JS'});
        await context.unroute('**/*.wasm');
        if (!process.env.MWI_FRONTEND_URL) {
            const rootPage=await context.newPage();
            await rootPage.goto(local+'/',{waitUntil:'networkidle'});
            assert.ok(await rootPage.locator('#buttonSimulationSetup').isVisible());
            await rootPage.close();
            report.checks.push({name:'root and GitHub Pages subpath load'});
        }
        assert.deepEqual(errors,[],'No page runtime exceptions');
        report.bundleSha256=createHash('sha256').update(fs.readFileSync(path.join(dist,'bundle.js'))).digest('hex');
        report.wasmSha256=read(path.join(root,'.wasm-build/manifest.json')).artifacts['combat_wasm_bg.wasm'];
        fs.mkdirSync(path.join(root,'.bench'),{recursive:true});
        fs.writeFileSync(path.join(root,'.bench/frontend-browser-report.json'),JSON.stringify(report,null,2));
        console.log('PASS frontend',report.checks.length,'checks');
    } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
}
main().catch(error=>{ console.error(error);process.exitCode=1; });
