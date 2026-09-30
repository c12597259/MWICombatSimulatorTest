import { resolveGuildCombatShrineLevels, isKnownGuildCombatShrineBuffType } from './guildCombatShrines.js';
import itemDefinitions from './combatsimulator/data/itemDetailMap.json';
import abilityDefinitions from './combatsimulator/data/abilityDetailMap.json';

export const COMBAT_INPUT_VERSION = 1;
const levels = ['stamina', 'intelligence', 'attack', 'melee', 'defense', 'ranged', 'magic'];
const slots = ['head', 'body', 'legs', 'feet', 'hands', 'main_hand', 'two_hand', 'off_hand', 'pouch', 'back', 'neck', 'earrings', 'ring', 'charm'];
const shrineKeys = ['force', 'tempo', 'spirit', 'rarity', 'scholar'];
const finite = (value, field) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Invalid combat input: ${field}`);
    return number;
};
const numericBoost = value => Number.isFinite(Number(value)) ? Number(value) : 0;

// Normalization only. All equipment formulas and attribute/buff calculations live in Rust.
export function normalizeCharacterInput(raw, hrid = 'player1') {
    const isExport = raw.player && typeof raw.player === 'object';
    const player = isExport ? raw.player : raw;
    const guildBuffs = Array.isArray(raw.guildCombatBuffs) ? raw.guildCombatBuffs : [];
    const shrines = resolveGuildCombatShrineLevels(raw.guildCombatBuffLevels ?? raw.guildShrineLevels, guildBuffs);
    const equipment = [];
    for (const slot of slots) {
        const item = Array.isArray(player.equipment)
            ? player.equipment.find(item => item.itemLocationHrid === `/item_locations/${slot}`)
            : player.equipment?.[`/equipment_types/${slot}`];
        if (!item) continue;
        equipment.push({ slot: `/equipment_types/${slot}`, hrid: String(item.itemHrid ?? item.hrid),
            enhancementLevel: finite(item.enhancementLevel, 'enhancementLevel') });
    }
    const selection = (values, type) => (values || []).map(item => {
        if (!item || (item.itemHrid ?? item.abilityHrid ?? item.hrid) === '') return null;
        const hrid = String(item.itemHrid ?? item.abilityHrid ?? item.hrid);
        const defaults = type === 'ability' ? abilityDefinitions[hrid]?.defaultCombatTriggers : itemDefinitions[hrid]?.consumableDetail?.defaultCombatTriggers;
        const triggers = raw.triggerMap?.[hrid] ?? item.triggers ?? defaults ?? [];
        if (!Array.isArray(triggers)) throw new Error('Invalid combat input: triggers');
        const result = { hrid, triggers: triggers.map(trigger => ({ dependencyHrid: String(trigger.dependencyHrid),
            conditionHrid: String(trigger.conditionHrid), comparatorHrid: String(trigger.comparatorHrid), value: finite(trigger.value === undefined ? 0 : trigger.value, 'trigger value') })) };
        if (type === 'ability') {
            result.level = finite(item.level, 'ability level');
            if (result.level <= 0) return null;
        }
        return result;
    }).filter(item => isExport ? item !== null : true);
    const houseRooms = Array.isArray(raw.houseRooms)
        ? raw.houseRooms.map(room => [room.hrid, finite(room.level, 'house room level')])
        : Object.entries(raw.houseRooms ?? {}).map(([hrid, level]) => [hrid, finite(level, 'house room level')]);
    const achievementValues = raw.achievements?.achievements ?? raw.achievements ?? {};
    return { inputVersion: COMBAT_INPUT_VERSION, kind: 'player', hrid, levels: levels.map(level => finite(player[`${level}Level`], `${level}Level`)), equipment,
        houseRooms: houseRooms.filter(([, level]) => level > 0), achievements: Object.fromEntries(Object.entries(achievementValues).map(([key, value]) => [key, Boolean(value) && value != false])),
        shrines: shrineKeys.map(key => shrines[key]), guildBuffs: guildBuffs
            .filter(buff => typeof buff?.typeHrid === 'string' && buff.typeHrid.startsWith('/buff_types/') && !isKnownGuildCombatShrineBuffType(buff.typeHrid))
            .map((buff, index) => ({ uniqueHrid: String(buff.uniqueHrid || `guild:${index}`), typeHrid: buff.typeHrid,
                ratioBoost: numericBoost(buff.ratioBoost), flatBoost: numericBoost(buff.flatBoost), duration: 0 })),
        food: selection(isExport ? raw.food?.['/action_types/combat'] : raw.food, 'food'),
        drinks: selection(isExport ? raw.drinks?.['/action_types/combat'] : raw.drinks, 'drink'),
        abilities: selection(raw.abilities, 'ability'), debuffOnLevelGap: numericBoost(raw.debuffOnLevelGap) };
}
