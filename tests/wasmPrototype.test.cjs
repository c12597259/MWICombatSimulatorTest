const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const webpack = require('webpack');
const { root } = require('../scripts/rust-tools.cjs');
const vectors = require('./fixtures/combat/rng-js-number-v1.json');
let wasm, engine, probes, manifest, dataText;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

test('WASM prototype', async t => {
    manifest = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/manifest.json')));
    for (const [file, expected] of Object.entries(manifest.artifacts)) {
        assert.equal(sha256(fs.readFileSync(path.join(root, '.wasm-build/pkg', file))), expected, `${file} fingerprint`);
    }
    dataText = fs.readFileSync(path.join(root, '.wasm-build/data/combat-data.json'), 'utf8');
    assert.equal(sha256(dataText), manifest.dataAssetSha256);
    const source = fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm.js'));
    // Execute the exact wasm-pack web wrapper, passing actual bytes (no JS core substitute).
    wasm = await import(`data:text/javascript;base64,${source.toString('base64')}`);
    await wasm.default({ module_or_path: fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm_bg.wasm')) });
    engine = new wasm.PrototypeEngine(dataText, manifest.dataFingerprint);
    await new Promise((resolve, reject) => {
        const compiler = webpack({ mode: 'development', context: root, target: 'node', devtool: false,
            entry: './prototype/probeCases.js', output: { path: path.join(root, '.wasm-build'), filename: 'probes.cjs', library: { type: 'commonjs2' } } });
        compiler.run((error, stats) => compiler.close(closeError => {
            if (error || closeError || stats.hasErrors()) reject(error || closeError || new Error(stats.toString({ all: false, errors: true })));
            else resolve();
        }));
    });
    probes = require('../.wasm-build/probes.cjs');
    t.after(() => engine?.free());

    await t.test('actual WASM initializes all public definitions and version fingerprints', () => {
        assert.equal(JSON.parse(engine.info()).definitionCount, 16);
        assert.equal(JSON.parse(wasm.module_info()).dataFingerprint, manifest.dataFingerprint);
        assert.equal(JSON.parse(wasm.module_info()).rngVersion, vectors.rngVersion);
        assert.equal(JSON.parse(wasm.module_info()).interfaceVersion, 1);
    });

    await t.test('actual WASM matches 4 frozen JS RNG vectors through 6 million draws each', () => {
        for (const vector of vectors.vectors) {
            const probe = engine.create_rng_probe(vector.seed);
            try {
                for (const { call, u32 } of vector.values) assert.equal(probe.sample_to(call), u32, `seed ${vector.seed}, call ${call}`);
                assert.equal(probe.calls(), 6_000_000);
            } finally { probe.free(); }
        }
        assert.equal(wasm.live_probes(), 0);
    });

    await t.test('actual WASM RNG keeps state across short and long chunk boundaries', () => {
        const vector = vectors.vectors[1];
        for (const chunk of [1, 999, 1000, 1001, 10000]) {
            const probe = engine.create_rng_probe(vector.seed);
            try {
                const expected = chunk === 1 ? vector.values.slice(0, 3) : vector.values;
                for (const { call, u32 } of expected) {
                    let actual;
                    while (probe.calls() < call) actual = probe.sample_to(Math.min(call, probe.calls() + chunk));
                    assert.equal(actual, u32, `chunk ${chunk}, call ${call}`);
                }
            } finally { probe.free(); }
        }
    });

    await t.test('actual WASM queue matches existing JS heap trace at every operation', () => {
        for (const actions of Object.values(probes.queueCases())) {
            assert.deepEqual(JSON.parse(engine.queue_trace(JSON.stringify(actions))), probes.jsQueueTrace(actions));
        }
    });

    await t.test('actual WASM preserves JS round, negative zero and remainder', () => {
        for (const value of probes.numericCases) {
            assert.ok(Object.is(wasm.js_round(value), Math.round(value)), `round ${value}`);
            assert.ok(Object.is(wasm.js_remainder(value, 2), value % 2), `remainder ${value}`);
        }
    });

    await t.test('invalid inputs and version mismatch reject without poisoning engine', () => {
        assert.throws(() => new wasm.PrototypeEngine(dataText, 'wrong'));
        assert.throws(() => new wasm.PrototypeEngine('{}', manifest.dataFingerprint));
        assert.throws(() => new wasm.PrototypeEngine(dataText.replace('"schemaVersion":1', '"schemaVersion":2'), manifest.dataFingerprint));
        assert.throws(() => engine.queue_trace('invalid'));
        assert.throws(() => engine.queue_trace('[{"op":"unknown"}]'));
        const probe = engine.create_rng_probe(1);
        try { assert.throws(() => probe.sample_to(0)); assert.equal(probe.sample_to(1), vectors.vectors[1].values[0].u32); }
        finally { probe.free(); }
        assert.deepEqual(JSON.parse(engine.queue_trace('[]')), []);
        assert.equal(wasm.live_engines(), 1);
        assert.equal(wasm.live_probes(), 0);
    });

    await t.test('explicit free releases Rust objects and definitions can be rebuilt', () => {
        engine.free();
        engine = undefined;
        assert.equal(wasm.live_engines(), 0);
        engine = new wasm.PrototypeEngine(dataText, manifest.dataFingerprint);
        assert.equal(wasm.live_engines(), 1);
    });
});
