const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { root } = require('./rust-tools.cjs');
const { sha256 } = require('../bench/lib/reference.cjs');
const { compareSimulation } = require('../bench/lib/simulationComparison.cjs');

// Keep a copy of the baseline package/data/manifest before rebuilding WASM.
// Both WASM versions use the same wrapper, input and test browser in this run.
async function main() {
    const playwright = process.env.MWI_PLAYWRIGHT_PATH ? require(process.env.MWI_PLAYWRIGHT_PATH) : require('playwright');
    const baseline = path.resolve(root, process.argv[2] || '.bench/wasm-cache-baseline-51fa8f3');
    const current = path.join(root, '.wasm-build');
    const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
    const builds = { before: baseline, after: current }, manifests = {};
    for (const [kind, folder] of Object.entries(builds)) {
        const manifest = read(path.join(folder, 'manifest.json'));
        assert.equal(sha256(fs.readFileSync(path.join(folder, 'pkg/combat_wasm_bg.wasm'))), manifest.artifacts['combat_wasm_bg.wasm']);
        assert.equal(sha256(fs.readFileSync(path.join(folder, 'pkg/combat_wasm.js'))), manifest.artifacts['combat_wasm.js']);
        assert.equal(sha256(fs.readFileSync(path.join(folder, 'data/combat-data.json'))), manifest.dataAssetSha256);
        manifests[kind] = manifest;
    }
    assert.equal(manifests.before.dataFingerprint, manifests.after.dataFingerprint);
    assert.equal(manifests.before.dataAssetSha256, manifests.after.dataAssetSha256);
    assert.notEqual(manifests.before.artifacts['combat_wasm_bg.wasm'], manifests.after.artifacts['combat_wasm_bg.wasm'], 'No new WASM build to compare');
    const reference = read(path.join(current, 'simulations/manifest.json'));
    const spec = reference.cases[0], bytes = fs.readFileSync(path.join(current, 'simulations', spec.file));
    assert.equal(sha256(bytes), spec.sha256);
    assert.equal(reference.dataFingerprint, manifests.after.dataFingerprint);
    const item = JSON.parse(bytes), inputJson = JSON.stringify(item.request);
    const browserDir = path.join(current, 'browser');
    const jsWorkers = fs.readdirSync(browserDir).filter(file => /^\d+\.[a-z0-9]+\.js$/.test(file)
        && fs.readFileSync(path.join(browserDir, file), 'utf8').includes('nativePow'));
    assert.equal(jsWorkers.length, 1, 'Cannot uniquely identify the current JS simulation Worker');
    const workerSource = kind => `
        import init, { PrototypeEngine } from '/${kind}/pkg/combat_wasm.js';
        const ready = (async () => {
            const manifest = await fetch('/${kind}/manifest.json').then(response => response.json());
            await init({ module_or_path: await fetch('/${kind}/pkg/combat_wasm_bg.wasm').then(response => response.arrayBuffer()) });
            return new PrototypeEngine(await fetch('/${kind}/data/combat-data.json').then(response => response.text()), manifest.dataFingerprint);
        })();
        self.onmessage = async ({ data }) => {
            try {
                const engine = await ready;
                const result = data.command === 'init' ? JSON.parse(engine.info()) : JSON.parse(engine.simulate(data.inputJson));
                self.postMessage({ id: data.id, result });
            } catch (error) { self.postMessage({ id: data.id, error: { message: error.message || String(error) } }); }
        };
    `;
    const server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://localhost');
        if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>WASM equipment cache benchmark</title>'); return; }
        if (url.pathname === '/worker.mjs' && Object.hasOwn(builds, url.searchParams.get('kind'))) {
            response.setHeader('Content-Type', 'text/javascript'); response.end(workerSource(url.searchParams.get('kind'))); return;
        }
        const [, prefix, rest] = url.pathname.match(/^\/(before|after|browser)\/(.+)$/) || [];
        if (!prefix) { response.writeHead(404).end(); return; }
        const folder = prefix === 'browser' ? browserDir : builds[prefix];
        const file = path.resolve(folder, rest);
        if (!file.startsWith(folder + path.sep)) { response.writeHead(403).end(); return; }
        try {
            const bytes = fs.readFileSync(file);
            response.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : 'application/json');
            response.end(bytes);
        } catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await playwright.chromium.launch({ channel: process.env.MWI_BROWSER_CHANNEL || 'msedge', headless: true });
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.evaluate(() => {
            window.clients = {};
            window.create = (kind, url, options) => {
                const createdAt = performance.now();
                const worker = new Worker(url, options), pending = new Map(); let nextId = 1;
                worker.onmessage = ({ data }) => {
                    const entry = pending.get(data.id);
                    if (!entry) return;
                    pending.delete(data.id); clearTimeout(entry.timer);
                    data.error ? entry.reject(new Error(data.error.message)) : entry.resolve(data.result);
                };
                worker.onerror = event => {
                    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(event.message)); }
                    pending.clear();
                };
                window.clients[kind] = {
                    createdAt,
                    request: (command, inputJson) => new Promise((resolve, reject) => {
                        const id = nextId++, timer = setTimeout(() => { pending.delete(id); reject(new Error('Worker timeout')); }, 30000);
                        pending.set(id, { resolve, reject, timer }); worker.postMessage({ id, command, inputJson });
                    }),
                    close: () => worker.terminate()
                };
            };
        });
        const create = kind => page.evaluate(({ kind, jsWorker }) => window.create(kind,
            kind.startsWith('js') ? '/browser/' + jsWorker : '/worker.mjs?kind=' + (kind.startsWith('before') ? 'before' : 'after'),
            kind.startsWith('js') ? undefined : { type: 'module' }), { kind, jsWorker: jsWorkers[0] });
        const measure = async kind => {
            const { result, elapsedMs, fromCreationMs } = await page.evaluate(async ({ kind, inputJson }) => {
                const start = performance.now(), result = await window.clients[kind].request('simulate', inputJson);
                JSON.stringify(result); const ended = performance.now();
                return { result, elapsedMs: ended - start, fromCreationMs: ended - window.clients[kind].createdAt };
            }, { kind, inputJson });
            assert.equal(compareSimulation(item.expected, result), null, `${kind}: result/RNG/events differ`);
            return { requestMs: elapsedMs, fromCreationMs };
        };
        const cold = {}, warm = { js: [], before: [], after: [] };
        for (const kind of Object.keys(warm)) {
            await create(kind + '-cold');
            cold[kind] = await measure(kind + '-cold');
            await page.evaluate(kind => window.clients[kind].close(), kind + '-cold');
            await create(kind); await measure(kind); await measure(kind);
        }
        const order = Object.keys(warm);
        for (let index = 0; index < 7; index++) {
            for (let offset = 0; offset < order.length; offset++) {
                const kind = order[(index + offset) % order.length]; warm[kind].push((await measure(kind)).requestMs);
            }
            console.log(`Equipment cache benchmark: round ${index + 1}/7 passed`);
        }
        const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
        const medians = Object.fromEntries(Object.entries(warm).map(([kind, values]) => [kind, median(values)]));
        const report = { schemaVersion: 1, case: item.name, options: item.options, processed: item.expected.processed,
            randomCalls: item.expected.randomCalls, browser: await browser.version(), userAgent: await page.evaluate(() => navigator.userAgent),
            scope: 'prepared normalized input; JSON, actual Worker round trip and full result serialization; identical WASM wrappers; no production pool/UI',
            timestamp: new Date().toISOString(), baseline, wasmHashes: Object.fromEntries(Object.entries(manifests).map(([kind, manifest]) => [kind, manifest.artifacts['combat_wasm_bg.wasm']])),
            dataFingerprint: manifests.after.dataFingerprint, cold, warm, medians, beforeToAfter: medians.before / medians.after, jsToAfter: medians.js / medians.after,
            comparedRuns: 30, exact: true };
        const output = path.join(root, '.bench/wasm-cache/benchmark.json'); fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.writeFileSync(output, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ medians, beforeToAfter: report.beforeToAfter, jsToAfter: report.jsToAfter, output }, null, 2));
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
