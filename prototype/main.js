import { ProbeClient } from './client.js';
import { queueCases, jsQueueTrace, numericCases } from './probeCases.js';
import vectors from '../tests/fixtures/combat/rng-js-number-v1.json';
import manifest from '../.wasm-build/manifest.json';

const clients = new Set();
const createClient = () => { const client = new ProbeClient(); clients.add(client); return client; };
const tests = [], details = {};
const status = document.getElementById('status');
const check = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, message) => check(JSON.stringify(actual) === JSON.stringify(expected), message);
async function rejects(promise, code) {
    try { await promise; } catch (error) { check(error.code === code, `Expected ${code}, got ${error.code}: ${error.message}`); return; }
    throw new Error(`Expected ${code} rejection`);
}
async function test(name, run) {
    const start = performance.now();
    const item = document.createElement('li');
    item.textContent = `${name}：运行中`;
    document.getElementById('tests').append(item);
    try { await run(); tests.push({ name, passed: true, ms: Math.round(performance.now() - start) }); item.className = 'pass'; item.textContent = `通过：${name}`; }
    catch (error) { tests.push({ name, passed: false, error: error.message }); item.className = 'fail'; item.textContent = `失败：${name} — ${error.message}`; }
}

(async () => {
    const client = createClient();
    await test('真实 Worker 加载 WASM 与全部 16 份游戏定义', async () => {
        details.initial = await client.request('init');
        check(details.initial.info.definitionCount === 16 && details.initial.module.interfaceVersion === 1, 'Definition/interface mismatch');
        check(details.initial.module.dataFingerprint === manifest.dataFingerprint && details.initial.liveEngines === 1, 'Module/data mismatch');
    });
    await test('资源 URL、WASM MIME 与当前根路径或 Pages 子路径一致', async () => {
        const prefix = new URL('.', location.href).pathname;
        for (const [kind, url] of Object.entries(details.initial.assets)) {
            check(new URL(url).pathname.startsWith(prefix + 'assets/'), `${kind} URL escaped current prefix`);
            const response = await fetch(url, { method: 'HEAD' });
            check(response.ok, `${kind} resource failed`);
            if (kind === 'wasm') check(response.headers.get('content-type') === 'application/wasm', 'Incorrect WASM MIME');
        }
        check(details.initial.loadMode === 'response', 'Response initialization was not exercised');
    });
    await test('4 个种子各 600 万次 RNG，与冻结 JS 长向量完全一致', async () => {
        for (const vector of vectors.vectors) {
            const result = await client.request('rng', { seed: vector.seed, points: vector.values.map(value => value.call) });
            equal(result.values, vector.values, `RNG differs for seed ${vector.seed}`);
            check(result.calls === 6_000_000, 'Incorrect RNG count');
        }
    });
    await test('不同分段大小跨越 Number 精度边界，随机流连续', async () => {
        const vector = vectors.vectors[1];
        for (const chunk of [50_001, 100_000]) {
            const result = await client.request('rng', { seed: vector.seed, points: vector.values.map(value => value.call), chunk });
            equal(result.values, vector.values, `RNG differs with chunk ${chunk}`);
        }
    });
    await test('5,000 次队列操作及同时间、删除、清空，与实际 JS 每步一致', async () => {
        for (const actions of Object.values(queueCases())) {
            const actual = await client.request('queue', { actionsJson: JSON.stringify(actions) });
            equal(actual, jsQueueTrace(actions), 'Queue trace differs');
        }
    });
    await test('JS 取整、负零、余数及非有限数语义', async () => {
        const actual = await client.request('numeric', { values: numericCases });
        numericCases.forEach((value, index) => {
            check(Object.is(actual.round[index], Math.round(value)), `Round differs at ${value}`);
            check(Object.is(actual.remainder[index], value % 2), `Remainder differs at ${value}`);
        });
    });
    await test('任务复用、临时 RNG 释放、运行错误后可继续', async () => {
        await rejects(client.request('queue', { actionsJson: 'invalid-json' }), 'INVALID_INPUT');
        await rejects(client.request('rng', { seed: 1, points: [2, 1] }), 'INVALID_INPUT');
        await rejects(client.request('init', { options: { expectedHash: 'wrong' } }), 'DATA_MISMATCH');
        equal(await client.request('queue', { actionsJson: '[]' }), [], 'Recovery failed');
        details.reused = await client.request('stats');
        check(details.reused.moduleInitCount === 1 && details.reused.engineInitCount === 1 && details.reused.dataFetchCount === 1 && details.reused.liveProbes === 0, 'Reuse or release failed');
    });
    await test('同一 Worker 忙碌时拒绝第二项任务', async () => {
        const pending = client.request('rng', { seed: 1, points: [100_000] });
        await rejects(client.request('stats'), 'BUSY');
        await pending;
    });
    await test('释放引擎归零，重建时复用模块与数据', async () => {
        const freed = await client.request('destroy');
        check(freed.liveEngines === 0 && freed.liveProbes === 0, 'Handles not released');
        const rebuilt = await client.request('init');
        check(rebuilt.liveEngines === 1 && rebuilt.engineInitCount === 2 && rebuilt.moduleInitCount === 1 && rebuilt.dataFetchCount === 1, 'Reinitialization failed');
    });
    await test('WASM 404、数据 404 或指纹错误后可重新初始化', async () => {
        for (const options of [{ wasmUrl: new URL('missing.wasm', location.href).href },
            { dataUrl: new URL('missing.json', location.href).href },
            { wasmUrl: new URL('index.html', location.href).href },
            { dataUrl: details.initial.assets.wasm }]) {
            const retry = createClient();
            const expected = options.wasmUrl?.endsWith('missing.wasm') || options.dataUrl?.endsWith('missing.json') ? 'LOAD_FAILED' : 'DATA_MISMATCH';
            await rejects(retry.request('init', { options }), expected);
            const result = await retry.request('init');
            check(result.moduleInitCount === 1 && result.liveEngines === 1, 'Failed load poisoned retry');
            retry.terminate();
        }
    });
    await test('字节加载备用路径及两个 Worker 独立内存', async () => {
        const other = createClient();
        const info = await other.request('init', { options: { byteLoading: true } });
        check(info.loadMode === 'bytes' && info.liveEngines === 1, 'Byte initialization failed');
        await client.request('destroy');
        const independent = await other.request('stats');
        check(independent.liveEngines === 1, 'Workers share live state');
        await client.request('init');
        other.terminate();
    });
    await test('运行中取消 Worker，重开后种子与状态重新建立', async () => {
        const cancelled = createClient();
        await cancelled.request('init');
        let progressed = false;
        await rejects(cancelled.request('rng', { seed: 42, points: [6_000_000] }, () => {
            progressed = true; cancelled.terminate();
        }), 'CANCELLED');
        check(progressed, 'Cancellation happened before any Rust work');
        const fresh = createClient();
        const result = await fresh.request('rng', { seed: 42, points: [1, 2, 3] });
        equal(result.values, vectors.vectors[2].values.slice(0, 3), 'Restart retained old RNG state');
        fresh.terminate();
    });
    details.final = await client.request('stats');
    for (const worker of clients) worker.terminate();
    const report = { schemaVersion: 1, phase: 'P1', passed: tests.every(test => test.passed), tests,
        path: location.pathname, userAgent: navigator.userAgent, dataFingerprint: manifest.dataFingerprint,
        wasmSha256: manifest.artifacts['combat_wasm_bg.wasm'], details };
    status.textContent = `${report.passed ? '全部通过' : '存在失败'}：${tests.filter(test => test.passed).length} / ${tests.length}`;
    status.className = report.passed ? 'pass' : 'fail';
    document.getElementById('details').textContent = JSON.stringify(report, null, 2);
    // Loopback-only development server stores artificial test evidence, never game state.
    const response = await fetch('/__prototype_report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
    check(response.ok, 'Local report could not be stored');
})().catch(error => { for (const client of clients) client.terminate(); status.textContent = `验收中断：${error.message}`; status.className = 'fail'; });
