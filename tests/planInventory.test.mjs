import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const code = await readFile(new URL('../src/planInventory.js', import.meta.url), 'utf8');
const { normalizePlanInventory, calculateConsumableShortfall } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const inventory = { schemaVersion: 1, complete: true, characterId: 'a', capturedAt: '2026-09-26T00:00:00Z', items: { '/items/food': 350 } };
test('inventory must be complete, dated and match the character; missing data is not zero', () => {
    assert.deepEqual(normalizePlanInventory(inventory, 'a'), inventory);
    for (const value of [{...inventory,complete:false},{...inventory,capturedAt:''},{...inventory,items:[]},{...inventory,items:{'/items/food':-1}}])
        assert.equal(normalizePlanInventory(value,'a'),null);
    assert.equal(normalizePlanInventory(inventory,'b'),null);
    assert.equal(calculateConsumableShortfall({'/items/food':1200},null)[0].missing,null);
});
test('combined plan demand deducts each character inventory once and rounds exports upward', () => {
    assert.deepEqual(calculateConsumableShortfall({'/items/food':600+600.2},inventory),
        [{itemHrid:'/items/food',required:1201,available:350,missing:851}]);
    assert.equal(calculateConsumableShortfall({'/items/food':100},inventory)[0].missing,0);
    assert.equal(calculateConsumableShortfall({'/items/other':10},inventory)[0].missing,10);
    const copy=normalizePlanInventory(inventory,'a');copy.items['/items/food']=0;
    assert.equal(inventory.items['/items/food'],350);
});
