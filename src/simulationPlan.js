import { calculateLevelAfterExperience } from "./experienceLevelCalculator.js";

export const SIMULATION_PLAN_SCHEMA_VERSION = 1;
export const SIMULATION_PLAN_STORAGE_KEY = "mwiCombatSimulatorPlans_v1";
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
    {
        code: "图1",
        mapKey: "zone:/actions/combat/smelly_planet",
        targetItemHrid: "/items/blue_key_fragment",
    },
    {
        code: "图2",
        mapKey: "zone:/actions/combat/swamp_planet",
        targetItemHrid: "/items/green_key_fragment",
    },
    {
        code: "图3",
        mapKey: "zone:/actions/combat/aqua_planet",
        targetItemHrid: "/items/blue_key_fragment",
    },
    {
        code: "图4",
        mapKey: "zone:/actions/combat/jungle_planet",
        targetItemHrid: "/items/green_key_fragment",
    },
    {
        code: "图5",
        mapKey: "zone:/actions/combat/gobo_planet",
        targetItemHrid: "/items/purple_key_fragment",
    },
    {
        code: "图6",
        mapKey: "zone:/actions/combat/planet_of_the_eyes",
        targetItemHrid: "/items/white_key_fragment",
    },
    {
        code: "图7",
        mapKey: "zone:/actions/combat/sorcerers_tower",
        targetItemHrid: "/items/orange_key_fragment",
    },
    {
        code: "图8",
        mapKey: "zone:/actions/combat/bear_with_it",
        targetItemHrid: "/items/brown_key_fragment",
    },
    {
        code: "图9",
        mapKey: "zone:/actions/combat/golem_cave",
        targetItemHrid: "/items/stone_key_fragment",
    },
    {
        code: "图10",
        mapKey: "zone:/actions/combat/twilight_zone",
        targetItemHrid: "/items/dark_key_fragment",
    },
    {
        code: "图11",
        mapKey: "zone:/actions/combat/infernal_abyss",
        targetItemHrid: "/items/burning_key_fragment",
    },
    {
        code: "D1",
        mapKey: "dungeon:/actions/combat/chimerical_den",
        targetItemHrid: "/items/chimerical_chest",
        refinementItemHrid: "/items/chimerical_refinement_chest",
    },
    {
        code: "D2",
        mapKey: "dungeon:/actions/combat/sinister_circus",
        targetItemHrid: "/items/sinister_chest",
        refinementItemHrid: "/items/sinister_refinement_chest",
    },
    {
        code: "D3",
        mapKey: "dungeon:/actions/combat/enchanted_fortress",
        targetItemHrid: "/items/enchanted_chest",
        refinementItemHrid: "/items/enchanted_refinement_chest",
    },
    {
        code: "D4",
        mapKey: "dungeon:/actions/combat/pirate_cove",
        targetItemHrid: "/items/pirate_chest",
        refinementItemHrid: "/items/pirate_refinement_chest",
    },
].map((definition, index) => Object.freeze({ ...definition, order: index })));

const MAP_DEFINITION_BY_KEY = new Map(
    SIMULATION_PLAN_MAPS.map((definition) => [definition.mapKey, definition]),
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

function createStepId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `plan-step-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getSimulationPlanMapDefinition(mapKey) {
    return MAP_DEFINITION_BY_KEY.get(String(mapKey ?? "")) ?? null;
}

export function getSimulationPlanMapOrder(mapKey) {
    return getSimulationPlanMapDefinition(mapKey)?.order ?? Number.POSITIVE_INFINITY;
}

export function isSimulationPlanEligibleRecord(record) {
    return Boolean(record && getSimulationPlanMapDefinition(record.mapKey));
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
    return {
        chestPerCompletion: 4 / 3,
        refinementChestPerCompletion: normalizedDifficulty >= 2
            ? 1
            : normalizedDifficulty >= 1
                ? 1 / 3
                : 0,
    };
}

export function createSimulationPlanStep(
    record,
    {
        id = createStepId(),
        targetQuantity = SIMULATION_PLAN_DEFAULT_TARGET_QUANTITY,
        startingLevelsBySlot = {},
    } = {},
) {
    const definition = getSimulationPlanMapDefinition(record?.mapKey);
    if (!definition) {
        throw new Error("This history map is not supported by simulation plans.");
    }

    const isDungeon = record.mapType === "dungeon";
    const dungeonDrops = getDungeonChestExpectations(record.difficulty);
    const completionsPerHour = Math.max(0, toFiniteNumber(record.encountersPerHour));
    const players = (record.players ?? []).map((player) => {
        const targetRatePerHour = isDungeon
            ? completionsPerHour * dungeonDrops.chestPerCompletion
            : toFiniteNumber(player.expectedDropsPerHour?.[definition.targetItemHrid]);
        const extraDropsPerHour = {};
        if (
            isDungeon
            && definition.refinementItemHrid
            && dungeonDrops.refinementChestPerCompletion > 0
        ) {
            extraDropsPerHour[definition.refinementItemHrid] = roundNumber(
                completionsPerHour * dungeonDrops.refinementChestPerCompletion,
            );
        }

        return {
            identity: normalizePlayerIdentity(player.name, player.slot),
            slot: String(player.slot ?? ""),
            name: String(player.name ?? player.playerKey ?? "").trim(),
            loadoutName: String(player.loadoutName ?? "").trim(),
            startingLevels: normalizeStartingLevels(startingLevelsBySlot[player.slot]),
            targetRatePerHour: roundNumber(Math.max(0, targetRatePerHour)),
            extraDropsPerHour,
            experiencePerHour: normalizeRateMap(player.experiencePerHour),
            consumablesPerHour: normalizeRateMap(player.consumablesPerHour),
        };
    });

    return {
        schemaVersion: SIMULATION_PLAN_SCHEMA_VERSION,
        id,
        sourceRecordId: String(record.id ?? ""),
        sourceCreatedAt: String(record.createdAt ?? ""),
        mapKey: definition.mapKey,
        mapType: String(record.mapType ?? ""),
        mapHrid: String(record.mapHrid ?? ""),
        difficulty: Math.max(0, Math.trunc(toFiniteNumber(record.difficulty))),
        targetItemHrid: definition.targetItemHrid,
        refinementItemHrid: definition.refinementItemHrid ?? "",
        targetQuantity: Math.max(0, toFiniteNumber(targetQuantity)),
        players,
    };
}

export function calculateSimulationPlanStep(step) {
    const targetQuantity = Math.max(0, toFiniteNumber(step?.targetQuantity));
    const players = step?.players ?? [];
    const missingRatePlayers = players.filter(
        (player) => toFiniteNumber(player.targetRatePerHour) <= 0,
    );
    const durationHours = players.length > 0 && missingRatePlayers.length === 0
        ? Math.max(...players.map(
            (player) => targetQuantity / toFiniteNumber(player.targetRatePerHour),
        ))
        : Number.POSITIVE_INFINITY;

    return {
        ...step,
        targetQuantity,
        durationHours,
        valid: Number.isFinite(durationHours),
        missingRatePlayers: missingRatePlayers.map((player) => player.name),
        players: players.map((player) => ({
            ...player,
            targetAmount: Number.isFinite(durationHours)
                ? roundNumber(toFiniteNumber(player.targetRatePerHour) * durationHours)
                : 0,
            extraDrops: Number.isFinite(durationHours)
                ? Object.fromEntries(Object.entries(player.extraDropsPerHour ?? {}).map(
                    ([itemHrid, rate]) => [itemHrid, roundNumber(rate * durationHours)],
                ))
                : {},
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
            let summary = playerMap.get(player.identity);
            if (!summary) {
                summary = {
                    identity: player.identity,
                    name: player.name,
                    startingLevels: normalizeStartingLevels(player.startingLevels),
                    experienceGained: {},
                    consumablesUsed: {},
                    expectedDrops: {},
                    stepCount: 0,
                };
                playerMap.set(player.identity, summary);
            }
            summary.stepCount += 1;
            addRateMap(summary.experienceGained, player.experienceGained);
            addRateMap(summary.consumablesUsed, player.consumablesUsed);
            addRateMap(summary.expectedDrops, {
                [step.targetItemHrid]: player.targetAmount,
                ...player.extraDrops,
            });
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
    for (const player of players) {
        addRateMap(consumablesUsed, player.consumablesUsed);
    }

    return {
        valid,
        totalHours,
        steps,
        players,
        consumablesUsed,
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
                ? plan.steps.filter((step) => (
                    step?.schemaVersion === SIMULATION_PLAN_SCHEMA_VERSION
                    && getSimulationPlanMapDefinition(step.mapKey)
                ))
                : [],
        }))
        .filter((plan) => plan.id && plan.name);
}
