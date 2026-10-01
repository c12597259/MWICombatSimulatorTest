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
    const equip = (slot, hrid, enhancementLevel = 0) => ({ op: 'equip', equipment: { slot: '/equipment_types/' + slot, hrid, enhancementLevel } });
    const itemFor = slot => Object.values(items).find(item => item.equipmentDetail?.type === '/equipment_types/' + slot).hrid;
    lifecycle.push({ name: 'cache-enhancement-and-buff-isolation', input: normalizeCharacterInput(party['1']), steps: [
        { op: 'start' }, ...[10, 20, 0, 10].flatMap(enhancementLevel => [
            equip('main_hand', '/items/regal_sword', enhancementLevel),
            { op: 'add', time: 1, buffs: [buff('cache-crit', 'critical_rate', 0, 0.125), buff('cache-regen', 'hp_regen', 0.2, 0.01)] },
            { op: 'update' }, { op: 'remove', keys: ['cache-crit', 'cache-regen'] }, { op: 'update' }
        ]), { op: 'clear' }, { op: 'update' }] });
    const bulwark = Object.values(items).find(item => item.equipmentDetail?.type === '/equipment_types/two_hand' && item.hrid.includes('bulwark')).hrid;
    lifecycle.push({ name: 'cache-weapon-fallback-and-removal', input: base(), steps: [
        equip('main_hand', '/items/regal_sword', 10), equip('two_hand', '/items/cursed_bow', 7),
        equip('main_hand', null), { op: 'update' }, equip('main_hand', '/items/regal_sword', 20),
        equip('two_hand', null), equip('main_hand', null), { op: 'update' },
        equip('two_hand', bulwark, 10), { op: 'levels', levels: [100, 110, 120, 130, 140, 150, 160] },
        { op: 'update' }, equip('two_hand', null), { op: 'update' }] });
    lifecycle.push({ name: 'cache-new-slots-and-removal', input: base(), steps: [
        ...['neck', 'earrings', 'ring', 'charm'].flatMap(slot => [equip(slot, itemFor(slot), 7), { op: 'update' }]),
        ...['neck', 'earrings', 'ring', 'charm'].flatMap(slot => [equip(slot, itemFor(slot), 20), { op: 'update' }]),
        ...['neck', 'earrings', 'ring', 'charm'].flatMap(slot => [equip(slot, null), { op: 'update' }])
    ] });
    lifecycle.push({ name: 'cache-pouch-levels-and-shrines', input: normalizeCharacterInput(party['2']), steps: [
        { op: 'start' }, equip('pouch', null), { op: 'update' }, equip('pouch', itemFor('pouch')),
        { op: 'levels', levels: [1, 2, 3, 4, 5, 6, 7] }, { op: 'update' },
        equip('pouch', '/items/giant_pouch', 20), { op: 'shrines', levels: [20, 20, 20, 20, 20] },
        { op: 'update' }, { op: 'shrines', levels: [0, 0, 0, 0, 0] }, { op: 'clear' }, { op: 'update' }
    ] });
    lifecycle.push({ name: 'cache-repeated-buff-expiry-and-reset', input: normalizeCharacterInput(party['3']), steps: [
        { op: 'start' }, ...[1, 201, 401].flatMap(time => [
            { op: 'add', time, buffs: [buff('cache-damage', 'damage', 0.15, 0), buff('cache-mp', 'mp_regen', 0.2, 0.01)] },
            { op: 'update' }, { op: 'expire', time: time + 100 }, { op: 'update' },
            { op: 'reset', time: time + 101 }, { op: 'clear' }, { op: 'update' }
        ])
    ] });
    const mixedBuffs = [
        buff('10', 'evasion', 0.1, 1e10), buff('3', 'attack_level', 0.13, 0.17),
        buff('2', 'evasion', 1e-12, -1e10), buff('armor-a', 'armor', 0.1, 0.07),
        buff('attack-b', 'attack_level', -0.02, 0.23), buff('evasion-last', 'evasion', 0.03, 0.01),
        buff('armor-b', 'armor', 1e-12, 0.1), buff('regen', 'hp_regen', 0.2, 0.001),
        buff('unused', 'unknown_test_type', 0.5, 7), buff('damage', 'damage', 0.07, 0)
    ];
    lifecycle.push({ name: 'buff-index-mixed-types-and-rounding', input: normalizeCharacterInput(party['1']), steps: [
        { op: 'start' }, { op: 'add', time: 1, buffs: mixedBuffs }, { op: 'update' },
        { op: 'levels', levels: [190, 170, 180, 160, 150, 140, 130] },
        { op: 'remove', keys: ['2', 'armor-a'] }, { op: 'add', time: 2, buffs: [mixedBuffs[2], mixedBuffs[3]] },
        { op: 'update' }, { op: 'clear' }, { op: 'update' }
    ] });
    const numericBuffs = [
        buff('4294967295', 'evasion', 0.03, 1e10), buff('00', 'armor', 0.07, 0.01),
        buff('4294967294', 'evasion', 0.01, -1e10), buff('0', 'evasion', 1e-12, 0.03),
        buff('01', 'evasion', 0.02, 0.07), buff('2', 'armor', 0.13, 0.11),
        buff('normal', 'evasion', 0.1, 0.17)
    ];
    lifecycle.push({ name: 'buff-index-js-numeric-key-boundaries', input: base(), steps: [
        { op: 'add', time: 1, buffs: numericBuffs }, { op: 'update' },
        { op: 'remove', keys: ['4294967294', '00'] },
        { op: 'add', time: 2, buffs: [numericBuffs[2], numericBuffs[1]] }, { op: 'update' },
        { op: 'expire', time: 102 }, { op: 'update' }
    ] });
    lifecycle.push({ name: 'buff-index-same-key-type-and-duration-refresh', input: base(), steps: [
        { op: 'add', time: 1, buffs: [buff('same', 'damage', 0.2, 0.01)] },
        { op: 'add', time: 2, buffs: [buff('same', 'accuracy', 0.2, 0.01, 200)] }, { op: 'update' },
        { op: 'add', time: 3, buffs: [buff('same', 'accuracy', 0.3, 0.02, 300)] },
        { op: 'expire', time: 202 }, { op: 'update' }, { op: 'expire', time: 303 }, { op: 'update' },
        { op: 'add', time: 304, buffs: [buff('same', 'unknown_test_type', 0.2, 0.01)] },
        { op: 'clear' }, { op: 'update' }
    ] });
    lifecycle.push({ name: 'buff-index-shrines-append-and-reset', input: normalizeCharacterInput(party['2']), steps: [
        { op: 'start' }, { op: 'add', time: 1, buffs: [
            buff('hp-a', 'max_hitpoints', 0.13, 0.1), buff('hp-b', 'max_hitpoints', 1e-12, 0.07),
            buff('speed', 'attack_speed', 0.03, 0), buff('rare', 'rare_find', 0.1, 0.17),
            buff('wisdom', 'wisdom', 0.07, 0.01), buff('damage', 'damage', 0.07, 0)
        ] }, { op: 'update' }, { op: 'shrines', levels: [20, 20, 20, 20, 20] }, { op: 'update' },
        { op: 'reset', time: 101 }, { op: 'update' }, { op: 'shrines', levels: [0, 0, 0, 0, 0] },
        { op: 'reset', time: 0 }, { op: 'update' }
    ] });
    // Name is test metadata; strict Rust request only includes the shared normalized schema.
    const clean = cases => cases.map(({ name, ...input }) => ({ name, request: input }));
    return { equipment: clean(equipment), monsters: clean(monsterCases), permanent: clean(permanent), lifecycle: clean(lifecycle) };
}
