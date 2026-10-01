import { createAttributeUnit } from './attributesReference.js';
import { unitSnapshot } from './encountersReference.js';
import CombatSimulator from '../src/combatsimulator/combatSimulator.js';
import Zone from '../src/combatsimulator/zone.js';
import Labyrinth from '../src/combatsimulator/labyrinth.js';
import CombatStartEvent from '../src/combatsimulator/events/combatStartEvent.js';
import seeded from './lib/seededRandom.cjs';

function serial(value) { return JSON.parse(JSON.stringify(value)); }
function stripClocks(result) { for (const wipe of result.wipeEvents) delete wipe.timestamp; return result; }
export async function simulationReference(input, maxEvents = 0, startEvent = 0) {
    const originalRandom = Math.random, originalLog = console.log;
    const random = seeded.seededRandom(input.seed); Math.random = random; console.log = () => {};
    try {
        const zone = input.zone ? new Zone(input.zone.hrid, input.zone.difficultyTier) : null;
        const lab = input.labyrinth ? new Labyrinth(input.labyrinth.hrid, input.labyrinth.roomLevel, input.labyrinth.crates) : null;
        const players = [];
        for (const item of input.players) {
            const player = await createAttributeUnit({ ...item, zoneHrid: zone?.hrid || null });
            if (lab) player.zoneBuffs = lab.buffs;
            players.push(player);
        }
        const simulator = new CombatSimulator(players, zone, lab, { enableHpMpVisualization: input.visualization });
        const units = [...players], ids = new Map(units.map((unit, index) => [unit, index]));
        const id = unit => { if (!unit) return null; if (!ids.has(unit)) { ids.set(unit, units.length); units.push(unit); } return ids.get(unit); };
        for (const [object, method] of [[zone, 'getRandomEncounter'], [zone, 'getNextWave'], [lab, 'getMonster']]) if (object) {
            const original = object[method].bind(object); object[method] = () => { const values = original(); values.forEach(id); return values; };
        }
        const add = simulator.eventQueue.addEvent.bind(simulator.eventQueue); let eventId = 0;
        simulator.eventQueue.addEvent = event => { event.__id = ++eventId; id(event.source); id(event.target); id(event.sourceRef); add(event); };
        const eventSnapshot = event => ({ id: event.__id, type: event.type, time: event.time, source: id(event.source), target: id(event.target), sourceRef: id(event.sourceRef),
            ability: event.ability?.hrid ?? null, consumable: event.consumable?.hrid ?? null, hrid: event.hrid ?? null,
            amount: event.damage ?? event.curseAmount ?? event.weakenAmount ?? event.furyAmount ?? null, totalTicks: event.totalTicks ?? null,
            currentTick: event.currentTick ?? null, encounterTime: event.encounterTime ?? null, combatStyleHrid: event.combatStyleHrid ?? null });
        const events = {}, frames = []; let processed = 0, operations = [];
        const reset = simulator.reset.bind(simulator);
        simulator.reset = () => {
            reset();
            if (maxEvents) for (const [method, op] of Object.entries({ addAttack: 'attack', addHitpointsGained: 'hp', addManapointsGained: 'mp', addConsumableUse: 'consume',
                addDeath: 'death', addHitpointsSpent: 'hpSpent', addRanOutOfManaCount: 'oom', addExperienceGain: 'experience', addEncounterEnd: 'encounter' })) {
                const original = simulator.simResult[method].bind(simulator.simResult);
                simulator.simResult[method] = (...args) => {
                    const values = args.map((arg, index) => typeof arg === 'object' ? (op === 'consume' && index === 1 ? arg.hrid : id(arg)) : arg);
                    if (processed > startEvent) operations.push([op, ...values]); return original(...args);
                };
            }
        };
        const process = simulator.processEvent.bind(simulator);
        simulator.processEvent = event => {
            events[event.type] = (events[event.type] || 0) + 1; processed++;
            process(event);
        };
        if (!maxEvents) {
            const result = stripClocks(serial(await simulator.simulate(input.timeLimit)));
            return { result, randomCalls: random.count(), events, processed };
        }
        simulator.reset(); simulator.eventQueue.addEvent(new CombatStartEvent(0));
        while (processed < startEvent + maxEvents && simulator.simulationTime < input.timeLimit) {
            const event = simulator.eventQueue.getNextEvent(); simulator.processEvent(event);
            if (input.visualization && processed % 1000 === 0) simulator.simResult.addTimeSeriesSnapshot(simulator.simulationTime, players);
            if (processed > startEvent) frames.push(serial({ event: eventSnapshot(event), time: simulator.simulationTime, randomCalls: random.count(),
                units: units.map(unit => ({ id: id(unit), state: unitSnapshot(unit) })), players: players.map(id), enemies: simulator.enemies?.map(id) ?? null,
                heap: simulator.eventQueue.minHeap.heapArray.map(eventSnapshot), operations, allPlayersDead: simulator.allPlayersDead,
                maxEnrageStack: simulator.simResult.maxEnrageStack, result: stripClocks(serial(simulator.simResult)),
                zone: zone ? { encountersKilled: zone.encountersKilled, dungeonsCompleted: zone.dungeonsCompleted, dungeonsFailed: zone.dungeonsFailed } : null, attempts: lab?.attemptCount || 0 }));
            operations = [];
        }
        return frames;
    } finally { Math.random = originalRandom; console.log = originalLog; }
}
