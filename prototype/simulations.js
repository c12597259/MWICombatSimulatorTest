import { ProbeClient } from './client.js';
import build from '../.wasm-build/manifest.json';
import { compareResults } from './compareValues.js';
import { simulationCase } from '../bench/simulationsCases.js';
const createJsClient = () => new ProbeClient(new Worker(new URL('./jsSimulationWorker.js', import.meta.url)));
const wasm = new ProbeClient(), js = createJsClient();
const tests = [], results = [], status = document.getElementById('status'); let performanceReport;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const canonical = value => { const copy = structuredClone(value); for (const wipe of copy.result.wipeEvents) delete wipe.timestamp; return copy; };
const match = (expected, actual) => { const diff = compareResults(canonical(expected), canonical(actual)); assert(!diff, JSON.stringify(diff)); };
async function test(name, action) {
    const element = document.createElement('li'); element.textContent = `${name}：运行中`; document.getElementById('tests').append(element);
    const start = performance.now();
    try { await action(); tests.push({ name, passed: true, ms: performance.now() - start }); element.textContent = `通过：${name}`; element.className = 'pass'; }
    catch (error) { tests.push({ name, passed: false, error: error.message }); element.textContent = `失败：${name} — ${error.message}`; element.className = 'fail'; }
}
async function digest(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join(''); }
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
(async () => {
    const reference = await fetch('simulation-reference/manifest.json').then(response => response.json());
    assert(reference.dataFingerprint === build.dataFingerprint, 'Data version mismatch');
    await test('真实 WASM 与原生 JS Worker 初始化', async () => { assert((await wasm.request('init')).info.definitionCount === 16, 'Missing definitions'); await js.request('init'); });
    let sample;
    for (const spec of reference.cases) {
        const response = await fetch(`simulation-reference/${spec.file}`), bytes = await response.arrayBuffer();
        assert(await digest(bytes) === spec.sha256, 'Reference fingerprint mismatch'); const item = JSON.parse(new TextDecoder().decode(bytes)); sample ||= item;
        await test(`${item.name}：WASM 完整结果与随机流`, async () => { match(item.expected, await wasm.request('simulate', { inputJson: JSON.stringify(item.request) })); });
        await test(`${item.name}：当前浏览器 JS 与 WASM`, async () => {
            const actualJs = await js.request('simulate', { inputJson: JSON.stringify(item.request) });
            const actualWasm = await wasm.request('simulate', { inputJson: JSON.stringify(item.request) });
            match(item.expected, actualJs); match(actualJs, actualWasm);
            results.push({ name: item.name, events: actualWasm.processed, randomCalls: actualWasm.randomCalls, exact: true });
        });
    }
    await test('连续事件快照：队伍、队列、统计与 RNG', async () => {
        const inputJson = JSON.stringify({ input: sample.request, maxEvents: 80 });
        assert(!compareResults(await js.request('simulationTrace', { inputJson }), await wasm.request('simulationTrace', { inputJson })), 'Event trace differs');
    });
    await test('分段运行进度、忙碌拒绝、取消与错误恢复', async () => {
        const inputJson = JSON.stringify(sample.request); let progress = [], busy;
        const result = await wasm.request('simulate', { inputJson, chunk: 1000 }, value => { progress.push(value); busy ||= wasm.request('init').then(() => false, error => error.code === 'BUSY'); });
        match(sample.expected, result); assert(await busy, 'Concurrent request accepted');
        assert(progress.at(-1).done && progress.at(-1).progress === 1 && progress.every((value, index) => !index || value.processed > progress[index - 1].processed), 'Invalid progress');
        const cancelled = new ProbeClient();
        try { await cancelled.request('init'); const rejected = await cancelled.request('simulate', { inputJson, chunk: 1 }, () => cancelled.terminate()).then(() => false, error => error.code === 'CANCELLED'); assert(rejected, 'Cancellation failed'); }
        finally { cancelled.terminate(); }
        await wasm.request('simulate', { inputJson: '{}' }).then(() => { throw new Error('Invalid input accepted'); }, () => {});
        assert((await wasm.request('stats')).liveSimulations === 0, 'Run handle leaked');
        match(sample.expected, await wasm.request('simulate', { inputJson }));
    });
    await test('浏览器 Worker 冷启动与五次热运行端到端初测', async () => {
        const measure = async client => {
            const start = performance.now();
            const item = simulationCase(sample.name, sample.options);
            const result = await client.request('simulate', { inputJson: JSON.stringify(item.request) });
            // Include normalization, serialization, Worker round trip and result serialization.
            JSON.stringify(result); const elapsedMs = performance.now() - start; match(sample.expected, result); return elapsedMs;
        };
        const cold = {};
        for (const kind of ['js', 'wasm']) {
            const started = performance.now(), client = kind === 'js' ? createJsClient() : new ProbeClient();
            try { const elapsed = await measure(client); cold[kind] = { endToEndMs: performance.now() - started, requestMs: elapsed }; }
            finally { client.terminate(); }
        }
        await measure(js); await measure(wasm); const warm = { js: [], wasm: [] };
        for (let index = 0; index < 5; index++) for (const kind of index % 2 ? ['wasm', 'js'] : ['js', 'wasm']) warm[kind].push(await measure(kind === 'js' ? js : wasm));
        performanceReport = { case: sample.name, hours: sample.options.hours, players: sample.request.players.length,
            scope: 'prototype Worker round trip, normalization, JSON and full result; not production pool or UI', cold, warm,
            medianJsMs: median(warm.js), medianWasmMs: median(warm.wasm), speedup: median(warm.js) / median(warm.wasm) };
        assert(Object.values(warm).every(values => values.length === 5 && values.every(value => value > 0)), 'Invalid timing samples');
    });
    const stats = await wasm.request('stats'); let finalStats;
    await test('资源复用及所有模拟句柄释放', async () => { assert(stats.moduleInitCount === 1 && stats.engineInitCount === 1 && stats.liveSimulations === 0, 'Reuse/release failed'); finalStats = await wasm.request('destroy'); assert(finalStats.liveEngines === 0 && finalStats.liveSimulations === 0, 'Engine leaked'); });
    const report = { schemaVersion: 1, phase: 'P2.3', path: location.pathname, userAgent: navigator.userAgent, passed: tests.every(item => item.passed),
        tests, cases: reference.cases, results, performance: performanceReport, wasmSha256: build.artifacts['combat_wasm_bg.wasm'], dataFingerprint: build.dataFingerprint, stats, finalStats };
    window.__simulationReport = report;
    status.textContent = `${report.passed ? '全部通过' : '存在失败'}：${tests.filter(item => item.passed).length}/${tests.length}`;
    document.getElementById('details').textContent = JSON.stringify(report, null, 2);
    const saved = await fetch('/__simulation_report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }); assert(saved.ok, 'Cannot save report');
})().catch(error => { status.textContent = `验收中断：${error.message}`; }).finally(() => { js.terminate(); wasm.terminate(); });
