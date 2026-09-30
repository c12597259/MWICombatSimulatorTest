const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('../scripts/rust-tools.cjs');
const { sha256 } = require('../bench/lib/reference.cjs');
const { compareResults } = require('../bench/lib/resultComparison.cjs');

test('P2.2 frozen JS combat event parity', async t => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/manifest.json')));
    const reference = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/encounters/manifest.json')));
    require('../scripts/encounter-coverage.cjs').audit(path.join(root, '.wasm-build/encounters'), reference);
    const dataPath = path.join(root, '.wasm-build/data/combat-data.json');
    const wasmBytes = fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm_bg.wasm'));
    assert.equal(sha256(wasmBytes), manifest.artifacts['combat_wasm_bg.wasm']);
    assert.equal(reference.dataFingerprint, manifest.dataFingerprint);
    const source = fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm.js'));
    const wasm = await import(`data:text/javascript;base64,${source.toString('base64')}`);
    await wasm.default({ module_or_path: wasmBytes });
    const engine = new wasm.PrototypeEngine(fs.readFileSync(dataPath, 'utf8'), manifest.dataFingerprint);
    t.after(() => engine.free());
    const native = (mode, cases) => {
        const child = spawnSync(path.join(root, 'rust/target/release/mwi-combat-cli.exe'), [mode, dataPath, manifest.dataFingerprint],
            { input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
        assert.equal(child.status, 0, child.stderr || child.error?.message);
        return JSON.parse(child.stdout);
    };
    const load = (name, expected) => {
        const bytes = fs.readFileSync(path.join(root, '.wasm-build/encounters', name + '.json'));
        assert.equal(sha256(bytes), expected.sha256); return JSON.parse(bytes);
    };
    const math = load('math', reference.math);
    for (const backend of ['rust', 'wasm']) await t.test(`pow, randomInt draw order and tick distribution / ${backend}`, () => {
        const actual = backend === 'rust' ? native('math', math.cases) : JSON.parse(engine.math_trace(JSON.stringify(math.cases)));
        assert.equal(compareResults({ snapshots: math.expected }, { snapshots: actual }), null);
    });
    for (const [name, info] of Object.entries(reference.groups)) {
        const group = load(name, info);
        for (const backend of ['rust', 'wasm']) await t.test(`${name}: ${info.cases} cases / ${info.frames} frames / ${backend}`, () => {
            for (let offset = 0; offset < group.cases.length; offset += 4) {
                const cases = group.cases.slice(offset, offset + 4), request = cases.map(value => value.request);
                const actual = backend === 'rust' ? native('encounters', request) : JSON.parse(engine.encounter_trace(JSON.stringify(request)));
                const difference = compareResults({ snapshots: group.expected.slice(offset, offset + cases.length) }, { snapshots: actual });
                const index = Number(difference?.path.match(/\["snapshots"\]\[(\d+)\]/)?.[1] || 0);
                assert.equal(difference, null, `${cases[index]?.name}: ${JSON.stringify(difference)}`);
            }
        });
    }
    const natural = load('natural', reference.groups.natural);
    await t.test('chunk boundaries retain battle state, queue and RNG; handles release', () => {
        for (const chunk of [1, 7, 1000]) {
            const probe = engine.create_encounter(JSON.stringify(natural.cases[0].request));
            try {
                assert.equal(wasm.live_encounters(), 1);
                const actual = []; while (!probe.done()) actual.push(...JSON.parse(probe.advance(chunk)));
                assert.equal(compareResults({ snapshots: natural.expected[0] }, { snapshots: actual }), null);
                assert.deepEqual(JSON.parse(probe.advance(chunk)), []);
            } finally { probe.free(); }
            assert.equal(wasm.live_encounters(), 0);
        }
    });
    await t.test('invalid encounter input rejects; independent subsequent runs remain valid', () => {
        assert.throws(() => engine.create_encounter('{}'));
        const request = structuredClone(natural.cases[0].request); request.enemies[0].input.hrid = '/monsters/missing';
        assert.throws(() => engine.create_encounter(JSON.stringify(request)));
        assert.equal(wasm.live_encounters(), 0);
        assert.deepEqual(JSON.parse(engine.encounter_trace('[]')), []);
    });
    await t.test('invalid chunks preserve state; execution errors poison the run until release', () => {
        const probe = engine.create_encounter(JSON.stringify(natural.cases[0].request));
        try {
            assert.throws(() => probe.advance(0));
            assert.throws(() => probe.advance(10_001));
            assert.equal(compareResults({ snapshots: natural.expected[0].slice(0, 1) }, { snapshots: JSON.parse(probe.advance(1)) }), null);
        } finally { probe.free(); }
        for (const setup of [{ flags: { invalid: true } }, { combatDetails: { combatStats: { invalid: 1 } } }]) {
            const invalid = structuredClone(natural.cases[0].request);
            invalid.setup = [{ unit: 0, ...setup }];
            const failed = engine.create_encounter(JSON.stringify(invalid));
            try {
                assert.throws(() => failed.advance(1));
                assert.equal(failed.done(), true);
                assert.throws(() => failed.advance(1), /Encounter failed/);
            } finally { failed.free(); }
        }
        assert.equal(wasm.live_encounters(), 0);
    });
    await t.test('run owns shared definitions after engine release', () => {
        const independent = new wasm.PrototypeEngine(fs.readFileSync(dataPath, 'utf8'), manifest.dataFingerprint);
        const probe = independent.create_encounter(JSON.stringify(natural.cases[0].request));
        independent.free();
        try {
            const actual = []; while (!probe.done()) actual.push(...JSON.parse(probe.advance(7)));
            assert.equal(compareResults({ snapshots: natural.expected[0] }, { snapshots: actual }), null);
        } finally { probe.free(); }
        assert.equal(wasm.live_encounters(), 0);
        assert.equal(wasm.live_engines(), 1);
    });
});
