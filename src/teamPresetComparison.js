const PLAYER_LEVEL_FIELDS = [
    "staminaLevel",
    "intelligenceLevel",
    "attackLevel",
    "meleeLevel",
    "defenseLevel",
    "rangedLevel",
    "magicLevel",
];

const VALID_PLAYER_SLOTS = new Set(["1", "2", "3", "4", "5"]);

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parsePlayerData(value, slot) {
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (!isPlainObject(parsed)) {
            throw new TypeError("Player data must be an object.");
        }
        return parsed;
    } catch (error) {
        const wrappedError = new Error(`Invalid player data in slot ${slot}.`);
        wrappedError.cause = error;
        wrappedError.slot = slot;
        throw wrappedError;
    }
}

function normalizeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function normalizePlayerSlots(values) {
    if (!Array.isArray(values)) {
        return [];
    }
    return [...new Set(values.map(String).filter((slot) => VALID_PLAYER_SLOTS.has(slot)))]
        .sort((left, right) => Number(left) - Number(right));
}

function normalizeEquipmentLocation(itemLocationHrid) {
    const location = String(itemLocationHrid || "");
    if (location.endsWith("/main_hand") || location.endsWith("/two_hand")) {
        return "/item_locations/weapon";
    }
    return location;
}

function normalizeEquipment(playerData) {
    const equipmentMap = new Map();
    const equipment = Array.isArray(playerData?.player?.equipment)
        ? playerData.player.equipment
        : [];

    for (const item of equipment) {
        if (!isPlainObject(item) || !item.itemHrid) {
            continue;
        }
        const locationHrid = normalizeEquipmentLocation(item.itemLocationHrid);
        if (!locationHrid) {
            continue;
        }
        equipmentMap.set(locationHrid, {
            itemHrid: String(item.itemHrid),
            enhancementLevel: normalizeNumber(item.enhancementLevel),
        });
    }
    return equipmentMap;
}

function normalizeAbilities(playerData) {
    const abilities = Array.isArray(playerData?.abilities) ? playerData.abilities : [];
    const slotCount = Math.max(5, abilities.length);
    return Array.from({ length: slotCount }, (_, index) => {
        const ability = isPlainObject(abilities[index]) ? abilities[index] : {};
        const abilityHrid = String(ability.abilityHrid || "");
        return {
            abilityHrid,
            level: abilityHrid ? normalizeNumber(ability.level, 1) : 1,
        };
    });
}

function normalizeConsumables(playerData, type) {
    const container = playerData?.[type];
    const consumables = Array.isArray(container)
        ? container
        : (Array.isArray(container?.["/action_types/combat"])
            ? container["/action_types/combat"]
            : []);
    const slotCount = Math.max(3, consumables.length);
    return Array.from({ length: slotCount }, (_, index) => {
        const consumable = isPlainObject(consumables[index]) ? consumables[index] : {};
        return String(consumable.itemHrid || "");
    });
}

function deepDifferenceCount(left, right) {
    if (Object.is(left, right)) {
        return 0;
    }

    if (Array.isArray(left) || Array.isArray(right)) {
        const leftArray = Array.isArray(left) ? left : [];
        const rightArray = Array.isArray(right) ? right : [];
        let differenceCount = 0;
        const length = Math.max(leftArray.length, rightArray.length);
        for (let index = 0; index < length; index += 1) {
            differenceCount += deepDifferenceCount(leftArray[index], rightArray[index]);
        }
        return differenceCount;
    }

    if (isPlainObject(left) || isPlainObject(right)) {
        const leftObject = isPlainObject(left) ? left : {};
        const rightObject = isPlainObject(right) ? right : {};
        let differenceCount = 0;
        const keys = new Set([...Object.keys(leftObject), ...Object.keys(rightObject)]);
        for (const key of keys) {
            differenceCount += deepDifferenceCount(leftObject[key], rightObject[key]);
        }
        return differenceCount;
    }

    return 1;
}

function compareLevelChanges(baseline, current, changes) {
    for (const field of PLAYER_LEVEL_FIELDS) {
        const baselineValue = field === "meleeLevel"
            ? baseline?.player?.[field] ?? baseline?.player?.powerLevel
            : baseline?.player?.[field];
        const currentValue = field === "meleeLevel"
            ? current?.player?.[field] ?? current?.player?.powerLevel
            : current?.player?.[field];
        const before = normalizeNumber(baselineValue, 1);
        const after = normalizeNumber(currentValue, 1);
        if (before !== after) {
            changes.push({ kind: "level", section: "levels", field, before, after });
        }
    }
}

function compareEquipmentChanges(baseline, current, changes) {
    const baselineEquipment = normalizeEquipment(baseline);
    const currentEquipment = normalizeEquipment(current);
    const locations = [...new Set([...baselineEquipment.keys(), ...currentEquipment.keys()])].sort();

    for (const locationHrid of locations) {
        const before = baselineEquipment.get(locationHrid) ?? null;
        const after = currentEquipment.get(locationHrid) ?? null;
        if (
            before?.itemHrid !== after?.itemHrid ||
            before?.enhancementLevel !== after?.enhancementLevel
        ) {
            changes.push({ kind: "equipment", section: "equipment", locationHrid, before, after });
        }
    }
}

function compareAbilityChanges(baseline, current, changes) {
    const baselineAbilities = normalizeAbilities(baseline);
    const currentAbilities = normalizeAbilities(current);
    const slotCount = Math.max(baselineAbilities.length, currentAbilities.length);

    for (let index = 0; index < slotCount; index += 1) {
        const before = baselineAbilities[index] ?? { abilityHrid: "", level: 1 };
        const after = currentAbilities[index] ?? { abilityHrid: "", level: 1 };
        if (before.abilityHrid !== after.abilityHrid || before.level !== after.level) {
            changes.push({ kind: "ability", section: "abilities", index, before, after });
        }
    }
}

function compareConsumableChanges(baseline, current, type, changes) {
    const baselineConsumables = normalizeConsumables(baseline, type);
    const currentConsumables = normalizeConsumables(current, type);
    const slotCount = Math.max(baselineConsumables.length, currentConsumables.length);

    for (let index = 0; index < slotCount; index += 1) {
        const before = baselineConsumables[index] || "";
        const after = currentConsumables[index] || "";
        if (before !== after) {
            changes.push({
                kind: "consumable",
                section: type,
                consumableType: type,
                index,
                before,
                after,
            });
        }
    }
}

function compareTriggerChanges(baseline, current, changes) {
    const before = isPlainObject(baseline?.triggerMap) ? baseline.triggerMap : {};
    const after = isPlainObject(current?.triggerMap) ? current.triggerMap : {};
    const differenceCount = deepDifferenceCount(before, after);
    if (differenceCount > 0) {
        changes.push({
            kind: "triggers",
            section: "triggers",
            before,
            after,
            beforeCount: Object.keys(before).length,
            afterCount: Object.keys(after).length,
            differenceCount,
        });
    }
}

function compareNumberMapChanges(baselineMap, currentMap, kind, section, changes) {
    const beforeMap = isPlainObject(baselineMap) ? baselineMap : {};
    const afterMap = isPlainObject(currentMap) ? currentMap : {};
    const keys = [...new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])].sort();
    for (const hrid of keys) {
        const before = normalizeNumber(beforeMap[hrid]);
        const after = normalizeNumber(afterMap[hrid]);
        if (before !== after) {
            changes.push({ kind, section, hrid, before, after });
        }
    }
}

function compareAchievementChanges(baseline, current, changes) {
    const beforeMap = isPlainObject(baseline?.achievements) ? baseline.achievements : {};
    const afterMap = isPlainObject(current?.achievements) ? current.achievements : {};
    const keys = [...new Set([...Object.keys(beforeMap), ...Object.keys(afterMap)])].sort();
    for (const hrid of keys) {
        const before = beforeMap[hrid] === true;
        const after = afterMap[hrid] === true;
        if (before !== after) {
            changes.push({ kind: "achievement", section: "achievements", hrid, before, after });
        }
    }
}

function getCharacterIdentity(playerData) {
    const id = playerData?.characterId ?? playerData?.characterMeta?.id;
    const name = playerData?.characterName ?? playerData?.characterMeta?.name;
    return {
        id: id === undefined || id === null ? "" : String(id),
        name: typeof name === "string" ? name.trim() : "",
    };
}

export function comparePlayerLoadouts(baseline, current) {
    const changes = [];
    const baselineIdentity = getCharacterIdentity(baseline);
    const currentIdentity = getCharacterIdentity(current);
    const idsChanged = baselineIdentity.id && currentIdentity.id && baselineIdentity.id !== currentIdentity.id;
    const namesChanged = !baselineIdentity.id && !currentIdentity.id &&
        baselineIdentity.name && currentIdentity.name && baselineIdentity.name !== currentIdentity.name;
    if (idsChanged || namesChanged) {
        changes.push({
            kind: "character",
            section: "team",
            before: baselineIdentity,
            after: currentIdentity,
        });
    }

    compareLevelChanges(baseline, current, changes);
    compareEquipmentChanges(baseline, current, changes);
    compareAbilityChanges(baseline, current, changes);
    compareConsumableChanges(baseline, current, "food", changes);
    compareConsumableChanges(baseline, current, "drinks", changes);
    compareTriggerChanges(baseline, current, changes);
    compareNumberMapChanges(baseline?.houseRooms, current?.houseRooms, "houseRoom", "houseRooms", changes);
    compareAchievementChanges(baseline, current, changes);
    return changes;
}

export function compareTeamPresetWithCurrent(preset, currentPlayerDataMap, currentSelectedPlayers) {
    if (!isPlainObject(preset) || !isPlainObject(preset.playerDataMap)) {
        throw new TypeError("A valid team preset is required.");
    }

    const baselineSlots = normalizePlayerSlots(preset.selectedPlayers);
    const currentSlots = normalizePlayerSlots(currentSelectedPlayers);
    const allSlots = [...new Set([...baselineSlots, ...currentSlots])]
        .sort((left, right) => Number(left) - Number(right));
    const players = [];

    for (const slot of allSlots) {
        const isInBaseline = baselineSlots.includes(slot);
        const isInCurrent = currentSlots.includes(slot);
        const baselineData = isInBaseline
            ? parsePlayerData(preset.playerDataMap[slot], slot)
            : null;
        const currentData = isInCurrent
            ? parsePlayerData(currentPlayerDataMap?.[slot], slot)
            : null;
        let status;
        let changes;

        if (!isInBaseline) {
            status = "added";
            changes = [{ kind: "membership", section: "team", before: false, after: true }];
        } else if (!isInCurrent) {
            status = "removed";
            changes = [{ kind: "membership", section: "team", before: true, after: false }];
        } else {
            changes = comparePlayerLoadouts(baselineData, currentData);
            status = changes.length > 0 ? "changed" : "unchanged";
        }

        players.push({ slot, status, baselineData, currentData, changes });
    }

    return {
        players,
        totalChanges: players.reduce((total, playerComparison) => total + playerComparison.changes.length, 0),
        changedPlayers: players.filter((playerComparison) => playerComparison.status !== "unchanged").length,
    };
}
