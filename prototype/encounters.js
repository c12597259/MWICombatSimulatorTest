import { ProbeClient } from './client.js';
import build from '../.wasm-build/manifest.json';
import { compareResults } from './compareValues.js';

const client = new ProbeClient(), tests = [], status = document.getElementById('status');
const assert = (value, message) => { if (!value) throw new Error(message); };
async function test(name, action) {
    const item = document.createElement('li'); item.textContent = `${name}：运行中`; document.getElementById('tests').append(item);
    const start = performance.now();
    try { await action(); tests.push({ name, passed: true, ms: Math.round(performance.now() - start) }); item.className = 'pass'; item.textContent = `通过：${name}`; }
    catch (error) { tests.push({ name, passed: false, error: error.message }); item.className = 'fail'; item.textContent = `失败：${name} — ${error.message}`; }
}
async function digest(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join(''); }
const match = (expected, actual) => { const difference = compareResults({ snapshots: expected }, { snapshots: actual }); assert(difference === null, JSON.stringify(difference)); };

(async () => {
    const response = await fetch('encounter-reference/manifest.json'); assert(response.ok, 'Cannot load encounter manifest');
    const reference = await response.json(); assert(reference.dataFingerprint === build.dataFingerprint, 'Definition version mismatch');
    const load = async (name, info) => {
        const response = await fetch(`encounter-reference/${name}.json`); assert(response.ok, `Cannot load ${name}`);
        const bytes = await response.arrayBuffer(); assert(await digest(bytes) === info.sha256, 'Reference fingerprint mismatch');
        return JSON.parse(new TextDecoder().decode(bytes));
    };
    await test('真实 Worker 初始化战斗引擎', async () => { const info = await client.request('init'); assert(info.info.definitionCount === 16, 'Missing definitions'); });
    await test('幂运算、随机整数与分段回复精确对齐', async () => {
        const math = await load('math', reference.math);
        match(math.expected, await client.request('math', { inputJson: JSON.stringify(math.cases) }));
    });
    let sample, expectedSample;
    for (const [name, info] of Object.entries(reference.groups)) await test(`${name}：${info.cases} 案例 / ${info.frames} 事件逐字段对齐`, async () => {
        const group = await load(name, info);
        if (name === 'natural') { sample = group.cases[0].request; expectedSample = group.expected[0]; }
        for (let offset = 0; offset < group.cases.length; offset += 4) {
            const cases = group.cases.slice(offset, offset + 4);
            const actual = await client.request('encounters', { inputJson: JSON.stringify(cases.map(item => item.request)) });
            match(group.expected.slice(offset, offset + cases.length), actual);
        }
    });
    await test('1 / 7 / 1000 事件分段保留状态与随机流', async () => {
        for (const chunk of [1, 7, 1000]) match([expectedSample], await client.request('encounters', { inputJson: JSON.stringify([sample]), chunk }));
    });
    await test('分段运行期间并发请求被拒绝', async () => {
        let busy;
        const actual = await client.request('encounters', { inputJson: JSON.stringify([sample]), chunk: 1 }, () => {
            busy = client.request('init').then(() => false, error => error.code === 'BUSY');
        });
        assert(await busy, 'Concurrent request was accepted'); match([expectedSample], actual);
    });
    await test('运行错误释放句柄，后续任务恢复', async () => {
        const invalid = structuredClone(sample); invalid.setup = [{ unit: 0, flags: { invalid: true } }];
        let rejected = false;
        try { await client.request('encounters', { inputJson: JSON.stringify([invalid]) }); }
        catch (error) { rejected = error.code === 'INVALID_INPUT'; }
        assert(rejected, 'Invalid setup was accepted');
        assert((await client.request('stats')).liveEncounters === 0, 'Failed encounter leaked');
        match([expectedSample], await client.request('encounters', { inputJson: JSON.stringify([sample]) }));
    });
    await test('取消战斗 Worker 后重建并正常运行', async () => {
        const cancelled = new ProbeClient();
        try {
            await cancelled.request('init');
            const result = await cancelled.request('encounters', { inputJson: JSON.stringify([sample]), chunk: 1 }, () => cancelled.terminate()).then(() => false, error => error.code === 'CANCELLED');
            assert(result, 'Cancellation was not reported');
        } finally { cancelled.terminate(); }
        const replacement = new ProbeClient();
        try {
            match([expectedSample], await replacement.request('encounters', { inputJson: JSON.stringify([sample]) }));
            const freed = await replacement.request('destroy'); assert(freed.liveEncounters === 0 && freed.liveEngines === 0, 'Replacement leaked');
        } finally { replacement.terminate(); }
    });
    const stats = await client.request('stats'); let finalStats;
    await test('模块复用一次，所有战斗句柄释放', async () => {
        assert(stats.moduleInitCount === 1 && stats.engineInitCount === 1 && stats.liveEncounters === 0 && stats.liveProbes === 0, 'Reuse or release failed');
        finalStats = await client.request('destroy'); assert(finalStats.liveEngines === 0 && finalStats.liveEncounters === 0, 'Engine was not freed');
    });
    const report = { schemaVersion: 1, phase: 'P2.2', path: location.pathname, userAgent: navigator.userAgent,
        passed: tests.every(test => test.passed), tests, groups: reference.groups, math: reference.math,
        dataFingerprint: build.dataFingerprint, wasmSha256: build.artifacts['combat_wasm_bg.wasm'], stats, finalStats };
    status.textContent = `${report.passed ? '全部通过' : '存在失败'}：${tests.filter(test => test.passed).length} / ${tests.length}`;
    status.className = report.passed ? 'pass' : 'fail'; document.getElementById('details').textContent = JSON.stringify(report, null, 2);
    const stored = await fetch('/__encounter_report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }); assert(stored.ok, 'Cannot save browser report');
})().catch(error => { status.textContent = `验收中断：${error.message}`; status.className = 'fail'; }).finally(() => client.terminate());
