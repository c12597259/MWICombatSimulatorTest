import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = name => readFile(new URL('../src/' + name, import.meta.url), 'utf8');
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const { buildICTimeExport } = await import(dataUrl((await source('ictimeExport.js'))
    .replace('./fragmentTimeCost.js', dataUrl(await source('fragmentTimeCost.js')))));
const items = JSON.parse(await source('combatsimulator/data/itemDetailMap.json'));
const blue = '/items/blue_key_fragment', green = '/items/green_key_fragment';
const food = '/items/gummy', drink = '/items/super_magic_coffee';
const player = (name, drops, consumption = {}) => ({ name, expectedDropsPerHour: drops, consumablesPerHour: consumption });
const run = (players, extra = {}) => ({ mapType: 'zone', simulationHours: 24, difficulty: 0, createdAt: '2026-10-14', players, ...extra });

test('best per-fragment yield keeps winning consumables and isolates characters across slots', () => {
    const records = [
        run([player('Alice', { [blue]: 20, [green]: 5 }, { [food]: 2 })]),
        run([player('Bob', { [blue]: 900 }), player('Alice', { [blue]: 25, [green]: 3 }, { [drink]: 12 })]),
        run([player('Alice', { [blue]: 23 }, { [food]: 1 })]),
    ];
    const { data } = buildICTimeExport(records, 'Alice', items, 'fixed-date');
    assert.equal(data.version, 1);
    assert.equal(data.type, 'ICTime_TimeCalculatorEntries');
    assert.equal(data.exportedAt, 'fixed-date');
    assert.equal(data.entries.length, 2);
    const entry = data.entries.find(entry => entry.itemHrid === blue);
    assert.equal(entry.quantityPer24h, 600);
    assert.deepEqual(entry.drinks, [{ itemHrid: drink, perHour: 12 }]);
    assert.deepEqual(entry.foods, []);
    assert.deepEqual(data.entries.find(entry => entry.itemHrid === green).foods, [{ itemHrid: food, perHour: 2 }]);
    assert.equal(buildICTimeExport(records.slice(0, 1), 'Alice', items).data.entries[0].quantityPer24h, 480);
    assert.equal(buildICTimeExport(records, 'Bob', items).data.entries[0].quantityPer24h, 21600);
    assert.deepEqual(buildICTimeExport(records, 'Nobody', items).data.entries, []);
});

test('invalid/unsupported drops and labyrinth results cannot win; equal yields prefer latest record', () => {
    const records = [
        run([player('A', { [blue]: 9 }, { [food]: 1 })], { createdAt: '2026-10-12' }),
        run([player('A', { [blue]: 9 }, { [drink]: 4 })]),
        run([player('A', { [blue]: 99 })], { mapType: 'labyrinth' }),
        run([player('A', { [blue]: 99 })], { simulationHours: 0 }),
        run([player('A', { [blue]: Infinity, [green]: -1, '/items/coin': 100 })]),
    ];
    const result = buildICTimeExport(records, 'A', items).data;
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].quantityPer24h, 216);
    assert.deepEqual(result.entries[0].drinks, [{ itemHrid: drink, perHour: 4 }]);
    assert.deepEqual(result.entries[0].foods, []);
});

test('dungeon exports preserve tier, party count and completion minutes; refined drops need separate T0 entry', () => {
    const base = '/items/chimerical_chest', refined = '/items/chimerical_refinement_chest';
    const records = [
        run([player('A', { [base]: 3 })], { mapType: 'dungeon', averageMinutes: 20 }),
        run([player('A', { [base]: 8, [refined]: 2 }, { [drink]: 10 }), player('B', {})],
            { mapType: 'dungeon', difficulty: 2, averageMinutes: 15 }),
    ];
    const { data, missingBaseChests } = buildICTimeExport(records, 'A', items);
    assert.equal(data.entries.length, 2);
    assert.equal(data.entries[0].runMinutes, 20);
    assert.equal(data.entries[0].dungeonTier, 0);
    assert.equal(data.entries[1].dungeonTier, 2);
    assert.equal(data.entries[1].partyCount, 2);
    assert.equal(data.entries[1].runMinutes, 15);
    assert.deepEqual(missingBaseChests, []);
    assert.deepEqual(buildICTimeExport(records.slice(1), 'A', items).missingBaseChests, [base]);
});
