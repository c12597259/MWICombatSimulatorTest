const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('../scripts/rust-tools.cjs');
const { compareSimulation } = require('../bench/lib/simulationComparison.cjs');

test('focus charms preserve JS experience allocation for melee, ranged and magic', async t => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/manifest.json')));
    const wasm = await import(`data:text/javascript;base64,${fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm.js')).toString('base64')}`);
    await wasm.default({ module_or_path: fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm_bg.wasm')) });
    const dataPath = path.join(root, '.wasm-build/data/combat-data.json');
    const engine = new wasm.PrototypeEngine(fs.readFileSync(dataPath, 'utf8'), manifest.dataFingerprint);
    t.after(() => engine.free());
    globalThis.onmessage = () => {};
    globalThis.CustomEvent ??= class CustomEvent extends Event { constructor(type, options) { super(type); this.detail = options.detail; } };
    const reference = require('../.bench/simulations-reference.cjs').simulationReference;
    const sample = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/simulations/0.json'))).request;
    for (const mode of ['matching', 'incompatible', 'none']) {
        const input = structuredClone(sample);
        input.zone = { hrid: '/actions/combat/aqua_planet', difficultyTier: 0 };
        input.timeLimit = 0.2 * 3600e9;
        input.players = input.players.slice(0, 3);
        for (const [index, player] of input.players.entries()) {
            player.zoneHrid = input.zone.hrid;
            player.input.equipment = player.input.equipment.filter(item => item.slot !== '/equipment_types/charm');
            if (mode !== 'none') {
                const skill = (mode === 'matching' ? ['melee', 'ranged', 'magic'] : ['magic', 'melee', 'ranged'])[index];
                player.input.equipment.push({ slot: '/equipment_types/charm', hrid: `/items/advanced_${skill}_charm`, enhancementLevel: 4 });
            }
        }
        const expected = await reference(input);
        assert.ok(expected.result.encounters > 0, 'Must actually award combat experience');
        for (const backend of ['wasm', 'native']) await t.test(`${mode} / ${backend}`, () => {
            let actual;
            if (backend === 'wasm') actual = JSON.parse(engine.simulate(JSON.stringify(input)));
            else {
                const proc = spawnSync(path.join(root, 'rust/target/release/mwi-combat-cli.exe'), ['simulations', dataPath, manifest.dataFingerprint],
                    { input: JSON.stringify([input]), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
                assert.equal(proc.status, 0, proc.stderr || proc.error?.message);
                actual = JSON.parse(proc.stdout)[0];
            }
            assert.equal(compareSimulation(expected, actual), null);
        });
    }
});
