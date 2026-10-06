const fs = require('node:fs');
const path = require('node:path');

// Authored from public item/ability definitions. No account or loadout export
// is read, even as a template. Keep this generator reproducible and public.
function makePlayer(level, weapon, abilities, coffee) {
    const equipment = [
        ['head', '/items/corsair_helmet'], ['body', '/items/anchorbound_plate_body'],
        ['legs', '/items/anchorbound_plate_legs'], ['feet', '/items/rainbow_boots'],
        ['hands', '/items/rainbow_gauntlets'], ['pouch', '/items/giant_pouch'], [weapon[0], weapon[1]],
    ].map(([slot, itemHrid]) => ({ itemLocationHrid: `/item_locations/${slot}`, itemHrid, enhancementLevel: 10 }));
    return {
        player: { staminaLevel: level, intelligenceLevel: level, attackLevel: level, defenseLevel: level,
            meleeLevel: level, rangedLevel: level, magicLevel: level, equipment },
        houseRooms: { '/house_rooms/gym': 3, '/house_rooms/library': 2, '/house_rooms/armory': 3 },
        achievements: {}, guildCombatBuffLevels: { force: 3, tempo: 2, spirit: 4, rarity: 1, scholar: 2 },
        triggerMap: {},
        food: { '/action_types/combat': [{ itemHrid: '/items/spaceberry_cake' }, { itemHrid: '/items/star_fruit_gummy' }] },
        drinks: { '/action_types/combat': [{ itemHrid: coffee }] },
        abilities: abilities.map(abilityHrid => ({ abilityHrid: `/abilities/${abilityHrid}`, level: 20 })),
    };
}

function createFixtures() {
    const party = {
        '1': makePlayer(190, ['main_hand', '/items/regal_sword'], ['taunt', 'cleave', 'stunning_blow', 'vampirism'], '/items/super_attack_coffee'),
        '2': makePlayer(170, ['two_hand', '/items/cursed_bow'], ['rain_of_arrows', 'silencing_shot', 'puncture', 'precision'], '/items/super_ranged_coffee'),
        '3': makePlayer(170, ['main_hand', '/items/arcane_fire_staff'], ['firestorm', 'flame_blast', 'elemental_affinity', 'life_drain'], '/items/super_magic_coffee'),
        '4': makePlayer(170, ['main_hand', '/items/arcane_nature_staff'], ['rejuvenate', 'quick_aid', 'revive', 'entangle'], '/items/super_magic_coffee'),
        '5': makePlayer(170, ['main_hand', '/items/arcane_water_staff'], ['frost_surge', 'mana_spring', 'natures_veil', 'ice_spear'], '/items/super_magic_coffee'),
    };
    const weak = {
        '1': { player: { staminaLevel: 1, intelligenceLevel: 1, attackLevel: 1, defenseLevel: 1,
            meleeLevel: 1, rangedLevel: 1, magicLevel: 1, equipment: [] },
            houseRooms: {}, triggerMap: {}, food: { '/action_types/combat': [] },
            drinks: { '/action_types/combat': [] }, abilities: [] },
    };
    return { 'synthetic-party.json': party, 'synthetic-weak.json': weak };
}

if (require.main === module) {
    const directory = path.resolve(__dirname, '../tests/fixtures/combat');
    fs.mkdirSync(directory, { recursive: true });
    for (const [filename, fixture] of Object.entries(createFixtures())) {
        fs.writeFileSync(path.join(directory, filename), JSON.stringify(fixture, null, 2) + '\n');
    }
    console.log('Wrote two synthetic fixtures; no private input was read.');
}

module.exports = { createFixtures };
