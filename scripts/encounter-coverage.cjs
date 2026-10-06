const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sha256 } = require('../bench/lib/reference.cjs');

// Check executed branches, so an unused skill or diagnostic setup cannot make
// a parity suite appear to cover a mechanic it never exercised.
function audit(directory, manifest) {
    const events = {}, operations = {}, labels = new Set(), traces = new Map();
    let promotedIdentity = false, dotAfterSourceDeath = false, cases = 0, frames = 0;
    for (const [name, info] of Object.entries(manifest.groups)) {
        const bytes = fs.readFileSync(path.join(directory, name + '.json'));
        assert.equal(sha256(bytes), info.sha256);
        const group = JSON.parse(bytes);
        assert.equal(group.cases.length, info.cases); assert.equal(group.expected.length, info.cases);
        let groupFrames = 0;
        for (let index = 0; index < group.cases.length; index++) {
            const input = group.cases[index].request;
            traces.set(group.cases[index].name, group.expected[index]);
            for (const frame of group.expected[index]) {
                groupFrames++;
                events[frame.event.type] = (events[frame.event.type] || 0) + 1;
                promotedIdentity ||= frame.units.length > input.players.length + input.enemies.length;
                if (frame.event.type === 'damageOverTime') dotAfterSourceDeath ||= frame.units[frame.event.sourceRef].state.attributes.combatDetails.currentHitpoints === 0;
                for (const op of frame.operations) {
                    operations[op[0]] = (operations[op[0]] || 0) + 1;
                    if (['attack', 'hp', 'mp', 'hpSpent'].includes(op[0])) labels.add(`${op[0]}:${op[op[0] === 'attack' ? 3 : 2]}`);
                }
            }
        }
        assert.equal(groupFrames, info.frames); cases += info.cases; frames += groupFrames;
    }
    const required = ['combatStart', 'playerRespawn', 'autoAttack', 'consumableTick', 'damageOverTime', 'checkBuffExpiration',
        'regenTick', 'stunExpiration', 'blindExpiration', 'silenceExpiration', 'curseExpiration', 'weakenExpiration',
        'furyExpiration', 'enrageTick', 'abilityCastEndEvent', 'awaitCooldownEvent', 'cooldownReady'];
    for (const kind of required) assert.ok(events[kind] > 0, `No executed ${kind} events`);
    for (const label of ['attack:parry', 'attack:physicalThorns', 'attack:elementalThorns', 'attack:retaliation', 'attack:blaze', 'hp:bloom', 'mp:ripple', 'hp:/abilities/revive'])
        assert.ok(labels.has(label), `No executed ${label} operation`);
    assert.ok(operations.hpSpent > 0 && operations.death > 0 && operations.oom > 0, 'Missing HP spending, death or OOM branch');
    assert.ok(promotedIdentity, 'No promoted object identity');
    assert.ok(dotAfterSourceDeath, 'No DOT event after its source died');
    const trace = name => {
        const frames = traces.get(name);
        assert.ok(frames?.length > 0, `Missing executed trigger regression: ${name}`);
        return frames;
    };
    const casts = frames => frames.filter(frame => frame.event.type === 'abilityCastEndEvent' && frame.event.source === 0);
    const wipe = trace('normal-wipe-preserves-separate-attack-cast-removal');
    const wipeIndex = wipe.findIndex(frame => frame.allPlayersDead);
    assert.ok(wipeIndex > 0, 'The removal-order regression must reach a normal-map wipe');
    for (const kind of ['autoAttack', 'abilityCastEndEvent']) {
        assert.ok(wipe[wipeIndex - 1].heap.some(event => event.type === kind), `No pending ${kind} before wipe`);
        assert.ok(!wipe[wipeIndex].heap.some(event => event.type === kind), `${kind} survived wipe`);
    }
    const oom = trace('trigger-read-sparse-priority-oom-skips-affordable-skill');
    assert.ok(oom.flatMap(frame => frame.operations).some(op => op[0] === 'oom' && op[1] === 0 && op[2] === true));
    assert.equal(casts(oom).length, 0, 'Priority OOM must skip the later affordable skill');
    const later = casts(trace('trigger-read-sparse-false-condition-allows-later-skill'));
    assert.ok(later.length > 0 && later.every(frame => frame.event.ability === '/abilities/quick_shot'));
    const chain = trace('trigger-read-consumables-observe-prior-recovery-and-buff');
    assert.deepEqual(chain[0].operations.filter(op => op[0] === 'consume').map(op => op[2]), [
        '/items/apple_gummy', '/items/orange_gummy', '/items/intelligence_coffee', '/items/channeling_coffee'
    ], 'Later consumables must observe recovery and buffs from earlier slots');
    assert.equal(chain[0].units[0].state.attributes.combatDetails.currentManapoints, 150);
    assert.ok(casts(trace('trigger-read-live-dead-lowest-and-sum-on-both-sides')).some(frame => frame.event.ability === '/abilities/fireball'));
    return { cases, frames, eventKinds: required.length, events, promotedIdentity, dotAfterSourceDeath };
}
module.exports = { audit };
