export function normalizeAbilityLevels(data = {}) {
    const result = {};
    const add = (hrid, value) => {
        hrid = ({ '/abilities/aqua_aura': '/abilities/mystic_aura', '/abilities/flame_aura': '/abilities/mystic_aura', '/abilities/sylvan_aura': '/abilities/mystic_aura', '/abilities/arcane_reflection': '/abilities/retribution' })[hrid] || hrid;
        const level = Number(value?.level ?? value);
        if (typeof hrid === 'string' && hrid.startsWith('/abilities/') && Number.isInteger(level) && level >= 1 && level <= 400) result[hrid] = level;
    };
    const source = data.abilityLevels ?? data.characterAbilityMap ?? {};
    if (Array.isArray(source)) source.forEach(entry => add(entry?.abilityHrid ?? entry?.hrid, entry));
    else Object.entries(source).forEach(([hrid, value]) => add(hrid, value));
    // Equipped slots may contain intentional simulation overrides.
    for (const entry of Object.values(data.abilities ?? {})) add(entry?.abilityHrid ?? entry?.ability ?? entry?.hrid, entry?.level);
    return result;
}

// Preserve which skills came from the character separately from simulation edits.
export function normalizeLearnedAbilityLevels(data = {}) {
    return data.learnedAbilityLevels != null
        ? normalizeAbilityLevels({ abilityLevels: data.learnedAbilityLevels })
        : normalizeAbilityLevels(data);
}
