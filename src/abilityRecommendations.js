// A conservative weapon-fit filter, not a ranking or an optimal combat build.
// Read combat metadata rather than names: e.g. Rippling Trident is a water staff.
export function inferAbilityWeaponProfile(item) {
    const equipment = item?.equipmentDetail;
    const stats = equipment?.combatStats;
    const style = stats?.combatStyleHrids?.[0]?.split('/').pop();
    const element = stats?.damageType?.split('/').pop();
    if (!['/equipment_types/main_hand', '/equipment_types/two_hand'].includes(equipment?.type)) return null;
    const tank = style === 'smash' && stats.primaryTraining === '/skills/defense';
    let role;
    if (style === 'magic' && ['water', 'fire', 'nature'].includes(element)) role = element;
    else if (style === 'ranged') role = equipment.type === '/equipment_types/two_hand' ? 'bow' : 'crossbow';
    else role = tank ? 'tank' : { slash: 'sword', stab: 'spear', smash: 'hammer' }[style];
    return role ? { style, element, tank, role } : null;
}

export function isAbilityRecommended(ability, profile) {
    if (!ability || ability.hrid === '/abilities/promote') return false;
    // Without a recognized weapon, do not guess that an unarmed character is a hammer build.
    if (!profile) return true;
    // Team composition, rather than the caster's weapon alone, determines useful auras.
    if (ability.isSpecialAbility) return true;
    const damage = (ability.abilityEffects ?? []).filter(effect => effect.effectType === '/ability_effect_types/damage');
    if (damage.length) return damage.some(effect => {
        const style = effect.combatStyleHrid?.split('/').pop();
        if (style !== profile.style) return false;
        return style !== 'magic' || effect.damageType === `/damage_types/${profile.element}`;
    });
    const buffs = new Set((ability.abilityEffects ?? []).flatMap(effect => (effect.buffs ?? []).map(buff => buff.typeHrid.split('/').pop())));
    if (['threat', 'retaliation', 'physical_thorns', 'elemental_thorns'].some(type => buffs.has(type))) return profile.tank;
    if (buffs.has('physical_amplify')) return profile.style !== 'magic';
    if (['water_amplify', 'fire_amplify', 'nature_amplify'].some(type => buffs.has(type))) {
        // Ranged skills include elemental arrows even when the weapon itself is physical.
        return profile.style === 'magic' || profile.style === 'ranged';
    }
    if (ability.hrid === '/abilities/frenzy' || ability.hrid === '/abilities/vampirism') return profile.style !== 'magic';
    // Healing, revival, accuracy, defensive cooldowns and mixed buffs stay available.
    return true;
}
