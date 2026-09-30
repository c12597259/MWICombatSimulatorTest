import Player from '../src/combatsimulator/player.js';
import Monster from '../src/combatsimulator/monster.js';
import Equipment from '../src/combatsimulator/equipment.js';
import Ability from '../src/combatsimulator/ability.js';
import Consumable from '../src/combatsimulator/consumable.js';
import CombatSimulator from '../src/combatsimulator/combatSimulator.js';
import '../src/worker.js';
export { default as parsePlayerJson } from '../src/parsePlayerJson.js';

const levels = ['stamina', 'intelligence', 'attack', 'melee', 'defense', 'ranged', 'magic'];
const shrineKeys = ['force', 'tempo', 'spirit', 'rarity', 'scholar'];
export async function attributeTrace(cases) {
    const output = [];
    for (const item of cases) {
        const input = item.input;
        let unit;
        if (input.kind === 'monster') unit = new Monster(input.hrid, input.difficultyTier || 0, input.roomLevel || 0);
        else {
            const dto = { hrid: input.hrid, houseRooms: Object.fromEntries(input.houseRooms), achievements: input.achievements,
                guildCombatBuffLevels: Object.fromEntries(shrineKeys.map((key, index) => [key, input.shrines[index]])),
                guildCombatBuffs: input.guildBuffs, equipment: Object.fromEntries(input.equipment.map(item => [item.slot, item.hrid ? { hrid: item.hrid, enhancementLevel: item.enhancementLevel } : null])),
                food: input.food.map(item => item ? new Consumable(item.hrid, item.triggers) : null),
                drinks: input.drinks.map(item => item ? new Consumable(item.hrid, item.triggers) : null),
                abilities: input.abilities.map(item => item ? new Ability(item.hrid, item.level, item.triggers) : null),
                debuffOnLevelGap: input.debuffOnLevelGap,
                ...Object.fromEntries(levels.map((key, index) => [`${key}Level`, input.levels[index]])) };
            // Use the frozen real Worker to construct zone/community/seal buffs.
            const original = CombatSimulator.prototype.simulate;
            try {
                CombatSimulator.prototype.simulate = async function() { unit = this.players[0]; return {}; };
                globalThis.postMessage = () => {};
                await globalThis.onmessage({ data: { type: 'start_simulation', players: [dto],
                    zone: item.zoneHrid ? { zoneHrid: item.zoneHrid, difficultyTier: 0 } : null,
                    labyrinth: null, extra: item.extra || {}, simulationTimeLimit: 0 } });
            } finally { CombatSimulator.prototype.simulate = original; }
        }
        unit.updateCombatDetails();
        const snapshot = () => JSON.parse(JSON.stringify({ baseLevels: levels.map(key => unit[`${key}Level`]),
            experience: unit.experience, combatDetails: unit.combatDetails, buffKeys: Object.keys(unit.combatBuffs) }));
        const frames = [snapshot()];
        for (const step of item.steps || []) {
            if (step.op === 'update') unit.updateCombatDetails();
            else if (step.op === 'start') { unit.generatePermanentBuffs(); unit.reset(); }
            else if (step.op === 'clear') unit.clearBuffs();
            else if (step.op === 'add') unit.addBuffs(structuredClone(step.buffs), step.time);
            else if (step.op === 'remove') unit.removeBuffs(step.keys.map(key => ({ uniqueHrid: key })));
            else if (step.op === 'expire') unit.removeExpiredBuffs(step.time);
            else if (step.op === 'reset') unit.reset(step.time);
            else if (step.op === 'equip') { unit.equipment[step.equipment.slot] = step.equipment.hrid ? new Equipment(step.equipment.hrid, step.equipment.enhancementLevel) : null; unit.updateCombatDetails(); }
            else if (step.op === 'levels') { levels.forEach((key, index) => unit[`${key}Level`] = step.levels[index]); unit.updateCombatDetails(); }
            else if (step.op === 'shrines') { unit.guildCombatBuffLevels = Object.fromEntries(shrineKeys.map((key, index) => [key, step.levels[index]])); unit.updateCombatDetails(); }
            else throw new Error('Unknown attribute test step');
            frames.push(snapshot());
        }
        output.push(frames);
    }
    return output;
}
