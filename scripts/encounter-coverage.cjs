const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sha256 } = require('../bench/lib/reference.cjs');

// Check executed branches, so an unused skill or diagnostic setup cannot make
// a parity suite appear to cover a mechanic it never exercised.
function audit(directory, manifest) {
    const events = {}, operations = {}, labels = new Set();
    let promotedIdentity = false, dotAfterSourceDeath = false, cases = 0, frames = 0;
    for (const [name, info] of Object.entries(manifest.groups)) {
        const bytes = fs.readFileSync(path.join(directory, name + '.json'));
        assert.equal(sha256(bytes), info.sha256);
        const group = JSON.parse(bytes);
        assert.equal(group.cases.length, info.cases); assert.equal(group.expected.length, info.cases);
        let groupFrames = 0;
        for (let index = 0; index < group.cases.length; index++) {
            const input = group.cases[index].request;
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
    return { cases, frames, eventKinds: required.length, events, promotedIdentity, dotAfterSourceDeath };
}
module.exports = { audit };
