const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./rust-tools.cjs');
const { sha256, loadReference } = require('../bench/lib/reference.cjs');
const { audit } = require('./encounter-coverage.cjs');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file)));
const manifest = read('.wasm-build/manifest.json'), ready = read('.wasm-build/browser-ready.json');
const reference = read('.wasm-build/encounters/manifest.json'), frozen = loadReference('js-reference-2783b09-p0');
const wasmHash = sha256(fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm_bg.wasm')));
assert.equal(wasmHash, manifest.artifacts['combat_wasm_bg.wasm']); assert.equal(wasmHash, ready.wasmSha256);
assert.equal(reference.engineSourceSha256, frozen.engineSourceSha256);
assert.equal(reference.dataFingerprint, frozen.gameDataSha256); assert.equal(reference.dataFingerprint, manifest.dataFingerprint);
assert.equal(ready.dataFingerprint, manifest.dataFingerprint);
assert.equal(sha256(fs.readFileSync(path.join(root, '.wasm-build/data/combat-data.json'))), manifest.dataAssetSha256);
assert.deepEqual(read('.wasm-build/browser/encounter-reference/manifest.json'), reference);
const coverage = audit(path.join(root, '.wasm-build/encounters'), reference);
for (const [name, info] of [...Object.entries(reference.groups), ['math', reference.math]]) {
    assert.equal(sha256(fs.readFileSync(path.join(root, '.wasm-build/encounters', name + '.json'))), info.sha256);
    assert.equal(sha256(fs.readFileSync(path.join(root, '.wasm-build/browser/encounter-reference', name + '.json'))), info.sha256);
}
for (const [name, pathname, prefix] of [['browser-root.json', '/encounters.html', '/'],
    ['browser-pages.json', '/MWICombatSimulatorTest/dist/encounters.html', '/MWICombatSimulatorTest/dist/']]) {
    const file = path.join(root, '.bench/rust-wasm-p2-events', name), report = JSON.parse(fs.readFileSync(file));
    assert.ok(fs.statSync(file).mtimeMs >= fs.statSync(path.join(root, '.wasm-build/browser-ready.json')).mtimeMs, 'Rerun browser after latest build');
    assert.equal(report.schemaVersion, 1); assert.equal(report.phase, 'P2.2'); assert.equal(report.path, pathname);
    assert.equal(report.passed, true); assert.equal(report.tests.length, 11); assert.equal(new Set(report.tests.map(test => test.name)).size, 11);
    assert.ok(report.tests.every(test => test.passed === true));
    assert.deepEqual(report.groups, reference.groups); assert.deepEqual(report.math, reference.math);
    assert.equal(report.wasmSha256, wasmHash); assert.equal(report.dataFingerprint, manifest.dataFingerprint);
    for (const stats of [report.stats, report.finalStats]) {
        assert.equal(stats.moduleInitCount, 1); assert.equal(stats.engineInitCount, 1); assert.equal(stats.dataFetchCount, 1);
        assert.equal(stats.liveProbes, 0); assert.equal(stats.liveEncounters, 0); assert.equal(stats.loadMode, 'response');
        assert.equal(stats.module.interfaceVersion, manifest.interfaceVersion); assert.equal(stats.module.rngVersion, manifest.rngVersion);
        assert.equal(stats.module.dataFingerprint, manifest.dataFingerprint);
        for (const url of Object.values(stats.assets)) { const resource = new URL(url); assert.equal(resource.hostname, '127.0.0.1'); assert.ok(resource.pathname.startsWith(prefix + 'assets/')); }
    }
    assert.equal(report.stats.info.definitionCount, 16); assert.equal(report.stats.info.dataFingerprint, manifest.dataFingerprint);
    assert.equal(report.stats.liveEngines, 1); assert.equal(report.finalStats.liveEngines, 0); assert.equal(report.finalStats.info, null);
    console.log(`${name}: 11/11 passed; ${coverage.cases} cases / ${coverage.frames} event frames; ${coverage.eventKinds} event kinds; fingerprints and lifecycle verified`);
}
