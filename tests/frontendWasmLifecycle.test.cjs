const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('frontend chunked WASM export preserves output and releases the simulation', async () => {
    const read = file => fs.readFileSync(path.join(root, file));
    const manifest = JSON.parse(read('.wasm-build/manifest.json'));
    const wasm = await import(`data:text/javascript;base64,${read('.wasm-build/pkg/combat_wasm.js').toString('base64')}`);
    await wasm.default({ module_or_path: read('.wasm-build/pkg/combat_wasm_bg.wasm') });
    const engine = new wasm.PrototypeEngine(read('.wasm-build/data/combat-data.json').toString(), manifest.dataFingerprint);
    const input = JSON.parse(read('tests/fixtures/combat/frontend-request.json'));
    const request = JSON.stringify(input);
    const strip = envelope => {
        for (const wipe of envelope.result.wipeEvents) delete wipe.timestamp;
        return envelope;
    };
    let probe;
    try {
        const expected = strip(JSON.parse(engine.simulate(request)));
        probe = engine.create_simulation(request);
        assert.equal(wasm.live_simulations(), 1);
        assert.throws(() => probe.finish(), /not complete/);
        assert.deepEqual(JSON.parse(probe.time_series()).timestamps, []);
        while (!probe.done()) probe.advance(10000);
        assert.deepEqual(JSON.parse(probe.time_series()), expected.result.timeSeriesData);
        assert.deepEqual(strip(JSON.parse(probe.finish())), expected);
        assert.equal(probe.done(), true);
        assert.throws(() => probe.result(), /already finished/);
        assert.throws(() => probe.finish(), /already finished/);
        assert.throws(() => probe.advance(1), /already finished/);
    } finally { probe?.free(); engine.free(); }
    assert.equal(wasm.live_simulations(), 0);
    assert.equal(wasm.live_engines(), 0);
});
