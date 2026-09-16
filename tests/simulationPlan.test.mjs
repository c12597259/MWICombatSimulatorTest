import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const experienceSource = await readFile(
    new URL("../src/experienceLevelCalculator.js", import.meta.url),
    "utf8",
);
const experienceModuleUrl = `data:text/javascript;base64,${Buffer.from(experienceSource).toString("base64")}`;
const planSource = (await readFile(
    new URL("../src/simulationPlan.js", import.meta.url),
    "utf8",
)).replace("./experienceLevelCalculator.js", experienceModuleUrl);
const planModuleUrl = `data:text/javascript;base64,${Buffer.from(planSource).toString("base64")}`;
const {
    SIMULATION_PLAN_MAPS,
    SIMULATION_PLAN_TARGETS,
    calculateSimulationPlan,
    calculateSimulationPlanStep,
    compareSimulationPlanMapKeys,
    createSimulationPlanHistorySource,
    createSimulationPlanStep,
    getDungeonChestExpectations,
    getSimulationPlanTargetDefinition,
    normalizeSimulationPlans,
    setSimulationPlanStepHistorySource,
} = await import(planModuleUrl);

const MAPS = {
    blue: "zone:/actions/combat/aqua_planet",
    green: "zone:/actions/combat/jungle_planet",
    purple: "zone:/actions/combat/gobo_planet",
    white: "zone:/actions/combat/planet_of_the_eyes",
};

const FRAGMENTS = {
    [MAPS.blue]: "/items/blue_key_fragment",
    [MAPS.green]: "/items/green_key_fragment",
    [MAPS.purple]: "/items/purple_key_fragment",
    [MAPS.white]: "/items/white_key_fragment",
};

function createZoneRecord(mapKey = MAPS.blue, rates = [4, 2]) {
    const itemHrid = FRAGMENTS[mapKey];
    return {
        id: `${mapKey}-${rates.join("-")}`,
        createdAt: "2026-09-16T00:00:00.000Z",
        mapKey,
        mapType: "zone",
        mapHrid: mapKey.split(":")[1],
        difficulty: 3,
        encountersPerHour: 40,
        players: rates.map((rate, index) => ({
            slot: String(index + 1),
            name: index === 0 ? "Alice" : "Bob",
            loadoutName: index === 0 ? "Tank" : "Damage",
            expectedDropsPerHour: { [itemHrid]: rate },
            experiencePerHour: index === 0 ? { stamina: 33 } : { attack: 10 },
            consumablesPerHour: index === 0
                ? { "/items/food": 2 }
                : { "/items/drink": 1 },
        })),
    };
}

function createDungeonRecord(difficulty = 1) {
    return {
        id: `dungeon-record-${difficulty}`,
        createdAt: "2026-09-16T01:00:00.000Z",
        mapKey: "dungeon:/actions/combat/chimerical_den",
        mapType: "dungeon",
        mapHrid: "/actions/combat/chimerical_den",
        difficulty,
        encountersPerHour: 6,
        players: [{
            slot: "1",
            name: "Alice",
            loadoutName: "Dungeon",
            expectedDropsPerHour: {},
            experiencePerHour: { stamina: 100 },
            consumablesPerHour: { "/items/food": 0.5 },
        }],
    };
}

function sourceFor(record) {
    return createSimulationPlanHistorySource(record, {
        startingLevelsBySlot: {
            1: { stamina: 1 },
            2: { attack: 10 },
        },
    });
}

test("defines the eleven zones followed by the four dungeons in history order", () => {
    assert.equal(SIMULATION_PLAN_MAPS.length, 15);
    assert.deepEqual(
        SIMULATION_PLAN_MAPS.map((entry) => entry.code),
        ["图1", "图2", "图3", "图4", "图5", "图6", "图7", "图8", "图9", "图10", "图11", "D1", "D2", "D3", "D4"],
    );
    assert.ok(compareSimulationPlanMapKeys(
        "zone:/actions/combat/golem_cave",
        "dungeon:/actions/combat/chimerical_den",
    ) < 0);
});

test("offers nine fragment targets starting at Map 3", () => {
    const targets = SIMULATION_PLAN_TARGETS.filter((entry) => entry.type === "fragment");
    assert.equal(targets.length, 9);
    assert.deepEqual(
        targets.map((entry) => entry.code),
        ["图3", "图4", "图5", "图6", "图7", "图8", "图9", "图10", "图11"],
    );
    assert.equal(targets[0].itemHrid, "/items/blue_key_fragment");
    assert.equal(targets[1].itemHrid, "/items/green_key_fragment");
});

test("uses four mapped zones and 0.9 fragment per complete chest key", () => {
    const expectedMaps = {
        "/items/chimerical_chest_key": [3, 4, 5, 6],
        "/items/sinister_chest_key": [5, 7, 8, 10],
        "/items/enchanted_chest_key": [7, 8, 9, 11],
        "/items/pirate_chest_key": [6, 9, 10, 11],
    };
    for (const [targetId, mapNumbers] of Object.entries(expectedMaps)) {
        const target = getSimulationPlanTargetDefinition(targetId);
        assert.equal(target.type, "key");
        assert.deepEqual(
            target.sources.map((source) => (
                Number(SIMULATION_PLAN_MAPS.find(
                    (map) => map.mapKey === source.mapKey,
                ).code.slice(1))
            )),
            mapNumbers,
        );
        assert.deepEqual(
            target.sources.map((source) => source.quantityPerTarget),
            [0.9, 0.9, 0.9, 0.9],
        );
    }
});

test("bases refinement chests on regular chest quantity", () => {
    assert.deepEqual(getDungeonChestExpectations(0), {
        regularChestPerCompletion: 4 / 3,
        refinementPerRegularChest: 0,
        refinementChestPerCompletion: 0,
    });
    assert.deepEqual(getDungeonChestExpectations(1), {
        regularChestPerCompletion: 4 / 3,
        refinementPerRegularChest: 0.33,
        refinementChestPerCompletion: 0.44,
    });
    assert.deepEqual(getDungeonChestExpectations(2), {
        regularChestPerCompletion: 4 / 3,
        refinementPerRegularChest: 1,
        refinementChestPerCompletion: 4 / 3,
    });
});

test("selects the slowest character for a fragment target", () => {
    const step = createSimulationPlanStep("/items/blue_key_fragment", {
        targetQuantity: 200,
    });
    setSimulationPlanStepHistorySource(step, MAPS.blue, sourceFor(createZoneRecord()));
    const result = calculateSimulationPlanStep(step);

    assert.equal(result.valid, true);
    assert.equal(result.durationHours, 100);
    assert.equal(result.players[0].expectedDrops["/items/blue_key_fragment"], 400);
    assert.equal(result.players[1].expectedDrops["/items/blue_key_fragment"], 200);
    assert.equal(result.players[0].experienceGained.stamina, 3300);
    assert.equal(result.players[0].consumablesUsed["/items/food"], 200);
});

test("expands a complete key target into four sequential map histories", () => {
    const step = createSimulationPlanStep("/items/chimerical_chest_key", {
        targetQuantity: 100,
    });
    for (const mapKey of [MAPS.blue, MAPS.green, MAPS.purple, MAPS.white]) {
        setSimulationPlanStepHistorySource(
            step,
            mapKey,
            sourceFor(createZoneRecord(mapKey, [10, 10])),
        );
    }
    const result = calculateSimulationPlanStep(step);

    assert.equal(result.valid, true);
    assert.equal(result.durationHours, 36);
    assert.deepEqual(result.sources.map((source) => source.requiredQuantity), [90, 90, 90, 90]);
    assert.equal(result.players[0].expectedDrops["/items/chimerical_chest_key"], 100);
    assert.equal(result.players[0].expectedDrops["/items/blue_key_fragment"], undefined);
    assert.equal(result.players[0].consumablesUsed["/items/food"], 72);
});

test("rejects a complete key target when source teams do not match", () => {
    const step = createSimulationPlanStep("/items/chimerical_chest_key", {
        targetQuantity: 100,
    });
    for (const mapKey of [MAPS.blue, MAPS.green, MAPS.purple, MAPS.white]) {
        const record = createZoneRecord(mapKey, [10, 10]);
        if (mapKey === MAPS.white) {
            record.players[1].name = "Charlie";
        }
        setSimulationPlanStepHistorySource(step, mapKey, sourceFor(record));
    }
    const result = calculateSimulationPlanStep(step);

    assert.equal(result.valid, false);
    assert.equal(result.invalidReason, "teamMismatch");
});

test("calculates refinement chests and opening keys from regular chest output", () => {
    const t1Step = createSimulationPlanStep("/items/chimerical_chest", {
        targetQuantity: 80,
    });
    setSimulationPlanStepHistorySource(
        t1Step,
        "dungeon:/actions/combat/chimerical_den",
        sourceFor(createDungeonRecord(1)),
    );
    const t2Step = createSimulationPlanStep("/items/chimerical_chest", {
        targetQuantity: 80,
    });
    setSimulationPlanStepHistorySource(
        t2Step,
        "dungeon:/actions/combat/chimerical_den",
        sourceFor(createDungeonRecord(2)),
    );

    const t1Result = calculateSimulationPlanStep(t1Step);
    const t2Result = calculateSimulationPlanStep(t2Step);
    assert.equal(t1Result.durationHours, 10);
    assert.equal(t1Result.players[0].expectedDrops["/items/chimerical_refinement_chest"], 26.4);
    assert.equal(t1Result.players[0].requiredKeys["/items/chimerical_chest_key"], 106.4);
    assert.equal(t2Result.players[0].expectedDrops["/items/chimerical_refinement_chest"], 80);
    assert.equal(t2Result.players[0].requiredKeys["/items/chimerical_chest_key"], 160);
});

test("aggregates sequential time, consumables, experience, drops, keys, and final levels", () => {
    const fragmentStep = createSimulationPlanStep("/items/blue_key_fragment", {
        targetQuantity: 200,
    });
    setSimulationPlanStepHistorySource(fragmentStep, MAPS.blue, sourceFor(createZoneRecord()));
    const dungeonStep = createSimulationPlanStep("/items/chimerical_chest", {
        targetQuantity: 80,
    });
    setSimulationPlanStepHistorySource(
        dungeonStep,
        "dungeon:/actions/combat/chimerical_den",
        sourceFor(createDungeonRecord(1)),
    );

    const result = calculateSimulationPlan({ steps: [fragmentStep, dungeonStep] });
    const alice = result.players.find((player) => player.name === "Alice");
    assert.equal(result.valid, true);
    assert.equal(result.totalHours, 110);
    assert.equal(alice.experienceGained.stamina, 4300);
    assert.equal(alice.skills.stamina.level, 21);
    assert.equal(alice.consumablesUsed["/items/food"], 205);
    assert.equal(alice.expectedDrops["/items/blue_key_fragment"], 400);
    assert.equal(alice.expectedDrops["/items/chimerical_chest"], 80);
    assert.equal(alice.requiredKeys["/items/chimerical_chest_key"], 106.4);
    assert.equal(result.requiredKeys["/items/chimerical_chest_key"], 106.4);
});

test("drops old-schema and unsupported steps while normalizing saved plans", () => {
    const validStep = createSimulationPlanStep("/items/blue_key_fragment");
    const [plan] = normalizeSimulationPlans([{
        id: "plan-1",
        name: "Route",
        steps: [
            validStep,
            { schemaVersion: 1, id: "old", targetId: "/items/blue_key_fragment" },
            { schemaVersion: 2, id: "bad", targetId: "/items/not_real" },
        ],
    }]);

    assert.equal(plan.steps.length, 1);
    assert.equal(plan.steps[0].targetId, validStep.targetId);
});
