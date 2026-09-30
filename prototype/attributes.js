import { ProbeClient } from './client.js';
import build from '../.wasm-build/manifest.json';
import { compareResults } from './compareValues.js';

const client = new ProbeClient();
const tests = [], status = document.getElementById('status');
const assert = (value, message) => { if (!value) throw new Error(message); };
async function test(name, action) {
    const item = document.createElement('li'); item.textContent = `${name}：运行中`; document.getElementById('tests').append(item);
    const start = performance.now();
    try { await action(); tests.push({ name, passed: true, ms: Math.round(performance.now() - start) }); item.className = 'pass'; item.textContent = `通过：${name}`; }
    catch (error) { tests.push({ name, passed: false, error: error.message }); item.className = 'fail'; item.textContent = `失败：${name} — ${error.message}`; }
}
async function digest(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join(''); }

(async () => {
    const response = await fetch('attribute-reference/manifest.json'); assert(response.ok, 'Cannot load attribute manifest');
    const reference = await response.json();
    assert(reference.dataFingerprint === build.dataFingerprint, 'Definition version mismatch');
    await test('真实 Worker 初始化属性引擎', async () => { const info = await client.request('init'); assert(info.info.definitionCount === 16, 'Missing definitions'); });
    for (const [name, expected] of Object.entries(reference.groups)) {
        await test(`${name}：${expected.cases} 个案例逐字段精确对齐`, async () => {
            const response = await fetch(`attribute-reference/${name}.json`); assert(response.ok, `Cannot load ${name}`);
            const bytes = await response.arrayBuffer(); assert(await digest(bytes) === expected.sha256, 'Reference asset fingerprint mismatch');
            const group = JSON.parse(new TextDecoder().decode(bytes));
            for (let offset = 0; offset < group.cases.length; offset += 64) {
                const cases = group.cases.slice(offset, offset + 64);
                const actual = await client.request('attributes', { inputJson: JSON.stringify(cases.map(item => item.request)) });
                const difference = compareResults({ snapshots: group.expected.slice(offset, offset + cases.length) }, { snapshots: actual });
                assert(difference === null, `${name}, batch ${offset}: ${JSON.stringify(difference)}`);
            }
        });
    }
    await test('属性输入错误后恢复，模块继续复用', async () => {
        let rejected = false;
        try { await client.request('attributes', { inputJson: '[{"input":{"kind":"monster","hrid":"/monsters/missing"}}]' }); }
        catch (error) { rejected = error.code === 'INVALID_INPUT'; }
        assert(rejected, 'Invalid attribute input was accepted');
        const result = await client.request('attributes', { inputJson: '[]' }); assert(result.length === 0, 'Recovery failed');
    });
    const stats = await client.request('stats');
    let finalStats;
    await test('任务结束后句柄与模块初始化次数正确', async () => {
        assert(stats.moduleInitCount === 1 && stats.engineInitCount === 1 && stats.liveProbes === 0, 'Reuse failed');
        finalStats = await client.request('destroy'); assert(finalStats.liveEngines === 0, 'Engine was not freed');
    });
    const report = { schemaVersion: 1, phase: 'P2.1', path: location.pathname, userAgent: navigator.userAgent,
        passed: tests.every(test => test.passed), tests, groups: reference.groups, dataFingerprint: build.dataFingerprint,
        wasmSha256: build.artifacts['combat_wasm_bg.wasm'], stats, finalStats };
    status.textContent = `${report.passed ? '全部通过' : '存在失败'}：${tests.filter(test => test.passed).length} / ${tests.length}`;
    status.className = report.passed ? 'pass' : 'fail'; document.getElementById('details').textContent = JSON.stringify(report, null, 2);
    const stored = await fetch('/__attribute_report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
    assert(stored.ok, 'Cannot save attribute browser report');
})().catch(error => { status.textContent = `验收中断：${error.message}`; status.className = 'fail'; }).finally(() => client.terminate());
