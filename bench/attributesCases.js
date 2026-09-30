import { normalizeCharacterInput } from '../src/combatEngineInput.js';
import party from '../tests/fixtures/combat/synthetic-party.json';
import weak from '../tests/fixtures/combat/synthetic-weak.json';
import items from '../src/combatsimulator/data/itemDetailMap.json';
import monsters from '../src/combatsimulator/data/combatMonsterDetailMap.json';
import houses from '../src/combatsimulator/data/houseRoomDetailMap.json';
import achievements from '../src/combatsimulator/data/achievementDetailMap.json';
import tiers from '../src/combatsimulator/data/achievementTierDetailMap.json';
import abilities from '../src/combatsimulator/data/abilityDetailMap.json';
import actions from '../src/combatsimulator/data/actionDetailMap.json';
export { normalizeCharacterInput } from '../src/combatEngineInput.js';

const base = () => ({ ...normalizeCharacterInput(weak['1']), equipment: [], houseRooms: [], achievements: {}, guildBuffs: [], shrines: [0, 0, 0, 0, 0], food: [], drinks: [], abilities: [] });
const buff = (uniqueHrid, type, ratioBoost, flatBoost, duration = 100) => ({ uniqueHrid, typeHrid: '/buff_types/' + type, ratioBoost, flatBoost, duration });
const selected = ['head', 'body', 'legs', 'feet', 'hands', 'main_hand', 'two_hand', 'off_hand', 'pouch', 'back', 'neck', 'earrings', 'ring', 'charm'].map(slot => '/equipment_types/' + slot);

export function attributeGroups() {
    const equipment = [];
    for (const [hrid, item] of Object.entries(items)) {
        if (!selected.includes(item.equipmentDetail?.type)) continue;
        for (const enhancementLevel of [0, 1, 7, 10, 20]) equipment.push({ name: `${hrid}:${enhancementLevel}`, input: { ...base(), levels: [190, 170, 180, 160, 150, 140, 130],
            equipment: [{ slot: item.equipmentDetail.type, hrid, enhancementLevel }] }, steps: [{ op: 'update' }] });
    }
    const monsterCases = [];
    for (const hrid of Object.keys(monsters)) for (const difficultyTier of [0, 1, 2]) for (const roomLevel of [0, 100, 150, 250]) {
        monsterCases.push({ name: `${hrid}:${difficultyTier}:${roomLevel}`, input: { kind: 'monster', hrid, difficultyTier, roomLevel }, steps: [{ op: 'update' }] });
    }
    const permanent = Object.entries(houses).flatMap(([hrid]) => [1, 3, 8].map(level => ({ name: `${hrid}:${level}`, input: { ...base(), houseRooms: [[hrid, level]] }, steps: [{ op: 'start' }, { op: 'update' }] })));
    for (const hrid of Object.keys(tiers)) {
        const map = Object.fromEntries(Object.values(achievements).filter(entry => entry.tierHrid === hrid).map(entry => [entry.hrid, true]));
        permanent.push({ name: hrid, input: { ...base(), achievements: map }, steps: [{ op: 'start' }] });
        const missing = { ...map }; delete missing[Object.keys(missing)[0]];
        permanent.push({ name: `${hrid}:missing-one`, input: { ...base(), achievements: missing }, steps: [{ op: 'start' }] });
    }
    for (const hrid of Object.keys(actions).filter(hrid => hrid.startsWith('/actions/combat/'))) permanent.push({ name: hrid, input: base(), zoneHrid: hrid, steps: [{ op: 'start' }] });
    for (const [id, profile] of Object.entries(party)) permanent.push({ name: `party:${id}`, input: normalizeCharacterInput(profile), zoneHrid: '/actions/combat/pirate_cove',
        extra: { mooPass: true, comExp: 5, comDrop: 4, personalBuffs: ['/items/seal_of_attack_speed', '/items/seal_of_cast_speed', '/items/seal_of_combat_drop', '/items/seal_of_critical_rate', '/items/seal_of_damage', '/items/seal_of_rare_find', '/items/seal_of_wisdom'] },
        steps: [{ op: 'start' }, { op: 'update' }, { op: 'shrines', levels: [20, 20, 20, 20, 20] }, { op: 'clear' }] });
    const lifecycle = [];
    const types = new Set(['damage', 'attack_level', 'defense_level', 'evasion', 'armor', 'hp_regen', 'mp_regen', 'threat', 'fury_accuracy', 'fury_damage', 'damage_taken', 'retaliation', 'tenacity']);
    for (const ability of Object.values(abilities)) for (const effect of ability.abilityEffects || []) for (const value of effect.buffs || []) types.add(value.typeHrid.replace('/buff_types/', ''));
    for (const item of Object.values(items)) for (const value of item.consumableDetail?.buffs || []) types.add(value.typeHrid.replace('/buff_types/', ''));
    for (const type of types) lifecycle.push({ name: `buff:${type}`, input: normalizeCharacterInput(party['1']), steps: [
        { op: 'start' }, { op: 'add', buffs: [buff('test-a', type, 0.13, 1.7), buff('test-b', type, -0.02, -0.25)], time: 1 },
        { op: 'update' }, { op: 'add', buffs: [buff('test-a', type, 0.13, 1.7)], time: 2 },
        { op: 'add', buffs: [buff('test-a', type, 0.21, 2.1)], time: 3 }, { op: 'remove', keys: ['test-b', 'missing'] },
        { op: 'reset', time: 101 }, { op: 'expire', time: 103 }, { op: 'clear' }] });
    lifecycle.push({ name: 'numeric-key-order', input: base(), steps: [
        { op: 'add', time: 0, buffs: [buff('100', 'evasion', 1e-12, 1e12), buff('2', 'evasion', 0.1, -1e12), buff('1', 'evasion', 0.01, 0.1), buff('normal', 'evasion', 0.01, 0.01)] },
        { op: 'remove', keys: ['2'] }, { op: 'add', time: 1, buffs: [buff('2', 'evasion', 0.1, -1e12)] }] });
    lifecycle.push({ name: 'equipment-level-invalidation', input: normalizeCharacterInput(party['1']), steps: [
        { op: 'start' }, { op: 'equip', equipment: { slot: '/equipment_types/main_hand', hrid: '/items/regal_sword', enhancementLevel: 20 } },
        { op: 'equip', equipment: { slot: '/equipment_types/main_hand', hrid: null, enhancementLevel: 0 } },
        { op: 'levels', levels: [1, 2, 3, 4, 5, 6, 7] }, { op: 'update' }, { op: 'clear' }] });
    // Name is test metadata; strict Rust request only includes the shared normalized schema.
    const clean = cases => cases.map(({ name, ...input }) => ({ name, request: input }));
    return { equipment: clean(equipment), monsters: clean(monsterCases), permanent: clean(permanent), lifecycle: clean(lifecycle) };
}
