export const LABYRINTH_UPGRADES = [
    { key: 'combat_damage', field: 'labyrinthCombatDamageLevel', type: 'damage', boost: 'ratioBoost' },
    { key: 'attack_speed', field: 'labyrinthAttackSpeedLevel', type: 'attack_speed', boost: 'ratioBoost' },
    { key: 'cast_speed', field: 'labyrinthCastSpeedLevel', type: 'cast_speed', boost: 'flatBoost' },
    { key: 'critical_rate', field: 'labyrinthCriticalRateLevel', type: 'critical_rate', boost: 'flatBoost' },
    { key: 'experience', field: 'labyrinthExperienceLevel', type: 'wisdom', boost: 'flatBoost' },
];

export function normalizeLabyrinthUpgrades(raw = {}) {
    return Object.fromEntries(LABYRINTH_UPGRADES.map(({ key, field }) => {
        const value = Number(raw?.[field] ?? raw?.[`/buff_uniques/labyrinth_upgrade_${key}`] ?? 0);
        return [field, Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0];
    }));
}

export function getLabyrinthUpgradeBuffs(raw) {
    const levels = normalizeLabyrinthUpgrades(raw);
    return LABYRINTH_UPGRADES.filter(({ field }) => levels[field] > 0).map(({ key, field, type, boost }) => ({
        uniqueHrid: `/buff_uniques/labyrinth_upgrade_${key}`,
        typeHrid: `/buff_types/${type}`, ratioBoost: 0, flatBoost: 0,
        ratioBoostLevelBonus: 0, flatBoostLevelBonus: 0, duration: 0,
        [boost]: levels[field] * 0.01,
    }));
}

// Raw buffs carry community bonuses in calculator requests. Upgrades have one
// authoritative source (levels when present) so an export never applies them twice.
export function getLabyrinthRequestBuffs(player, extra = {}) {
    const levels = player.labyrinthUpgrades ?? player.labyrinth;
    const raw = Array.isArray(extra.buffs) ? extra.buffs : [];
    return [
        ...raw.filter(buff => typeof buff?.typeHrid === 'string' &&
            !String(buff.uniqueHrid).startsWith('/buff_uniques/personal_') &&
            !(levels != null && String(buff.uniqueHrid).startsWith('/buff_uniques/labyrinth_upgrade_'))),
        ...getLabyrinthUpgradeBuffs(levels),
    ];
}
