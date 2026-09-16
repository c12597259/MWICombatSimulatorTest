export const ALLOW_SOLO_ZONE_STORAGE_KEY = "mwiCombatSimulatorAllowSoloZones";

export function isFullMapCombatAction(action) {
    return Boolean(
        action
        && action.type === "/action_types/combat"
        && action.category !== "/action_categories/combat/dungeons"
        && action.combatZoneInfo?.fightInfo?.randomSpawnInfo?.maxSpawnCount > 1
    );
}

export function isSingleMonsterCombatAction(action) {
    return Boolean(
        action
        && action.type === "/action_types/combat"
        && action.category !== "/action_categories/combat/dungeons"
        && action.combatZoneInfo?.fightInfo?.randomSpawnInfo?.maxSpawnCount === 1
    );
}

export function getSelectableCombatZones(actionMap, allowSolo = false) {
    return Object.values(actionMap ?? {})
        .filter((action) => (
            isFullMapCombatAction(action)
            || (allowSolo && isSingleMonsterCombatAction(action))
        ))
        .sort((left, right) => left.sortIndex - right.sortIndex);
}
