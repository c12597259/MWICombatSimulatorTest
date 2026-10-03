import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/simulationRecordExport.js', import.meta.url), 'utf8');
const { createSimulationRecordCapture, createSimulationHistoryArchive, getSimulationArchiveFilename } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const request = () => ({
    type: 'start_simulation', workerId: 'transient',
    players: ['player1', 'player3', 'player5'].map(hrid => ({ hrid, attackLevel: 100, equipment: { main: { hrid: '/items/test', enhancementLevel: 12 } }, guildCombatBuffLevels: { attack: 3 }, abilities: [{ triggers: [{ value: 25 }] }] })),
    zone: { zoneHrid: '/actions/combat/aqua_planet', difficultyTier: 1 }, labyrinth: null,
    simulationTimeLimit: 24 * 3600e9, extra: { comExp: 10, personalBuffs: ['/items/seal_of_damage'], enableHpMpVisualization: false },
});
test('exports the actual three-player input even after editing the current team/map', () => {
    let clock = 100;
    const capture = createSimulationRecordCapture({ engine: 'javascript-worker', build: { sourceSha256: 'test' } }, () => clock);
    const input = request(), original = structuredClone(input);
    assert.equal(capture.getRecord(), null);
    capture.start(input);
    input.players[1].equipment.main.enhancementLevel = 99;
    input.players[1].abilities[0].triggers[0].value = 999;
    input.players.reverse(); input.zone.difficultyTier = 3; input.extra.personalBuffs.length = 0;
    clock = 450;
    const result = { deaths: { player3: 2 }, wipeEvents: [{ logs: [{ damage: 42 }] }], encounters: 120 };
    assert.equal(capture.finish(result), true);
    const exported = JSON.parse(JSON.stringify(capture.getRecord()));
    delete original.workerId;
    assert.deepEqual(exported.request, original);
    assert.deepEqual(exported.result, result);
    assert.equal(exported.timing.elapsedMs, 350);
    assert.equal(exported.randomness.exactReplay, false);
    assert.equal(exported.randomness.seed, null);
});
test('cancelled, failed and superseded captures cannot expose a previous result', () => {
    const capture = createSimulationRecordCapture({}, () => 100);
    assert.equal(capture.finish({}), false);
    capture.start(request()); capture.finish({ encounters: 1 });
    capture.start(request()); assert.equal(capture.getRecord(), null);
    capture.clear(); assert.equal(capture.finish({ encounters: 2 }), false);
    assert.equal(capture.getRecord(), null);
    capture.start(request()); capture.finish({ encounters: 3 }); capture.clear();
    assert.equal(capture.getRecord(), null);
});
test('labyrinth supplies and a fresh completed result survive JSON export', () => {
    const capture = createSimulationRecordCapture({}, () => 0), input = request();
    input.zone = null; input.labyrinth = { labyrinthHrid: '/monsters/cyclops', roomLevel: 150, crates: ['/items/basic_food_crate'] };
    capture.start(input); input.labyrinth.crates.push('/items/other'); capture.finish({ encounters: 4 });
    const exported = JSON.parse(JSON.stringify(capture.getRecord()));
    assert.deepEqual(exported.request.labyrinth.crates, ['/items/basic_food_crate']);
    assert.equal(exported.request.zone, null);
});
test('all maps and repeated runs export together, with old and unreadable snapshots identified', async () => {
    const records = [
        { id: 'a', mapKey: 'zone:a', teamSnapshot: { data: { playerDataMap: { 1: 'old player' } } } },
        { id: 'b', mapKey: 'zone:b', teamSnapshot: { data: { simulationRecord: { request: request(), timing: { elapsedMs: 42 } } } } },
        { id: 'c', mapKey: 'zone:a', teamSnapshot: { broken: true } },
    ];
    const before = structuredClone(records), latestRun = { request: request(), result: { encounters: 99 } };
    const archive = await createSimulationHistoryArchive(records, async snapshot => {
        if (snapshot.broken) throw new Error('Unreadable snapshot');
        return snapshot.data;
    }, { latestRun });
    assert.equal(archive.recordCount, 3); assert.equal(archive.mapCount, 2);
    assert.deepEqual(archive.records.map(record => record.id), ['a', 'b', 'c']);
    assert.deepEqual(archive.records.map(record => record.replayAvailability), ['team-snapshot-only', 'worker-request', 'unavailable']);
    assert.match(archive.records[2].snapshotError, /Unreadable snapshot/);
    assert.deepEqual(archive.latestRun.result, latestRun.result);
    assert.deepEqual(records, before);
    assert.match(getSimulationArchiveFilename(archive), /^mwi-simulations-all-maps-.*\.json$/);
    assert.doesNotThrow(() => JSON.stringify(archive));
});

test('captures every target and result from a parallel batch with explicit batch timing', () => {
    let time = 0;
    const capture = createSimulationRecordCapture({}, () => time);
    const input = request();
    input.type = 'start_simulation_all_zones';
    input.zones = [input.zone, { zoneHrid: '/actions/combat/jungle_planet', difficultyTier: 2 }];
    delete input.zone;
    capture.start(input);
    input.zones.pop();
    time = 321;
    capture.finish([{ zoneHrid: '/actions/combat/aqua_planet' }, { zoneHrid: '/actions/combat/jungle_planet' }]);
    const record = JSON.parse(JSON.stringify(capture.getRecord()));
    assert.equal(record.request.type, 'start_simulation_all_zones');
    assert.equal(record.request.zones.length, 2);
    assert.equal(record.result.length, 2);
    assert.equal(record.timing.elapsedMs, 321);
    assert.equal(record.timing.scope, 'entire-parallel-batch-before-result-rendering');
});
