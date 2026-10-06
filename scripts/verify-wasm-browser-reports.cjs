const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root } = require('./rust-tools.cjs');
const { sha256 } = require('../bench/lib/reference.cjs');

const manifest = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/manifest.json')));
const readyFile = path.join(root, '.wasm-build/browser-ready.json');
const ready = JSON.parse(fs.readFileSync(readyFile));
const wasmHash = sha256(fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm_bg.wasm')));
assert.equal(wasmHash, manifest.artifacts['combat_wasm_bg.wasm']);
assert.equal(wasmHash, ready.wasmSha256);
assert.equal(ready.dataFingerprint, manifest.dataFingerprint);
assert.equal(sha256(fs.readFileSync(path.join(root, '.wasm-build/data/combat-data.json'))), manifest.dataAssetSha256);

for (const [name, pathname] of [['browser-root.json', '/'], ['browser-pages.json', '/MWICombatSimulatorTest/dist/']]) {
    const file = path.join(root, '.bench/rust-wasm-p1', name);
    const report = JSON.parse(fs.readFileSync(file));
    assert.ok(fs.statSync(file).mtimeMs >= fs.statSync(readyFile).mtimeMs, `${name}: rerun after the latest prototype build`);
    assert.equal(report.schemaVersion, 1);
    assert.equal(report.phase, 'P1');
    assert.equal(report.path, pathname);
    assert.equal(report.passed, true);
    assert.equal(report.tests.length, 12);
    assert.equal(new Set(report.tests.map(test => test.name)).size, 12);
    assert.ok(report.tests.every(test => test.passed === true), `${name}: failed browser test`);
    assert.equal(report.wasmSha256, wasmHash);
    assert.equal(report.dataFingerprint, manifest.dataFingerprint);
    const initial = report.details.initial, reused = report.details.reused, final = report.details.final;
    assert.equal(initial.info.definitionCount, 16);
    assert.equal(initial.module.interfaceVersion, manifest.interfaceVersion);
    assert.equal(initial.module.rngVersion, manifest.rngVersion);
    assert.equal(initial.module.dataFingerprint, manifest.dataFingerprint);
    assert.equal(initial.loadMode, 'response');
    assert.equal(reused.moduleInitCount, 1);
    assert.equal(reused.engineInitCount, 1);
    assert.equal(reused.dataFetchCount, 1);
    assert.equal(reused.liveProbes, 0);
    assert.equal(final.moduleInitCount, 1);
    assert.equal(final.engineInitCount, 3);
    assert.equal(final.liveProbes, 0);
    for (const url of Object.values(initial.assets)) {
        const resource = new URL(url);
        assert.equal(resource.hostname, '127.0.0.1');
        assert.ok(resource.pathname.startsWith(pathname + 'assets/'));
    }
    console.log(`${name}: 12/12 passed; fingerprints, lifecycle and path verified`);
}
