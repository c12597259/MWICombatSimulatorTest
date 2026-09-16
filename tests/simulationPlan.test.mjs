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
    calculateSimulationPlan,
    calculateSimulationPlanStep,
    compareSimulationPlanMapKeys,
    createSimulationPlanStep,
    getDungeonChestExpectations,
    isSimulationPlanEligibleRecord,
    normalizeSimulationPlans,
} = await import(planModuleUrl);

function createZoneRecord() {
    return {
        id: "zone-record",
        createdAt: "2026-09-16T00:00:00.000Z",
        mapKey: "zone:/actions/combat/golem_cave",
        mapType: "zone",
        mapHrid: "/actions/combat/golem_cave",
        difficulty: 3,
        encountersPerHour: 40,
        players: [
            {
                slot: "1",
                name: "Alice",
                loadoutName: "Tank",
                expectedDropsPerHour: { "/items/stone_key_fragment": 4 },
                experiencePerHour: { stamina: 33 },
                consumablesPerHour: { "/items/food": 2 },
            },
            {
                slot: "2",
                name: "Bob",
                loadoutName: "Damage",
                expectedDropsPerHour: { "/items/stone_key_fragment": 2 },
                experiencePerHour: { attack: 10 },
                consumablesPerHour: { "/items/drink": 1 },
            },
        ],
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

test("defines the eleven zones followed by the four dungeons in plan order", () => {
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

test("accepts only the configured world maps and dungeons for plans", () => {
    assert.equal(isSimulationPlanEligibleRecord(createZoneRecord()), true);
    assert.equal(isSimulationPlanEligibleRecord({
        mapKey: "zone:/actions/combat/granite_golem",
    }), false);
});

test("uses exact per-completion dungeon chest expectations for T0 through T2", () => {
    assert.deepEqual(getDungeonChestExpectations(0), {
        chestPerCompletion: 4 / 3,
        refinementChestPerCompletion: 0,
    });
    assert.deepEqual(getDungeonChestExpectations(1), {
        chestPerCompletion: 4 / 3,
        refinementChestPerCompletion: 1 / 3,
    });
    assert.deepEqual(getDungeonChestExpectations(2), {
        chestPerCompletion: 4 / 3,
        refinementChestPerCompletion: 1,
    });
});

test("uses the slowest character so every character reaches the fragment target", () => {
    const step = createSimulationPlanStep(createZoneRecord(), {
        targetQuantity: 200,
        startingLevelsBySlot: {
            1: { stamina: 1 },
            2: { attack: 10 },
        },
    });
    const result = calculateSimulationPlanStep(step);

    assert.equal(result.durationHours, 100);
    assert.equal(result.players[0].targetAmount, 400);
    assert.equal(result.players[1].targetAmount, 200);
    assert.equal(result.players[0].experienceGained.stamina, 3300);
    assert.equal(result.players[0].consumablesUsed["/items/food"], 200);
});

test("derives regular and refinement chest totals from dungeon completions", () => {
    const t1Step = calculateSimulationPlanStep(createSimulationPlanStep(
        createDungeonRecord(1),
        { targetQuantity: 200 },
    ));
    const t2Step = calculateSimulationPlanStep(createSimulationPlanStep(
        createDungeonRecord(2),
        { targetQuantity: 200 },
    ));

    assert.equal(t1Step.durationHours, 25);
    assert.equal(t1Step.players[0].targetAmount, 200);
    assert.equal(t1Step.players[0].extraDrops["/items/chimerical_refinement_chest"], 50);
    assert.equal(t2Step.durationHours, 25);
    assert.equal(t2Step.players[0].extraDrops["/items/chimerical_refinement_chest"], 150);
});

test("aggregates sequential time, consumables, experience, drops, and final levels", () => {
    const zoneStep = createSimulationPlanStep(createZoneRecord(), {
        targetQuantity: 200,
        startingLevelsBySlot: { 1: { stamina: 1 }, 2: { attack: 10 } },
    });
    const dungeonStep = createSimulationPlanStep(createDungeonRecord(1), {
        targetQuantity: 200,
        startingLevelsBySlot: { 1: { stamina: 50 } },
    });
    const result = calculateSimulationPlan({ steps: [zoneStep, dungeonStep] });
    const alice = result.players.find((player) => player.name === "Alice");

    assert.equal(result.valid, true);
    assert.equal(result.totalHours, 125);
    assert.equal(alice.startingLevels.stamina, 1);
    assert.equal(alice.experienceGained.stamina, 5800);
    assert.equal(alice.skills.stamina.level, 23);
    assert.equal(alice.consumablesUsed["/items/food"], 212.5);
    assert.equal(alice.expectedDrops["/items/stone_key_fragment"], 400);
    assert.equal(alice.expectedDrops["/items/chimerical_chest"], 200);
    assert.equal(alice.expectedDrops["/items/chimerical_refinement_chest"], 50);
    assert.equal(result.consumablesUsed["/items/food"], 212.5);
});

test("drops unsupported or incompatible steps while normalizing saved plans", () => {
    const validStep = createSimulationPlanStep(createZoneRecord());
    const [plan] = normalizeSimulationPlans([{
        id: "plan-1",
        name: "Route",
        steps: [validStep, { schemaVersion: 1, mapKey: "zone:/actions/combat/fly" }],
    }]);

    assert.equal(plan.steps.length, 1);
    assert.equal(plan.steps[0].mapKey, validStep.mapKey);
});
