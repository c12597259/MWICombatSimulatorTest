import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const { normalizeResult, resultHash, compareResults } = require('../bench/lib/resultComparison.cjs');
const { seededRandom, RNG_VERSION } = require('../bench/lib/seededRandom.cjs');
const { sha256, validateName, sourceIdentity, loadReference } = require('../bench/lib/reference.cjs');
const { createFixtures } = require('../bench/create-fixtures.cjs');

test('canonical results ignore object key order and only wipe wall clocks', () => {
    const a = { attacks: { b: 2, a: 1 }, wipeEvents: [{ timestamp: 'first', simulationTime: 3, logs: [] }] };
    const b = { wipeEvents: [{ logs: [], simulationTime: 3, timestamp: 'second' }], attacks: { a: 1, b: 2 } };
    assert.equal(compareResults(a, b), null);
    assert.equal(resultHash(a), resultHash(b));
    assert.equal(a.wipeEvents[0].timestamp, 'first', 'comparison must not mutate the result');
    assert.notEqual(compareResults({ timestamp: 'first' }, { timestamp: 'second' }), null);
    assert.notEqual(compareResults({ wipeEvents: [{ logs: [{ timestamp: 'first' }] }] },
        { wipeEvents: [{ logs: [{ timestamp: 'second' }] }] }), null);
});

test('canonical JSON handles omitted undefined and keeps null/empty containers distinct', () => {
    assert.equal(compareResults({ missing: undefined, slots: [undefined] }, { slots: [null] }), null);
    for (const changed of [null, [], {}]) assert.notEqual(compareResults({}, { field: changed }), null);
    assert.notEqual(compareResults({ field: [] }, { field: {} }), null);
    assert.throws(() => normalizeResult(null), /JSON object/);
    const value = JSON.parse('{"__proto__":{"value":1},"constructor":2}');
    assert.equal(Object.hasOwn(normalizeResult(value), '__proto__'), true);
});

test('small numerical drift, array reorder and changed types fail at a precise path', () => {
    assert.deepEqual(compareResults({ experience: { player1: 1 } }, { experience: { player1: 1 + Number.EPSILON } }),
        { path: '$["experience"]["player1"]', reason: 'value', expected: 1, actual: 1 + Number.EPSILON });
    assert.equal(compareResults({ waves: [1, 2] }, { waves: [2, 1] }).path, '$["waves"][0]');
    assert.equal(compareResults({ waves: [1] }, { waves: [] }).reason, 'array-length');
    assert.notEqual(compareResults({ hits: 10 }, { hits: '10' }), null);
    assert.notEqual(compareResults({ hp: 0 }, { hp: false }), null);
    assert.notEqual(compareResults({ hp: null }, { hp: {} }), null);
    assert.notEqual(compareResults({ engineDiagnostic: 1 }, { engineDiagnostic: 2 }), null);
});

test('Mulberry32 retains known seed-1 values and counts every call', () => {
    const random = seededRandom(1);
    assert.deepEqual(Array.from({ length: 5 }, () => random()), [
        0.6270739405881613, 0.002735721180215478, 0.5274470399599522,
        0.9810509674716741, 0.9683778982143849,
    ]);
    assert.equal(random.count(), 5);
});

test('legacy growing-state stream matches wrapping-u32 arithmetic across a million calls', () => {
    for (const seed of [0, 1, 42, 0xFFFFFFFF]) {
        const legacy = seededRandom(seed);
        let state = seed >>> 0;
        for (let i = 0; i < 1_000_000; i++) {
            state = (state + 0x6D2B79F5) >>> 0;
            let t = Math.imul(state ^ state >>> 15, state | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            assert.equal(legacy(), ((t ^ t >>> 14) >>> 0) / 4294967296);
        }
        assert.equal(legacy.count(), 1_000_000);
    }
});

test('six-million-call vectors preserve the JS Number boundary, not conventional u32 state', () => {
    const recorded = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/combat/rng-js-number-v1.json')));
    assert.equal(recorded.rngVersion, RNG_VERSION);
    for (const { seed, values } of recorded.vectors) {
        const legacy = seededRandom(seed);
        let numericState = seed >>> 0;
        let wrappingState = seed >>> 0;
        let firstDifferentCall = null;
        let checkpoint = 0;
        for (let call = 1; call <= values.at(-1).call; call++) {
            const actual = legacy();
            numericState += 0x6D2B79F5;
            const bits = Math.trunc(numericState % 4294967296);
            let t = Math.imul(bits ^ bits >>> 15, bits | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            assert.equal(actual, ((t ^ t >>> 14) >>> 0) / 4294967296, 'explicit Number -> u32 conversion');
            wrappingState = (wrappingState + 0x6D2B79F5) >>> 0;
            let wrapped = Math.imul(wrappingState ^ wrappingState >>> 15, wrappingState | 1);
            wrapped ^= wrapped + Math.imul(wrapped ^ wrapped >>> 7, wrapped | 61);
            if (firstDifferentCall === null && actual !== ((wrapped ^ wrapped >>> 14) >>> 0) / 4294967296) firstDifferentCall = call;
            if (call === values[checkpoint]?.call) {
                assert.equal(actual * 4294967296, values[checkpoint].u32, `seed ${seed} at call ${call}`);
                checkpoint++;
            }
        }
        assert.equal(checkpoint, values.length);
        if (seed === 1) assert.equal(firstDifferentCall, 4_917_760);
        if (seed === 0xFFFFFFFF) assert.equal(firstDifferentCall, 4_917_758);
        assert.equal(legacy.count(), 6_000_000);
    }
});

function localFiles(action) {
    const name = `parity-tools-${crypto.randomBytes(8).toString('hex')}`;
    const files = [];
    fs.mkdirSync(path.join(root, '.bench'), { recursive: true });
    const write = (suffix, content) => {
        const filename = path.join(root, '.bench', name + suffix);
        fs.writeFileSync(filename, content, { flag: 'wx' });
        files.push(filename);
        return filename;
    };
    try { action({ name, write }); }
    finally { for (const file of files) fs.unlinkSync(file); }
}

test('frozen bundle corruption is detected and frozen files cannot be rebuilt', () => {
    localFiles(({ name, write }) => {
        const content = 'module.exports = {}';
        const bundle = write('.cjs', content);
        write('.manifest.json', JSON.stringify({ schemaVersion: 1, name, bundleFile: name + '.cjs', bundleSha256: sha256(content) }));
        assert.equal(loadReference(name).bundleSha256, sha256(content));
        const run = spawnSync(process.execPath, ['bench/run.cjs', '--input', 'tests/fixtures/combat/synthetic-party.json', '--bundle', name], { cwd: root, encoding: 'utf8' });
        assert.notEqual(run.status, 0);
        assert.match(run.stderr, /Cannot overwrite a frozen reference/);
        const freeze = spawnSync(process.execPath, ['bench/freeze.cjs', '--name', name], { cwd: root, encoding: 'utf8' });
        assert.notEqual(freeze.status, 0);
        assert.match(freeze.stderr, /Reference already exists/);
        assert.equal(fs.readFileSync(bundle, 'utf8'), content);
        fs.appendFileSync(bundle, '\nchanged');
        assert.throws(() => loadReference(name), /has changed/);
    });
});

test('bundle names reject paths and source identity includes external combat dependencies', () => {
    for (const name of ['../current', 'x/y', 'x\\y', '', '.']) assert.throws(() => validateName(name));
    const identity = sourceIdentity();
    for (const file of ['src/worker.js', 'src/parsePlayerJson.js', 'src/guildCombatShrines.js']) {
        assert.ok(identity.files.engine.some(record => record.file === file));
    }
    assert.equal(identity.files.data.length, 16);
});

test('public fixtures reproduce the generator and use valid item/ability slots', () => {
    const data = filename => JSON.parse(fs.readFileSync(path.join(root, 'src/combatsimulator/data', filename)));
    const items = data('itemDetailMap.json');
    const abilities = data('abilityDetailMap.json');
    for (const [filename, fixture] of Object.entries(createFixtures())) {
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/combat', filename))), fixture);
        for (const player of Object.values(fixture)) {
            let foodSlots = 1;
            let drinkSlots = 1;
            for (const equipment of player.player.equipment) {
                const definition = items[equipment.itemHrid]?.equipmentDetail;
                assert.ok(definition, equipment.itemHrid);
                assert.equal(definition.type.replace('/equipment_types/', '/item_locations/'), equipment.itemLocationHrid);
                foodSlots += definition.combatStats.foodSlots || 0;
                drinkSlots += definition.combatStats.drinkSlots || 0;
            }
            assert.ok(player.food['/action_types/combat'].length <= foodSlots);
            assert.ok(player.drinks['/action_types/combat'].length <= drinkSlots);
            for (const food of [...player.food['/action_types/combat'], ...player.drinks['/action_types/combat']]) assert.ok(items[food.itemHrid]?.consumableDetail);
            for (const ability of player.abilities) assert.ok(abilities[ability.abilityHrid]);
            assert.equal(player.characterId, undefined);
            assert.equal(player.accountId, undefined);
        }
    }
});

test('the CLI fails on changed results, RNG consumption or event counts without replacing goldens', () => {
    localFiles(({ name, write }) => {
        const suite = fs.mkdtempSync(path.join(root, '.bench', name + '-suite-'));
        const candidate = name + '-candidate';
        const fake = (damage, calls, eventCount) => `exports.run = async () => {
            for (let i = 0; i < ${calls}; i++) Math.random();
            return { elapsedMs: 1, messages: 1, events: { autoAttack: ${eventCount} }, maxQueue: 1,
                result: { damage: ${damage}, wipeEvents: [] } };
        };`;
        const referenceSource = fake(10, 1, 2);
        write('.cjs', referenceSource);
        const candidateFile = write('-candidate.cjs', referenceSource);
        write('.manifest.json', JSON.stringify({ schemaVersion: 1, name, bundleFile: name + '.cjs',
            bundleSha256: sha256(referenceSource), engineSourceSha256: 'synthetic-engine', gameDataSha256: 'synthetic-data' }));
        const suiteFiles = ['team.json', 'scenarios.json', 'js-reference.expected.json'];
        try {
            fs.writeFileSync(path.join(suite, 'team.json'), '{}');
            fs.writeFileSync(path.join(suite, 'scenarios.json'), JSON.stringify([{ name: 'tiny', fixture: 'team.json', options: {} }]));
            const argv = ['bench/parity.cjs', '--reference', name, '--candidate', candidate, '--reuse', '--suite', suite];
            const invoke = extra => spawnSync(process.execPath, [...argv, ...extra], { cwd: root, encoding: 'utf8' });
            const recorded = invoke(['--record-golden']);
            assert.equal(recorded.status, 0, recorded.stderr);
            const goldenBytes = fs.readFileSync(path.join(suite, 'js-reference.expected.json'));
            const unchanged = invoke([]);
            assert.equal(unchanged.status, 0, unchanged.stderr);
            for (const [source, diagnostic] of [
                [fake(11, 1, 2), '"path":"$[\\"damage\\"]"'],
                [fake(10, 2, 2), '"rngMatches":false'],
                [fake(10, 1, 3), '"eventsMatch":false'],
            ]) {
                fs.writeFileSync(candidateFile, source);
                const changed = invoke([]);
                assert.notEqual(changed.status, 0);
                assert.ok(changed.stdout.includes(diagnostic), changed.stdout);
                assert.deepEqual(fs.readFileSync(path.join(suite, 'js-reference.expected.json')), goldenBytes);
            }
            assert.notEqual(invoke(['--record-golden']).status, 0);
        } finally {
            for (const file of suiteFiles) if (fs.existsSync(path.join(suite, file))) fs.unlinkSync(path.join(suite, file));
            fs.rmdirSync(suite);
        }
    });
});
