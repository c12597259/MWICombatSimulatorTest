import { calculateLevelAfterExperience } from "./experienceLevelCalculator.js";

export const SIMULATION_PLAN_SCHEMA_VERSION = 2;
export const SIMULATION_PLAN_STORAGE_KEY = "mwiCombatSimulatorPlans_v2";
export const SIMULATION_PLAN_LEGACY_STORAGE_KEYS = Object.freeze([
    "mwiCombatSimulatorPlans_v1",
]);
export const SIMULATION_PLAN_DEFAULT_TARGET_QUANTITY = 200;
export const SIMULATION_PLAN_SKILLS = Object.freeze([
    "stamina",
    "intelligence",
    "attack",
    "melee",
    "defense",
    "ranged",
    "magic",
]);

export const SIMULATION_PLAN_MAPS = Object.freeze([
    { code: "图1", mapKey: "zone:/actions/combat/smelly_planet" },
    { code: "图2", mapKey: "zone:/actions/combat/swamp_planet" },
    {
        code: "图3",
        mapKey: "zone:/actions/combat/aqua_planet",
        fragmentItemHrid: "/items/blue_key_fragment",
    },
    {
        code: "图4",
        mapKey: "zone:/actions/combat/jungle_planet",
        fragmentItemHrid: "/items/green_key_fragment",
    },
    {
        code: "图5",
        mapKey: "zone:/actions/combat/gobo_planet",
        fragmentItemHrid: "/items/purple_key_fragment",
    },
    {
        code: "图6",
        mapKey: "zone:/actions/combat/planet_of_the_eyes",
        fragmentItemHrid: "/items/white_key_fragment",
    },
    {
        code: "图7",
        mapKey: "zone:/actions/combat/sorcerers_tower",
        fragmentItemHrid: "/items/orange_key_fragment",
    },
    {
        code: "图8",
        mapKey: "zone:/actions/combat/bear_with_it",
        fragmentItemHrid: "/items/brown_key_fragment",
    },
    {
        code: "图9",
        mapKey: "zone:/actions/combat/golem_cave",
        fragmentItemHrid: "/items/stone_key_fragment",
    },
    {
        code: "图10",
        mapKey: "zone:/actions/combat/twilight_zone",
        fragmentItemHrid: "/items/dark_key_fragment",
    },
    {
        code: "图11",
        mapKey: "zone:/actions/combat/infernal_abyss",
        fragmentItemHrid: "/items/burning_key_fragment",
    },
    { code: "D1", mapKey: "dungeon:/actions/combat/chimerical_den" },
    { code: "D2", mapKey: "dungeon:/actions/combat/sinister_circus" },
    { code: "D3", mapKey: "dungeon:/actions/combat/enchanted_fortress" },
    { code: "D4", mapKey: "dungeon:/actions/combat/pirate_cove" },
].map((definition, index) => Object.freeze({
    ...definition,
    order: index,
    mapType: definition.mapKey.split(":", 1)[0],
    mapHrid: definition.mapKey.slice(definition.mapKey.indexOf(":") + 1),
})));

const MAP_DEFINITION_BY_KEY = new Map(
    SIMULATION_PLAN_MAPS.map((definition) => [definition.mapKey, definition]),
);

const FRAGMENT_TARGETS = SIMULATION_PLAN_MAPS
    .filter((definition) => definition.fragmentItemHrid)
    .map((definition) => ({
        id: definition.fragmentItemHrid,
        type: "fragment",
        code: definition.code,
        itemHrid: definition.fragmentItemHrid,
        sources: [{
            mapKey: definition.mapKey,
            itemHrid: definition.fragmentItemHrid,
            quantityPerTarget: 1,
        }],
    }));

const KEY_TARGETS = [
    {
        id: "/items/chimerical_chest_key",
        type: "key",
        code: "D1",
        itemHrid: "/items/chimerical_chest_key",
        sourceMapKeys: [
            "zone:/actions/combat/aqua_planet",
            "zone:/actions/combat/jungle_planet",
            "zone:/actions/combat/gobo_planet",
            "zone:/actions/combat/planet_of_the_eyes",
        ],
    },
    {
        id: "/items/sinister_chest_key",
        type: "key",
        code: "D2",
        itemHrid: "/items/sinister_chest_key",
        sourceMapKeys: [
            "zone:/actions/combat/gobo_planet",
            "zone:/actions/combat/sorcerers_tower",
            "zone:/actions/combat/bear_with_it",
            "zone:/actions/combat/twilight_zone",
        ],
    },
    {
        id: "/items/enchanted_chest_key",
        type: "key",
        code: "D3",
        itemHrid: "/items/enchanted_chest_key",
        sourceMapKeys: [
            "zone:/actions/combat/sorcerers_tower",
            "zone:/actions/combat/bear_with_it",
            "zone:/actions/combat/golem_cave",
            "zone:/actions/combat/infernal_abyss",
        ],
    },
    {
        id: "/items/pirate_chest_key",
        type: "key",
        code: "D4",
        itemHrid: "/items/pirate_chest_key",
        sourceMapKeys: [
            "zone:/actions/combat/planet_of_the_eyes",
            "zone:/actions/combat/golem_cave",
            "zone:/actions/combat/twilight_zone",
            "zone:/actions/combat/infernal_abyss",
        ],
    },
].map((definition) => ({
    ...definition,
    sources: definition.sourceMapKeys.map((mapKey) => ({
        mapKey,
        itemHrid: MAP_DEFINITION_BY_KEY.get(mapKey).fragmentItemHrid,
        quantityPerTarget: 0.9,
    })),
}));

const DUNGEON_TARGETS = [
    {
        id: "/items/chimerical_chest",
        type: "dungeon",
        code: "D1",
        itemHrid: "/items/chimerical_chest",
        refinementItemHrid: "/items/chimerical_refinement_chest",
        keyItemHrid: "/items/chimerical_chest_key",
        mapKey: "dungeon:/actions/combat/chimerical_den",
    },
    {
        id: "/items/sinister_chest",
        type: "dungeon",
        code: "D2",
        itemHrid: "/items/sinister_chest",
        refinementItemHrid: "/items/sinister_refinement_chest",
        keyItemHrid: "/items/sinister_chest_key",
        mapKey: "dungeon:/actions/combat/sinister_circus",
    },
    {
        id: "/items/enchanted_chest",
        type: "dungeon",
        code: "D3",
        itemHrid: "/items/enchanted_chest",
        refinementItemHrid: "/items/enchanted_refinement_chest",
        keyItemHrid: "/items/enchanted_chest_key",
        mapKey: "dungeon:/actions/combat/enchanted_fortress",
    },
    {
        id: "/items/pirate_chest",
        type: "dungeon",
        code: "D4",
        itemHrid: "/items/pirate_chest",
        refinementItemHrid: "/items/pirate_refinement_chest",
        keyItemHrid: "/items/pirate_chest_key",
        mapKey: "dungeon:/actions/combat/pirate_cove",
    },
].map((definition) => ({
    ...definition,
    sources: [{
        mapKey: definition.mapKey,
        itemHrid: definition.itemHrid,
        quantityPerTarget: 1,
    }],
}));

export const SIMULATION_PLAN_TARGETS = Object.freeze([
    ...FRAGMENT_TARGETS,
    ...KEY_TARGETS,
    ...DUNGEON_TARGETS,
].map((definition) => Object.freeze({
    ...definition,
    sources: Object.freeze(definition.sources.map((source) => Object.freeze({ ...source }))),
})));

const TARGET_DEFINITION_BY_ID = new Map(
    SIMULATION_PLAN_TARGETS.map((definition) => [definition.id, definition]),
);

function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function roundNumber(value, digits = 8) {
    const factor = 10 ** digits;
    return Math.round(toFiniteNumber(value) * factor) / factor;
}

function normalizeRateMap(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    return Object.fromEntries(Object.entries(value)
        .map(([key, amount]) => [key, roundNumber(Math.max(0, amount))])
        .filter(([, amount]) => amount > 0));
}

function addRateMap(target, source, multiplier = 1) {
    for (const [key, value] of Object.entries(source ?? {})) {
        target[key] = roundNumber(
            toFiniteNumber(target[key]) + toFiniteNumber(value) * multiplier,
        );
        if (Math.abs(target[key]) < 1e-8) {
            delete target[key];
        }
    }
}

function normalizeStartingLevels(value) {
    return Object.fromEntries(SIMULATION_PLAN_SKILLS.map((skill) => [
        skill,
        Math.max(1, Math.min(200, Math.trunc(toFiniteNumber(value?.[skill], 1)))),
    ]));
}

function normalizePlayerIdentity(name, slot) {
    const normalizedName = String(name ?? "").trim().toLocaleLowerCase();
    return normalizedName || `slot:${slot}`;
}

function createId(prefix) {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getIdentitySet(players) {
    return new Set((players ?? []).map((player) => player.identity));
}

function identitySetsEqual(left, right) {
    return left.size === right.size && [...left].every((identity) => right.has(identity));
}

function getOrCreatePlayerSummary(playerMap, player) {
    let summary = playerMap.get(player.identity);
    if (!summary) {
        summary = {
            identity: player.identity,
            name: player.name,
            startingLevels: normalizeStartingLevels(player.startingLevels),
            experienceGained: {},
            consumablesUsed: {},
            expectedDrops: {},
            requiredKeys: {},
            stepCount: 0,
        };
        playerMap.set(player.identity, summary);
    }
    return summary;
}

export function getSimulationPlanMapDefinition(mapKey) {
    return MAP_DEFINITION_BY_KEY.get(String(mapKey ?? "")) ?? null;
}

export function getSimulationPlanTargetDefinition(targetId) {
    return TARGET_DEFINITION_BY_ID.get(String(targetId ?? "")) ?? null;
}

export function getSimulationPlanMapOrder(mapKey) {
    return getSimulationPlanMapDefinition(mapKey)?.order ?? Number.POSITIVE_INFINITY;
}

export function compareSimulationPlanMapKeys(leftMapKey, rightMapKey) {
    const leftOrder = getSimulationPlanMapOrder(leftMapKey);
    const rightOrder = getSimulationPlanMapOrder(rightMapKey);
    if (leftOrder === rightOrder) {
        return 0;
    }
    if (!Number.isFinite(leftOrder)) {
        return 1;
    }
    if (!Number.isFinite(rightOrder)) {
        return -1;
    }
    return leftOrder - rightOrder;
}

export function getDungeonChestExpectations(difficulty) {
    const normalizedDifficulty = Math.max(0, Math.trunc(toFiniteNumber(difficulty)));
    const regularChestPerCompletion = 4 / 3;
    const refinementPerRegularChest = normalizedDifficulty >= 2
        ? 1
        : normalizedDifficulty >= 1
            ? 0.33
            : 0;
    return {
        regularChestPerCompletion,
        refinementPerRegularChest,
        refinementChestPerCompletion: regularChestPerCompletion * refinementPerRegularChest,
    };
}

export function createSimulationPlanHistorySource(record, { startingLevelsBySlot = {} } = {}) {
    const mapDefinition = getSimulationPlanMapDefinition(record?.mapKey);
    if (!mapDefinition) {
        throw new Error("This history map is not supported by simulation plans.");
    }

    const isDungeon = record.mapType === "dungeon";
    const dungeonDrops = getDungeonChestExpectations(record.difficulty);
    const completionsPerHour = Math.max(0, toFiniteNumber(record.encountersPerHour));
    const dungeonTarget = DUNGEON_TARGETS.find((target) => target.mapKey === record.mapKey);
    const itemHrid = isDungeon ? dungeonTarget?.itemHrid : mapDefinition.fragmentItemHrid;

    if (!itemHrid) {
        throw new Error("This history map cannot produce a plan target.");
    }

    return {
        recordId: String(record.id ?? ""),
        sourceCreatedAt: String(record.createdAt ?? ""),
        mapKey: mapDefinition.mapKey,
        mapType: String(record.mapType ?? mapDefinition.mapType),
        mapHrid: String(record.mapHrid ?? mapDefinition.mapHrid),
        difficulty: Math.max(0, Math.trunc(toFiniteNumber(record.difficulty))),
        itemHrid,
        refinementPerRegularChest: isDungeon
            ? dungeonDrops.refinementPerRegularChest
            : 0,
        players: (record.players ?? []).map((player) => ({
            identity: normalizePlayerIdentity(player.name, player.slot),
            slot: String(player.slot ?? ""),
            name: String(player.name ?? player.playerKey ?? "").trim(),
            loadoutName: String(player.loadoutName ?? "").trim(),
            startingLevels: normalizeStartingLevels(startingLevelsBySlot[player.slot]),
            itemRatePerHour: roundNumber(Math.max(
                0,
                isDungeon
                    ? completionsPerHour * dungeonDrops.regularChestPerCompletion
                    : toFiniteNumber(player.expectedDropsPerHour?.[itemHrid]),
            )),
            experiencePerHour: normalizeRateMap(player.experiencePerHour),
            consumablesPerHour: normalizeRateMap(player.consumablesPerHour),
        })),
    };
}

export function createSimulationPlanStep(
    targetId,
    {
        id = createId("plan-step"),
        targetQuantity = SIMULATION_PLAN_DEFAULT_TARGET_QUANTITY,
    } = {},
) {
    const definition = getSimulationPlanTargetDefinition(targetId);
    if (!definition) {
        throw new Error("This target is not supported by simulation plans.");
    }
    return {
        schemaVersion: SIMULATION_PLAN_SCHEMA_VERSION,
        id,
        targetId: definition.id,
        targetQuantity: Math.max(0, toFiniteNumber(targetQuantity)),
        sources: definition.sources.map((source) => ({
            ...source,
            historyRecord: null,
        })),
    };
}

export function setSimulationPlanStepHistorySource(step, mapKey, historySource) {
    const source = step?.sources?.find((entry) => entry.mapKey === mapKey);
    if (!source) {
        throw new Error("This map is not required by the selected target.");
    }
    if (historySource && historySource.mapKey !== mapKey) {
        throw new Error("The selected history record belongs to a different map.");
    }
    source.historyRecord = historySource ?? null;
    return step;
}

function calculateSimulationPlanSource(source, targetQuantity) {
    const requiredQuantity = roundNumber(
        Math.max(0, targetQuantity) * Math.max(0, toFiniteNumber(source.quantityPerTarget)),
    );
    const historyRecord = source.historyRecord;
    const players = historyRecord?.players ?? [];
    const missingRatePlayers = players.filter(
        (player) => toFiniteNumber(player.itemRatePerHour) <= 0,
    );
    const selected = Boolean(historyRecord);
    const durationHours = selected && players.length > 0 && missingRatePlayers.length === 0
        ? Math.max(...players.map(
            (player) => requiredQuantity / toFiniteNumber(player.itemRatePerHour),
        ))
        : Number.POSITIVE_INFINITY;

    return {
        ...source,
        requiredQuantity,
        selected,
        valid: Number.isFinite(durationHours),
        durationHours,
        missingRatePlayers: missingRatePlayers.map((player) => player.name),
        players: players.map((player) => ({
            ...player,
            gatheredAmount: Number.isFinite(durationHours)
                ? roundNumber(toFiniteNumber(player.itemRatePerHour) * durationHours)
                : 0,
            experienceGained: Number.isFinite(durationHours)
                ? Object.fromEntries(Object.entries(player.experiencePerHour ?? {}).map(
                    ([skill, rate]) => [skill, roundNumber(rate * durationHours)],
                ))
                : {},
            consumablesUsed: Number.isFinite(durationHours)
                ? Object.fromEntries(Object.entries(player.consumablesPerHour ?? {}).map(
                    ([itemHrid, rate]) => [itemHrid, roundNumber(rate * durationHours)],
                ))
                : {},
        })),
    };
}

export function calculateSimulationPlanStep(step) {
    const definition = getSimulationPlanTargetDefinition(step?.targetId);
    const targetQuantity = Math.max(0, toFiniteNumber(step?.targetQuantity));
    if (!definition) {
        return {
            ...step,
            targetQuantity,
            valid: false,
            invalidReason: "unsupportedTarget",
            durationHours: Number.POSITIVE_INFINITY,
            sources: [],
            players: [],
        };
    }

    const sources = (step.sources ?? []).map((source) => (
        calculateSimulationPlanSource(source, targetQuantity)
    ));
    const allSourcesValid = sources.length === definition.sources.length
        && sources.every((source) => source.valid);
    const sourceIdentitySets = sources.map((source) => getIdentitySet(source.players));
    const teamsMatch = definition.type !== "key"
        || sourceIdentitySets.length === 0
        || sourceIdentitySets.every((set) => identitySetsEqual(set, sourceIdentitySets[0]));
    const valid = allSourcesValid && teamsMatch;
    const durationHours = valid
        ? roundNumber(sources.reduce((total, source) => total + source.durationHours, 0))
        : Number.POSITIVE_INFINITY;
    const playerMap = new Map();

    if (valid) {
        for (const source of sources) {
            for (const player of source.players) {
                const summary = getOrCreatePlayerSummary(playerMap, player);
                addRateMap(summary.experienceGained, player.experienceGained);
                addRateMap(summary.consumablesUsed, player.consumablesUsed);
                addRateMap(summary.expectedDrops, {
                    [source.itemHrid]: player.gatheredAmount,
                });

                if (definition.type === "dungeon") {
                    const refinementAmount = roundNumber(
                        player.gatheredAmount
                            * toFiniteNumber(source.historyRecord.refinementPerRegularChest),
                    );
                    addRateMap(summary.expectedDrops, {
                        [definition.refinementItemHrid]: refinementAmount,
                    });
                    addRateMap(summary.requiredKeys, {
                        [definition.keyItemHrid]: player.gatheredAmount + refinementAmount,
                    });
                }
            }
        }

        if (definition.type === "key") {
            for (const summary of playerMap.values()) {
                addRateMap(summary.expectedDrops, {
                    [definition.itemHrid]: targetQuantity,
                });
                for (const source of sources) {
                    addRateMap(summary.expectedDrops, {
                        [source.itemHrid]: -source.requiredQuantity,
                    });
                }
            }
        }
    }

    for (const summary of playerMap.values()) {
        summary.stepCount = 1;
    }

    return {
        ...step,
        targetQuantity,
        targetDefinition: definition,
        valid,
        invalidReason: !allSourcesValid
            ? "missingHistoryOrRate"
            : !teamsMatch
                ? "teamMismatch"
                : "",
        durationHours,
        sources,
        players: [...playerMap.values()],
    };
}

export function calculateSimulationPlan(plan) {
    const steps = (plan?.steps ?? []).map(calculateSimulationPlanStep);
    const valid = steps.every((step) => step.valid);
    const totalHours = valid
        ? roundNumber(steps.reduce((total, step) => total + step.durationHours, 0))
        : Number.POSITIVE_INFINITY;
    const playerMap = new Map();

    for (const step of steps) {
        if (!step.valid) {
            continue;
        }
        for (const player of step.players) {
            const summary = getOrCreatePlayerSummary(playerMap, player);
            summary.stepCount += 1;
            addRateMap(summary.experienceGained, player.experienceGained);
            addRateMap(summary.consumablesUsed, player.consumablesUsed);
            addRateMap(summary.expectedDrops, player.expectedDrops);
            addRateMap(summary.requiredKeys, player.requiredKeys);
        }
    }

    const players = [...playerMap.values()].map((summary) => ({
        ...summary,
        skills: Object.fromEntries(SIMULATION_PLAN_SKILLS.map((skill) => [
            skill,
            calculateLevelAfterExperience({
                currentLevel: summary.startingLevels[skill],
                gainedExperience: toFiniteNumber(summary.experienceGained[skill]),
            }),
        ])),
    }));

    const consumablesUsed = {};
    const requiredKeys = {};
    for (const player of players) {
        addRateMap(consumablesUsed, player.consumablesUsed);
        addRateMap(requiredKeys, player.requiredKeys);
    }

    return {
        valid,
        totalHours,
        steps,
        players,
        consumablesUsed,
        requiredKeys,
    };
}

function normalizeHistorySource(value, expectedMapKey) {
    if (!value || typeof value !== "object" || value.mapKey !== expectedMapKey) {
        return null;
    }
    return {
        ...value,
        players: Array.isArray(value.players) ? value.players : [],
    };
}

function normalizeStep(value) {
    const definition = getSimulationPlanTargetDefinition(value?.targetId);
    if (
        !definition
        || value?.schemaVersion !== SIMULATION_PLAN_SCHEMA_VERSION
        || !value.id
    ) {
        return null;
    }
    return {
        schemaVersion: SIMULATION_PLAN_SCHEMA_VERSION,
        id: String(value.id),
        targetId: definition.id,
        targetQuantity: Math.max(0, toFiniteNumber(value.targetQuantity)),
        sources: definition.sources.map((requiredSource) => {
            const savedSource = value.sources?.find(
                (source) => source?.mapKey === requiredSource.mapKey,
            );
            return {
                ...requiredSource,
                historyRecord: normalizeHistorySource(
                    savedSource?.historyRecord,
                    requiredSource.mapKey,
                ),
            };
        }),
    };
}

export function normalizeSimulationPlans(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((plan) => plan && typeof plan === "object")
        .map((plan) => ({
            schemaVersion: SIMULATION_PLAN_SCHEMA_VERSION,
            id: String(plan.id ?? ""),
            name: String(plan.name ?? "").trim(),
            createdAt: String(plan.createdAt ?? ""),
            updatedAt: String(plan.updatedAt ?? ""),
            steps: Array.isArray(plan.steps)
                ? plan.steps.map(normalizeStep).filter(Boolean)
                : [],
        }))
        .filter((plan) => plan.id && plan.name);
}
