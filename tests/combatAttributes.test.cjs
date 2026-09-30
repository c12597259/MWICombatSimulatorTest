const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root } = require('../scripts/rust-tools.cjs');
const { compareResults } = require('../bench/lib/resultComparison.cjs');
const { sha256 } = require('../bench/lib/reference.cjs');

test('P2.1 attribute parity with frozen JS', async t => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/manifest.json')));
    const dataPath = path.join(root, '.wasm-build/data/combat-data.json');
    assert.equal(sha256(fs.readFileSync(dataPath)), manifest.dataAssetSha256);
    const bytes = fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm_bg.wasm'));
    assert.equal(sha256(bytes), manifest.artifacts['combat_wasm_bg.wasm']);
    const source = fs.readFileSync(path.join(root, '.wasm-build/pkg/combat_wasm.js'));
    const wasm = await import(`data:text/javascript;base64,${source.toString('base64')}`);
    await wasm.default({ module_or_path: bytes });
    const engine = new wasm.PrototypeEngine(fs.readFileSync(dataPath, 'utf8'), manifest.dataFingerprint);
    t.after(() => engine.free());
    await t.test('raw exports and frozen JS Worker DTO normalize identically', () => {
        globalThis.onmessage = () => {};
        const { normalizeCharacterInput } = require('../.bench/attributes-cases.cjs');
        const { parsePlayerJson } = require('../.bench/attributes-reference.cjs');
        const party = require('./fixtures/combat/synthetic-party.json');
        for (const profile of Object.values(party)) {
            assert.deepEqual(normalizeCharacterInput(profile), normalizeCharacterInput(parsePlayerJson(profile, 'player1')));
        }
        const omittedValue = structuredClone(party['1']);
        omittedValue.triggerMap[omittedValue.abilities.find(item => item.abilityHrid).abilityHrid] = [{
            dependencyHrid: '/combat_trigger_dependencies/self', conditionHrid: '/combat_trigger_conditions/current_hitpoints',
            comparatorHrid: '/combat_trigger_comparators/less_than_equal' }];
        assert.deepEqual(normalizeCharacterInput(omittedValue), normalizeCharacterInput(parsePlayerJson(omittedValue, 'player1')));
        const legacy = structuredClone(party['1']); delete legacy.achievements;
        legacy.guildCombatBuffLevels = { '/guild_shrines/force_combat': { activeLevel: 3.8 }, spirit: -1, tempo: 99 };
        assert.deepEqual(normalizeCharacterInput(legacy).shrines, [3, 20, 0, 0, 0]);
        assert.deepEqual(normalizeCharacterInput(legacy).achievements, {});
        delete legacy.guildCombatBuffLevels;
        legacy.guildCombatBuffs = [{ typeHrid: '/buff_types/damage', ratioBoost: 0.009, flatBoost: 0 },
            { typeHrid: '/buff_types/cast_speed', ratioBoost: 0, flatBoost: 0.016 },
            { typeHrid: '/buff_types/accuracy', ratioBoost: '0.1', flatBoost: '2' }];
        const result = normalizeCharacterInput(legacy);
        assert.deepEqual(result.shrines, [3, 4, 0, 0, 0]);
        assert.equal(result.guildBuffs.length, 1);
        assert.equal(result.guildBuffs[0].ratioBoost, 0.1);
        assert.equal(result.guildBuffs[0].flatBoost, 2);
        legacy.player.attackLevel = 'bad';
        assert.throws(() => normalizeCharacterInput(legacy), /attackLevel/);
    });
    await t.test('browser comparator rejects tiny drift, missing fields and array reordering', async () => {
        const source = fs.readFileSync(path.join(root, 'prototype/compareValues.js'));
        const browser = await import(`data:text/javascript;base64,${source.toString('base64')}`);
        const expected = { snapshots: [{ rating: 1, keys: ['a', 'b'], empty: null }] };
        for (const change of [value => { value.snapshots[0].rating += Number.EPSILON; },
            value => { delete value.snapshots[0].empty; }, value => { value.snapshots[0].keys.reverse(); }]) {
            const actual = structuredClone(expected); change(actual);
            const difference = browser.compareResults(expected, actual);
            assert.notEqual(difference, null);
            assert.equal(difference.path, compareResults(expected, actual).path);
        }
        assert.equal(browser.compareResults(expected, { snapshots: [{ empty: null, keys: ['a', 'b'], rating: 1 }] }), null);
    });
    for (const name of ['equipment', 'monsters', 'permanent', 'lifecycle']) {
        const group = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/attributes', name + '.json')));
        for (const backend of ['rust', 'wasm']) await t.test(`${name}: ${group.cases.length} cases / ${backend}`, () => {
            for (let offset = 0; offset < group.cases.length; offset += 64) {
                const cases = group.cases.slice(offset, offset + 64);
                const input = JSON.stringify(cases.map(item => item.request));
                let actual;
                if (backend === 'wasm') actual = JSON.parse(engine.attribute_trace(input));
                else {
                    const process = spawnSync(path.join(root, 'rust/target/release/mwi-combat-cli.exe'), ['attributes', dataPath, manifest.dataFingerprint], { input, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
                    assert.equal(process.status, 0, process.stderr || process.error?.message);
                    actual = JSON.parse(process.stdout);
                }
                // Exact parsed numeric values and every attribute field; no tolerances.
                const difference = compareResults({ snapshots: group.expected.slice(offset, offset + cases.length) }, { snapshots: actual });
                assert.equal(difference, null, `${cases[difference?.path.match(/\["snapshots"\]\[(\d+)\]/)?.[1] || 0]?.name}: ${JSON.stringify(difference)}`);
            }
        });
    }
    await t.test('invalid identifiers/levels/JSON reject and valid requests still work', () => {
        const group = JSON.parse(fs.readFileSync(path.join(root, '.wasm-build/attributes/equipment.json')));
        const request = structuredClone(group.cases[0].request);
        assert.throws(() => engine.attribute_trace('invalid JSON'));
        assert.throws(() => engine.attribute_trace(JSON.stringify([{ input: { kind: 'monster', hrid: '/monsters/missing' } }])));
        request.input.inputVersion = 2;
        assert.throws(() => engine.attribute_trace(JSON.stringify([request])));
        request.input.inputVersion = 1;
        request.input.equipment[0].enhancementLevel = 21;
        assert.throws(() => engine.attribute_trace(JSON.stringify([request])));
        request.input.equipment[0].enhancementLevel = 0;
        request.input.shrines[0] = 21;
        assert.throws(() => engine.attribute_trace(JSON.stringify([request])));
        assert.deepEqual(JSON.parse(engine.attribute_trace('[]')), []);
        assert.equal(wasm.live_engines(), 1);
        assert.equal(wasm.live_probes(), 0);
    });
});
