import { createAttributeUnit } from './attributesReference.js';
import CombatSimulator from '../src/combatsimulator/combatSimulator.js';
import CombatStartEvent from '../src/combatsimulator/events/combatStartEvent.js';
import CombatUtilities from '../src/combatsimulator/combatUtilities.js';
import seeded from './lib/seededRandom.cjs';

const levels = ['stamina', 'intelligence', 'attack', 'melee', 'defense', 'ranged', 'magic'];
function unitSnapshot(unit) {
    return { hrid: unit.hrid, isPlayer: unit.isPlayer, attributes: { baseLevels: levels.map(key => unit[`${key}Level`]),
        experience: unit.experience, combatDetails: unit.combatDetails, buffKeys: Object.keys(unit.combatBuffs) },
        buffs: Object.entries(unit.combatBuffs).map(([key, buff]) => ({ key, uniqueHrid: buff.uniqueHrid, typeHrid: buff.typeHrid,
            ratioBoost: buff.ratioBoost, flatBoost: buff.flatBoost, duration: buff.duration, startTime: buff.startTime ?? null })),
        isStunned: unit.isStunned, stunExpireTime: unit.stunExpireTime, isBlinded: unit.isBlinded, blindExpireTime: unit.blindExpireTime,
        isSilenced: unit.isSilenced, silenceExpireTime: unit.silenceExpireTime, isOutOfMana: unit.isOutOfMana,
        isWeakened: !!unit.isWeakened, weakenPercentage: unit.weakenPercentage ?? 0, weakenExpireTime: unit.weakenExpireTime ?? null,
        experienceRate: unit.experienceRate, abilities: unit.abilities.map(value => value ? { hrid: value.hrid, level: value.level, lastUsed: value.lastUsed } : null),
        food: unit.food.map(value => value ? { hrid: value.hrid, lastUsed: value.lastUsed } : null),
        drinks: unit.drinks.map(value => value ? { hrid: value.hrid, lastUsed: value.lastUsed } : null), abilityManaCosts: [...unit.abilityManaCosts] };
}
export async function encounterTrace(cases) {
    const output = [], originalRandom = Math.random, originalLog = console.log;
    try {
        console.log = () => {};
        for (const item of cases) {
            const random = seeded.seededRandom(item.seed); Math.random = random;
            const players = [], enemies = [];
            for (const value of item.players) players.push(await createAttributeUnit(value));
            for (const value of item.enemies) enemies.push(await createAttributeUnit(value));
            const units = [...players, ...enemies], ids = new Map(units.map((unit, index) => [unit, index]));
            const id = unit => { if (!unit) return null; if (!ids.has(unit)) { ids.set(unit, units.length); units.push(unit); } return ids.get(unit); };
            const simulator = new CombatSimulator(players, { isDungeon: false, getRandomEncounter: () => enemies }, null);
            simulator.simulationTime = 0;
            let operations = [];
            simulator.simResult.addAttack = (s, t, a, value) => operations.push(['attack', id(s), id(t), a, value]);
            simulator.simResult.addHitpointsGained = (unit, a, value) => operations.push(['hp', id(unit), a, value]);
            simulator.simResult.addManapointsGained = (unit, a, value) => operations.push(['mp', id(unit), a, value]);
            simulator.simResult.addConsumableUse = (unit, a) => operations.push(['consume', id(unit), a.hrid]);
            simulator.simResult.addDeath = unit => operations.push(['death', id(unit)]);
            simulator.simResult.addHitpointsSpent = (unit, a, value) => operations.push(['hpSpent', id(unit), a, value]);
            simulator.simResult.addRanOutOfManaCount = (unit, value, time) => operations.push(['oom', id(unit), value, time]);
            simulator.simResult.addExperienceGain = (unit, value) => operations.push(['experience', id(unit), value]);
            simulator.simResult.addEncounterEnd = () => operations.push(['encounter']);
            simulator.simResult.updateTimeSpentAlive = () => {};
            const add = simulator.eventQueue.addEvent.bind(simulator.eventQueue); let eventId = 0;
            simulator.eventQueue.addEvent = event => { event.__id = ++eventId; id(event.source); id(event.target); id(event.sourceRef); add(event); };
            const snapshotEvent = event => ({ id: event.__id, type: event.type, time: event.time, source: id(event.source), target: id(event.target), sourceRef: id(event.sourceRef),
                ability: event.ability?.hrid ?? null, consumable: event.consumable?.hrid ?? null, hrid: event.hrid ?? null,
                amount: event.damage ?? event.curseAmount ?? event.weakenAmount ?? event.furyAmount ?? null,
                totalTicks: event.totalTicks ?? null, currentTick: event.currentTick ?? null, encounterTime: event.encounterTime ?? null, combatStyleHrid: event.combatStyleHrid ?? null });
            const check = simulator.checkTriggers.bind(simulator); let first = true;
            simulator.checkTriggers = () => {
                if (first) {
                    first = false;
                    for (const setup of item.setup || []) {
                        const unit = units[setup.unit];
                        for (const buff of setup.buffs || []) unit.addBuff(structuredClone(buff), simulator.simulationTime);
                        for (const [key, value] of Object.entries(setup.combatDetails || {})) {
                            if (key === 'combatStats') Object.assign(unit.combatDetails.combatStats, value); else unit.combatDetails[key] = value;
                        }
                        Object.assign(unit, setup.flags || {});
                        for (const [index, time] of setup.lastUsed || []) unit.abilities[index].lastUsed = time;
                    }
                    for (const spec of item.scheduled || []) {
                        const event = { type: spec.kind, time: spec.time };
                        if (spec.unit != null) { if (spec.kind === 'playerRespawn') event.hrid = units[spec.unit].hrid; else event.source = units[spec.unit]; }
                        simulator.eventQueue.addEvent(event);
                    }
                }
                return check();
            };
            simulator.eventQueue.addEvent(new CombatStartEvent(0));
            const frames = [];
            while (frames.length < item.maxEvents && simulator.simulationTime < item.timeLimit) {
                const event = simulator.eventQueue.getNextEvent(); if (!event) break;
                simulator.processEvent(event);
                frames.push(JSON.parse(JSON.stringify({ event: snapshotEvent(event), time: simulator.simulationTime, randomCalls: random.count(),
                    units: units.map(unit => ({ id: id(unit), state: unitSnapshot(unit) })), players: players.map(id), enemies: simulator.enemies ? simulator.enemies.map(id) : null,
                    heap: simulator.eventQueue.minHeap.heapArray.map(snapshotEvent), operations, allPlayersDead: simulator.allPlayersDead, maxEnrageStack: simulator.simResult.maxEnrageStack })));
                operations = [];
                if (!simulator.enemies || simulator.allPlayersDead) break;
            }
            output.push(frames);
        }
    } finally { Math.random = originalRandom; console.log = originalLog; }
    return output;
}
export function mathTrace(cases) {
    const original = Math.random;
    try { return cases.map(item => {
        if (item.op === 'pow') return item.values.map(value => Math.pow(value, 1.4));
        if (item.op === 'tick') return Array.from({ length: Math.floor(item.ticks) }, (_, index) => CombatUtilities.calculateTickValue(item.total, item.ticks, index + 1));
        const random = seeded.seededRandom(item.seed); Math.random = random;
        return Array.from({ length: item.draws }, () => ({ value: CombatUtilities.randomInt(item.min, item.max), calls: random.count() }));
    }); } finally { Math.random = original; }
}
