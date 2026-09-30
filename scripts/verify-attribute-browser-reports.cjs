const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./rust-tools.cjs');
const { sha256, loadReference } = require('../bench/lib/reference.cjs');

const read = file => JSON.parse(fs.readFileSync(path.join(root, file)));
const manifest = read('.wasm-build/manifest.json');
const readyFile = path.join(root, '.wasm-build/browser-ready.json');
const ready = read('.wasm-build/browser-ready.json');
const reference = read('.wasm-build/attributes/manifest.json');
const frozen = loadReference('js-reference-2783b09-p0');
const wasmHash = sha256(fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm_bg.wasm')));
assert.equal(wasmHash, manifest.artifacts['combat_wasm_bg.wasm']);
assert.equal(wasmHash, ready.wasmSha256);
assert.equal(reference.engineSourceSha256, frozen.engineSourceSha256);
assert.equal(reference.dataFingerprint, frozen.gameDataSha256);
assert.equal(reference.dataFingerprint, manifest.dataFingerprint);
assert.equal(ready.dataFingerprint, manifest.dataFingerprint);
assert.equal(sha256(fs.readFileSync(path.join(root, '.wasm-build/data/combat-data.json'))), manifest.dataAssetSha256);
assert.deepEqual(read('.wasm-build/browser/attribute-reference/manifest.json'), reference);
let cases = 0, frames = 0;
for (const [group, expected] of Object.entries(reference.groups)) {
    const bytes = fs.readFileSync(path.join(root, '.wasm-build/attributes', group + '.json'));
    assert.equal(sha256(bytes), expected.sha256);
    assert.equal(sha256(fs.readFileSync(path.join(root, '.wasm-build/browser/attribute-reference', group + '.json'))), expected.sha256);
    const value = JSON.parse(bytes);
    assert.equal(value.cases.length, expected.cases);
    assert.equal(value.expected.length, expected.cases);
    assert.equal(value.expected.reduce((sum, snapshots) => sum + snapshots.length, 0), expected.frames);
    cases += expected.cases; frames += expected.frames;
}
for (const [name, pathname, assetPrefix] of [['browser-root.json', '/attributes.html', '/'],
    ['browser-pages.json', '/MWICombatSimulatorTest/dist/attributes.html', '/MWICombatSimulatorTest/dist/']]) {
    const file = path.join(root, '.bench/rust-wasm-p2-attributes', name);
    const report = JSON.parse(fs.readFileSync(file));
    assert.ok(fs.statSync(file).mtimeMs >= fs.statSync(readyFile).mtimeMs, `${name}: rerun after the latest prototype build`);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.phase, 'P2.1');
    assert.equal(report.path, pathname);
    assert.equal(report.passed, true);
    assert.equal(report.tests.length, 7);
    assert.equal(new Set(report.tests.map(test => test.name)).size, 7);
    assert.ok(report.tests.every(test => test.passed === true), `${name}: failed browser test`);
    assert.deepEqual(report.groups, reference.groups);
    assert.equal(report.wasmSha256, wasmHash);
    assert.equal(report.dataFingerprint, manifest.dataFingerprint);
    for (const stats of [report.stats, report.finalStats]) {
        assert.equal(stats.moduleInitCount, 1);
        assert.equal(stats.engineInitCount, 1);
        assert.equal(stats.dataFetchCount, 1);
        assert.equal(stats.liveProbes, 0);
        assert.equal(stats.loadMode, 'response');
        assert.equal(stats.module.interfaceVersion, manifest.interfaceVersion);
        assert.equal(stats.module.rngVersion, manifest.rngVersion);
        assert.equal(stats.module.dataFingerprint, manifest.dataFingerprint);
        for (const url of Object.values(stats.assets)) {
            const resource = new URL(url);
            assert.equal(resource.hostname, '127.0.0.1');
            assert.ok(resource.pathname.startsWith(assetPrefix + 'assets/'));
        }
    }
    assert.equal(report.stats.info.definitionCount, 16);
    assert.equal(report.stats.info.dataFingerprint, manifest.dataFingerprint);
    assert.equal(report.stats.liveEngines, 1);
    assert.equal(report.finalStats.liveEngines, 0);
    assert.equal(report.finalStats.info, null);
    console.log(`${name}: 7/7 passed; ${cases} cases / ${frames} snapshots, fingerprints and lifecycle verified`);
}
