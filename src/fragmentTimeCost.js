export const KEY_FRAGMENT_HRIDS = Object.freeze([
    "/items/blue_key_fragment",
    "/items/green_key_fragment",
    "/items/purple_key_fragment",
    "/items/white_key_fragment",
    "/items/orange_key_fragment",
    "/items/brown_key_fragment",
    "/items/stone_key_fragment",
    "/items/dark_key_fragment",
    "/items/burning_key_fragment",
]);

export const DEFAULT_FRAGMENT_PRODUCTION_BUFFS = Object.freeze({
    itemEfficiencyPercent: 11.2,
    gatheringQuantityPercent: 29.5,
    productionEfficiencyPercent: 19.7,
});

const HOUSE_ROOM_BY_ACTION_TYPE = Object.freeze({
    "/action_types/brewing": "/house_rooms/brewery",
    "/action_types/cheesesmithing": "/house_rooms/forge",
    "/action_types/cooking": "/house_rooms/kitchen",
    "/action_types/crafting": "/house_rooms/workshop",
    "/action_types/foraging": "/house_rooms/garden",
    "/action_types/milking": "/house_rooms/dairy_barn",
    "/action_types/tailoring": "/house_rooms/sewing_parlor",
    "/action_types/woodcutting": "/house_rooms/log_shed",
    "/action_types/alchemy": "/house_rooms/laboratory",
});

const TOOL_SPEED_STAT_BY_ACTION_TYPE = Object.freeze({
    "/action_types/brewing": "brewingSpeed",
    "/action_types/cheesesmithing": "cheesesmithingSpeed",
    "/action_types/cooking": "cookingSpeed",
    "/action_types/crafting": "craftingSpeed",
    "/action_types/foraging": "foragingSpeed",
    "/action_types/milking": "milkingSpeed",
    "/action_types/tailoring": "tailoringSpeed",
    "/action_types/woodcutting": "woodcuttingSpeed",
    "/action_types/alchemy": "alchemySpeed",
});

const ENHANCEMENT_BONUS_PERCENT = Object.freeze([
    0, 2, 4.2, 6.6, 9.2, 12, 15, 18.2, 21.6, 25.2, 29,
    33, 37.2, 41.6, 46.2, 51, 56, 61.2, 66.6, 72.2, 78,
]);

const SKILL_LEVEL_BUFF_TYPE = Object.freeze({
    "/skills/milking": "/buff_types/milking_level",
    "/skills/foraging": "/buff_types/foraging_level",
    "/skills/woodcutting": "/buff_types/woodcutting_level",
    "/skills/cheesesmithing": "/buff_types/cheesesmithing_level",
    "/skills/crafting": "/buff_types/crafting_level",
    "/skills/tailoring": "/buff_types/tailoring_level",
    "/skills/cooking": "/buff_types/cooking_level",
    "/skills/brewing": "/buff_types/brewing_level",
    "/skills/alchemy": "/buff_types/alchemy_level",
    "/skills/enhancing": "/buff_types/enhancing_level",
});

function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function readLevelMap(value, keyName) {
    const result = {};
    if (Array.isArray(value)) {
        for (const entry of value) {
            if (entry?.[keyName]) {
                result[entry[keyName]] = toFiniteNumber(entry.level);
            }
        }
        return result;
    }
    if (!value || typeof value !== "object") {
        return result;
    }
    for (const [key, entry] of Object.entries(value)) {
        result[key] = toFiniteNumber(entry?.level ?? entry);
    }
    return result;
}

function readBuffMap(value) {
    const result = {};
    if (!value || typeof value !== "object") {
        return result;
    }
    for (const [key, entries] of Object.entries(value)) {
        result[key] = (Array.isArray(entries) ? entries : [])
            .filter((buff) => buff?.typeHrid)
            .map((buff) => ({
                typeHrid: String(buff.typeHrid),
                flatBoost: toFiniteNumber(buff.flatBoost),
                ratioBoost: toFiniteNumber(buff.ratioBoost),
            }));
    }
    return result;
}

function normalizeProductionProfile(profile = {}, fallbackHouseRooms = {}) {
    const skillSource = profile.skillLevels
        ?? profile.skills
        ?? profile.characterSkills
        ?? profile.characterSkillMap;
    const houseSource = profile.houseRooms ?? profile.characterHouseRoomMap;
    const itemSource = profile.items
        ?? profile.tools
        ?? profile.characterItems;
    const drinkSource = profile.actionTypeDrinkSlots ?? profile.actionTypeDrinkSlotsMap;
    const effectiveActionTypeBuffSource = profile.effectiveActionTypeBuffs
        ?? profile.skillingActionTypeBuffsDict;
    const effectiveActionHridBuffSource = profile.effectiveActionHridBuffs
        ?? profile.skillingActionHridBuffsDict;
    const explicitBuffs = profile.buffs ?? {};
    const hasNamedBuffData = [
        "itemEfficiencyPercent",
        "gatheringQuantityPercent",
        "productionEfficiencyPercent",
    ].every((key) => explicitBuffs[key] !== undefined);
    const hasLegacyBuffData = [
        profile.itemEffiBuff,
        profile.GatheringQuantityBuff,
        profile.ProductionEfficiencyBuff,
    ].every((value) => value !== undefined);

    return {
        complete: profile.complete === true,
        skillLevels: readLevelMap(skillSource, "skillHrid"),
        houseRooms: {
            ...readLevelMap(fallbackHouseRooms, "houseRoomHrid"),
            ...readLevelMap(houseSource, "houseRoomHrid"),
        },
        items: Array.isArray(itemSource) ? itemSource : [],
        actionTypeDrinkSlots: drinkSource && typeof drinkSource === "object" ? drinkSource : {},
        effectiveActionTypeBuffs: readBuffMap(effectiveActionTypeBuffSource),
        effectiveActionHridBuffs: readBuffMap(effectiveActionHridBuffSource),
        buffs: {
            itemEfficiencyPercent: toFiniteNumber(
                explicitBuffs.itemEfficiencyPercent ?? profile.itemEffiBuff,
                DEFAULT_FRAGMENT_PRODUCTION_BUFFS.itemEfficiencyPercent,
            ),
            gatheringQuantityPercent: toFiniteNumber(
                explicitBuffs.gatheringQuantityPercent ?? profile.GatheringQuantityBuff,
                DEFAULT_FRAGMENT_PRODUCTION_BUFFS.gatheringQuantityPercent,
            ),
            productionEfficiencyPercent: toFiniteNumber(
                explicitBuffs.productionEfficiencyPercent ?? profile.ProductionEfficiencyBuff,
                DEFAULT_FRAGMENT_PRODUCTION_BUFFS.productionEfficiencyPercent,
            ),
        },
        hasSkillData: skillSource !== undefined,
        hasItemData: itemSource !== undefined,
        hasDrinkData: drinkSource !== undefined,
        hasBuffData: hasNamedBuffData || hasLegacyBuffData,
        hasEffectiveBuffData: profile.effectiveBuffsCaptured === true
            && effectiveActionTypeBuffSource !== undefined,
    };
}

function buildItemSourceIndex(actionDetailMap) {
    const index = new Map();
    const addSource = (itemHrid, source) => {
        if (!itemHrid) {
            return;
        }
        const sources = index.get(itemHrid) ?? [];
        sources.push(source);
        index.set(itemHrid, sources);
    };

    for (const action of Object.values(actionDetailMap ?? {})) {
        if (!action || action.type === "/action_types/combat" || !action.baseTimeCost) {
            continue;
        }
        for (const output of action.outputItems ?? []) {
            addSource(output.itemHrid, {
                action,
                kind: "production",
                expectedYield: toFiniteNumber(output.count),
            });
        }
        for (const drop of action.dropTable ?? []) {
            addSource(drop.itemHrid, {
                action,
                kind: "gathering",
                expectedYield: toFiniteNumber(drop.dropRate, 1)
                    * (toFiniteNumber(drop.minCount) + toFiniteNumber(drop.maxCount)) / 2,
            });
        }
    }
    return index;
}

function expectedActionNameForItem(itemName = "") {
    return itemName
        .replace("Milk", "Cow")
        .replace("Log", "Tree")
        .replace("Cowing", "Milking")
        .replace("Rainbow Cow", "Unicow")
        .replace("Collector's Boots", "Collectors Boots")
        .replace("Knight's Aegis", "Knights Aegis");
}

function selectItemSource(itemHrid, sourceIndex, itemDetailMap) {
    const sources = sourceIndex.get(itemHrid) ?? [];
    if (sources.length <= 1) {
        return sources[0] ?? null;
    }

    const expectedName = expectedActionNameForItem(itemDetailMap?.[itemHrid]?.name);
    return sources.find((source) => source.action.name === expectedName)
        ?? sources.find((source) => source.kind === "production")
        ?? [...sources].sort((left, right) =>
            toFiniteNumber(left.action.sortIndex) - toFiniteNumber(right.action.sortIndex)
        )[0];
}

function getTeaBuffs(actionType, profile, itemDetailMap) {
    const result = {
        efficiencyPercent: 0,
        quantityPercent: 0,
        lessResourcePercent: 0,
    };
    const drinks = profile.actionTypeDrinkSlots[actionType] ?? [];
    for (const drink of drinks) {
        if (!drink?.itemHrid) {
            continue;
        }
        for (const buff of itemDetailMap?.[drink.itemHrid]?.consumableDetail?.buffs ?? []) {
            if (buff.typeHrid === "/buff_types/artisan") {
                result.lessResourcePercent += toFiniteNumber(buff.flatBoost) * 100;
            } else if (buff.typeHrid === "/buff_types/action_level") {
                result.efficiencyPercent -= toFiniteNumber(buff.flatBoost);
            } else if (["/buff_types/gathering", "/buff_types/gourmet"].includes(buff.typeHrid)) {
                result.quantityPercent += toFiniteNumber(buff.flatBoost) * 100;
            } else if (buff.typeHrid === "/buff_types/efficiency") {
                result.efficiencyPercent += toFiniteNumber(buff.flatBoost) * 100;
            } else if (buff.typeHrid === `/buff_types/${actionType.replace("/action_types/", "")}_level`) {
                result.efficiencyPercent += toFiniteNumber(buff.flatBoost);
            }
        }
    }
    return result;
}

function getToolSpeedPercent(actionType, profile, itemDetailMap) {
    const statName = TOOL_SPEED_STAT_BY_ACTION_TYPE[actionType];
    if (!statName) {
        return 0;
    }

    let totalFraction = 0;
    for (const item of profile.items) {
        if (!String(item?.itemLocationHrid ?? "").includes("_tool")) {
            continue;
        }
        const baseFraction = toFiniteNumber(
            itemDetailMap?.[item.itemHrid]?.equipmentDetail?.noncombatStats?.[statName],
        );
        const enhancementLevel = Math.max(0, Math.min(
            ENHANCEMENT_BONUS_PERCENT.length - 1,
            Math.floor(toFiniteNumber(item.enhancementLevel)),
        ));
        const enhancementMultiplier = 1 + ENHANCEMENT_BONUS_PERCENT[enhancementLevel] / 100;
        totalFraction += baseFraction * enhancementMultiplier;
    }
    return totalFraction * 100;
}

function sumBuffValue(buffs, typeHrid, field) {
    return buffs
        .filter((buff) => buff.typeHrid === typeHrid)
        .reduce((total, buff) => total + toFiniteNumber(buff[field]), 0);
}

function getEffectiveActionModifiers(action, sourceKind, profile) {
    const buffs = [
        ...(profile.effectiveActionTypeBuffs[action.type] ?? []),
        ...(profile.effectiveActionHridBuffs[action.hrid] ?? []),
    ];
    const skillHrid = action.levelRequirement?.skillHrid;
    const baseSkillLevel = profile.skillLevels[skillHrid];
    const skillBuffType = SKILL_LEVEL_BUFF_TYPE[skillHrid];
    const boostedSkillLevel = baseSkillLevel === undefined
        ? undefined
        : (1 + sumBuffValue(buffs, skillBuffType, "ratioBoost")) * baseSkillLevel
            + sumBuffValue(buffs, skillBuffType, "flatBoost");
    const requiredLevel = toFiniteNumber(action.levelRequirement?.level, 1)
        + sumBuffValue(buffs, "/buff_types/action_level", "flatBoost");
    const levelEfficiency = boostedSkillLevel !== undefined && boostedSkillLevel >= requiredLevel
        ? (boostedSkillLevel - requiredLevel) / 100
        : 0;
    const efficiency = sumBuffValue(buffs, "/buff_types/efficiency", "flatBoost")
        + levelEfficiency;
    const actionSpeed = sumBuffValue(buffs, "/buff_types/action_speed", "flatBoost");
    const taskActionSpeed = sumBuffValue(buffs, "/buff_types/task_action_speed", "flatBoost");
    const quantity = sourceKind === "gathering"
        ? sumBuffValue(buffs, "/buff_types/gathering", "flatBoost")
        : sumBuffValue(buffs, "/buff_types/gourmet", "flatBoost");
    const lessResource = sumBuffValue(buffs, "/buff_types/artisan", "flatBoost");
    return {
        baseSkillLevel,
        actionSpeed,
        taskActionSpeed,
        efficiency,
        quantity,
        lessResource,
    };
}

function calculateConsumableCraftMinutesPerHour({
    consumablesUsed,
    simulatedHours,
    profile,
    actionDetailMap,
    itemDetailMap,
}) {
    const issues = new Set();
    const sourceIndex = buildItemSourceIndex(actionDetailMap);
    const unitCostMemo = new Map();

    if (!profile.hasSkillData) issues.add("defaultSkills");
    if (!profile.hasItemData && !profile.hasEffectiveBuffData) issues.add("defaultTools");
    if (!profile.hasDrinkData) issues.add("defaultDrinks");
    if (!profile.hasBuffData && !profile.hasEffectiveBuffData) issues.add("defaultBuffs");

    const getUnitMinutes = (itemHrid, includeActionDrinks = true, stack = new Set()) => {
        const memoKey = `${itemHrid}:${includeActionDrinks}`;
        if (unitCostMemo.has(memoKey)) {
            return unitCostMemo.get(memoKey);
        }
        if (stack.has(itemHrid)) {
            issues.add(`cycle:${itemHrid}`);
            return 0;
        }

        const source = selectItemSource(itemHrid, sourceIndex, itemDetailMap);
        if (!source || source.expectedYield <= 0) {
            issues.add(`missingAction:${itemHrid}`);
            return 0;
        }

        const action = source.action;
        const requiredSkill = action.levelRequirement?.skillHrid;
        let actionsPerHour;
        let quantityRatio;
        let lessResourceRatio;
        if (profile.hasEffectiveBuffData) {
            const modifiers = getEffectiveActionModifiers(action, source.kind, profile);
            if (modifiers.baseSkillLevel === undefined) {
                issues.add(`missingSkill:${requiredSkill}`);
            }
            const baseSeconds = toFiniteNumber(action.baseTimeCost) / 1e9;
            const actionSeconds = Math.max(
                3,
                baseSeconds
                    / Math.max(0.05, 1 + modifiers.actionSpeed)
                    / Math.max(0.05, 1 + modifiers.taskActionSpeed),
            );
            actionsPerHour = 3600 / actionSeconds * Math.max(0.05, 1 + modifiers.efficiency);
            quantityRatio = modifiers.quantity;
            lessResourceRatio = modifiers.lessResource;
        } else {
            const requiredLevel = toFiniteNumber(action.levelRequirement?.level, 1);
            const currentLevel = profile.skillLevels[requiredSkill];
            if (currentLevel === undefined) {
                issues.add(`missingSkill:${requiredSkill}`);
            }
            const levelEfficiencyPercent = Math.max(0, toFiniteNumber(currentLevel, requiredLevel) - requiredLevel);
            const houseRoomHrid = HOUSE_ROOM_BY_ACTION_TYPE[action.type];
            const houseEfficiencyPercent = toFiniteNumber(profile.houseRooms[houseRoomHrid]) * 1.5;
            const teaBuffs = getTeaBuffs(action.type, profile, itemDetailMap);
            const toolSpeedPercent = getToolSpeedPercent(action.type, profile, itemDetailMap);
            const efficiencyPercent = levelEfficiencyPercent
                + houseEfficiencyPercent
                + teaBuffs.efficiencyPercent
                + profile.buffs.itemEfficiencyPercent
                + profile.buffs.productionEfficiencyPercent;
            actionsPerHour = 3600
                / (toFiniteNumber(action.baseTimeCost) / 1e9)
                * (1 + toolSpeedPercent / 100)
                * (1 + efficiencyPercent / 100);
            const quantityPercent = teaBuffs.quantityPercent
                + (source.kind === "gathering" ? profile.buffs.gatheringQuantityPercent : 0);
            quantityRatio = quantityPercent / 100;
            lessResourceRatio = teaBuffs.lessResourcePercent / 100;
        }
        const yieldPerAction = source.expectedYield * Math.max(0.05, 1 + quantityRatio);
        if (actionsPerHour <= 0 || yieldPerAction <= 0) {
            issues.add(`invalidRate:${itemHrid}`);
            return 0;
        }

        const actionsNeeded = 1 / yieldPerAction;
        const activeHours = actionsNeeded / actionsPerHour;
        let minutes = activeHours * 60;
        const nextStack = new Set(stack);
        nextStack.add(itemHrid);

        const resourceMultiplier = Math.max(0, 1 - lessResourceRatio);
        for (const input of action.inputItems ?? []) {
            const inputQuantity = actionsNeeded * toFiniteNumber(input.count) * resourceMultiplier;
            minutes += getUnitMinutes(input.itemHrid, includeActionDrinks, nextStack) * inputQuantity;
        }

        if (includeActionDrinks) {
            for (const drink of profile.actionTypeDrinkSlots[action.type] ?? []) {
                if (!drink?.itemHrid || drink.itemHrid === itemHrid) {
                    continue;
                }
                const drinkQuantity = 12 * activeHours;
                minutes += getUnitMinutes(drink.itemHrid, false, nextStack) * drinkQuantity;
            }
        }

        unitCostMemo.set(memoKey, minutes);
        return minutes;
    };

    let totalMinutesPerHour = 0;
    const breakdown = [];
    for (const [itemHrid, totalAmount] of Object.entries(consumablesUsed ?? {})) {
        const amountPerHour = toFiniteNumber(totalAmount) / simulatedHours;
        if (amountPerHour <= 0) {
            continue;
        }
        const minutes = getUnitMinutes(itemHrid) * amountPerHour;
        totalMinutesPerHour += minutes;
        breakdown.push({ itemHrid, amountPerHour, minutes });
    }

    return {
        totalMinutesPerHour,
        breakdown,
        issues: [...issues],
    };
}

export function calculateFragmentTimeCosts({
    expectedDropMap,
    simulatedHours,
    consumablesUsed = {},
    productionProfile = {},
    fallbackHouseRooms = {},
    actionDetailMap = {},
    itemDetailMap = {},
}) {
    const hours = toFiniteNumber(simulatedHours);
    if (hours <= 0) {
        return {
            fragments: [],
            craftMinutesPerSimHour: 0,
            breakdown: [],
            mode: "exact",
            issues: ["invalidSimulationTime"],
        };
    }

    const normalizedProfile = normalizeProductionProfile(productionProfile, fallbackHouseRooms);
    const hasConsumables = Object.values(consumablesUsed ?? {}).some((amount) => toFiniteNumber(amount) > 0);
    const craftResult = hasConsumables
        ? calculateConsumableCraftMinutesPerHour({
            consumablesUsed,
            simulatedHours: hours,
            profile: normalizedProfile,
            actionDetailMap,
            itemDetailMap,
        })
        : { totalMinutesPerHour: 0, breakdown: [], issues: [] };

    const getDropAmount = (itemHrid) => expectedDropMap instanceof Map
        ? toFiniteNumber(expectedDropMap.get(itemHrid))
        : toFiniteNumber(expectedDropMap?.[itemHrid]);
    const fragments = KEY_FRAGMENT_HRIDS
        .map((itemHrid) => ({ itemHrid, expectedAmount: getDropAmount(itemHrid) }))
        .filter((fragment) => fragment.expectedAmount > 0)
        .map((fragment) => ({
            ...fragment,
            combatMinutesPerFragment: hours * 60 / fragment.expectedAmount,
            totalMinutesPerFragment: hours
                * (60 + craftResult.totalMinutesPerHour)
                / fragment.expectedAmount,
        }));

    const profileIsComplete = normalizedProfile.complete && craftResult.issues.length === 0;
    return {
        fragments,
        craftMinutesPerSimHour: craftResult.totalMinutesPerHour,
        breakdown: craftResult.breakdown,
        mode: !hasConsumables ? "exact" : (profileIsComplete ? "personalized" : "estimated"),
        issues: craftResult.issues,
    };
}
