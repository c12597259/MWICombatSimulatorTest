import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const webpack = require('webpack');
const { Heap } = require('heap-js');
const root = fileURLToPath(new URL('../', import.meta.url));
await new Promise((resolve, reject) => {
    const compiler = webpack({ mode: 'development', target: 'node', devtool: false,
        context: root, entry: './bench/testExports.js',
        output: { path: root + '.bench', filename: 'tests.cjs', library: { type: 'commonjs2' } } });
    compiler.run((error, stats) => compiler.close(() => error || stats.hasErrors()
        ? reject(error || new Error(stats.toString({ all: false, errors: true }))) : resolve()));
});
const { Player, Equipment, EventQueue, CombatSimulator, Zone, parsePlayerJson } = require(root + '.bench/tests.cjs');
globalThis.CustomEvent ??= class CustomEvent extends Event {
    constructor(type, options) { super(type); this.detail = options.detail; }
};

test('cached equipment matches fresh calculation after edits and buff changes', () => {
    const p = new Player();
    p.equipment['/equipment_types/head'] = new Equipment('/items/corsair_helmet', 7);
    p.equipment['/equipment_types/body'] = new Equipment('/items/anchorbound_plate_body', 7);
    const check = () => {
        p.updateCombatDetails();
        const reference = new Player();
        reference.equipment = { ...p.equipment };
        reference.combatBuffs = structuredClone(p.combatBuffs);
        reference.guildCombatBuffLevels = { ...p.guildCombatBuffLevels };
        reference.staminaLevel = p.staminaLevel;
        reference.updateCombatDetails();
        assert.deepEqual(p.combatDetails, reference.combatDetails);
    };
    check(); check();
    p.combatBuffs.test = { typeHrid: '/buff_types/damage', ratioBoost: 0.12, flatBoost: 0 };
    check();
    p.equipment['/equipment_types/head'].enhancementLevel = 12;
    check();
    p.equipment['/equipment_types/head'] = null;
    check();
    p.equipment['/equipment_types/body'] = new Equipment('/items/anchorbound_plate_body', 8);
    p.guildCombatBuffLevels.spirit = 7;
    p.staminaLevel = 150;
    check();
    delete p.combatBuffs.test;
    check();
    assert.deepEqual(p.getBuffBoosts('/buff_types/damage'), []);
});

test('buff index preserves addition order and is not stale outside recalculation', () => {
    const p = new Player();
    p.guildCombatBuffLevels.force = 5;
    p.combatBuffs = {
        a: { typeHrid: '/buff_types/damage', ratioBoost: 0.2, flatBoost: 1 },
        b: { typeHrid: '/buff_types/damage', ratioBoost: 0.1, flatBoost: 2 },
    };
    p.updateCombatDetails();
    assert.deepEqual(p.getBuffBoosts('/buff_types/damage'), [
        { ratioBoost: 0.2, flatBoost: 1 }, { ratioBoost: 0.1, flatBoost: 2 },
        { ratioBoost: 0.015, flatBoost: 0 },
    ]);
    delete p.combatBuffs.a;
    p.guildCombatBuffLevels.force = 0;
    assert.deepEqual(p.getBuffBoost('/buff_types/damage'), { ratioBoost: 0.1, flatBoost: 2 });
});

test('event queue preserves legacy equal-time order through random cancellations', () => {
    const q = new EventQueue();
    const heap = new Heap((a, b) => a.time - b.time);
    const units = [{}, {}, {}];
    let seed = 33;
    const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
    const actions = new Set();
    for (let i = 0; i < 5000; i++) {
        const type = 'type' + random(4);
        const source = units[random(3)];
        const action = random(8);
        actions.add(action);
        if (action < 4) {
            const event = { id: i, time: random(12), type, source, target: units[random(3)], hrid: 'unit' + random(3) };
            q.addEvent(event); heap.push(event);
        } else if (action === 4) {
            assert.equal(q.getNextEvent(), heap.pop());
        } else if (action === 5) {
            q.clearEventsForUnit(source);
            for (const e of heap.toArray()) if (e.source === source || e.target === source) heap.remove(e);
        } else if (action === 6) {
            q.clearEventsOfType(type);
            for (const e of heap.toArray()) if (e.type === type) heap.remove(e);
        } else {
            const fn = e => e.type === type && e.source === source;
            assert.equal(q.getMatching(fn), heap.toArray().find(fn) || null);
            assert.equal(q.containsEventOfType(type), heap.toArray().some(e => e.type === type));
            assert.equal(q.containsEventOfTypeAndHrid(type, 'unit1'), heap.toArray().some(e => e.type === type && e.hrid === 'unit1'));
        }
        assert.deepEqual(q.minHeap.toArray(), heap.toArray());
    }
    assert.equal(actions.size, 8);
});

test('progress completes and time series sampling survives throttling', async () => {
    const p = new Player();
    p.hrid = 'player1';
    const sim = new CombatSimulator([p], new Zone('/actions/combat/pirate_cove', 2), null, { enableHpMpVisualization: true });
    const progress = [];
    sim.addEventListener('progress', e => progress.push(e.detail.progress));
    const result = await sim.simulate(3600e9);
    assert.equal(progress.at(-1), 1);
    assert.ok(result.timeSeriesData.timestamps.length > 0);
    assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]));
    assert.ok(result.dungeonsFailed > 0);
    assert.ok(result.wipeEvents.length > 0);
});

test('shared loadout parser accepts missing achievement data', () => {
    const p = parsePlayerJson({ player: { staminaLevel: 1, intelligenceLevel: 1, attackLevel: 1,
        defenseLevel: 1, meleeLevel: 1, rangedLevel: 1, magicLevel: 1, equipment: [] },
        houseRooms: {}, triggerMap: {}, food: { '/action_types/combat': [] },
        drinks: { '/action_types/combat': [] }, abilities: [] }, 'player1');
    assert.equal(p.hrid, 'player1');
    assert.deepEqual(p.achievements, {});
});
