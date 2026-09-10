import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const historySource = await readFile(
    new URL("../src/simulationHistory.js", import.meta.url),
    "utf8",
);
const historyModuleUrl = `data:text/javascript;base64,${Buffer.from(historySource).toString("base64")}`;
const {
    buildSimulationHistoryRecord,
    compareSimulationHistoryRecords,
    getSimulationHistoryMapDescriptor,
    getSimulationHistoryStorageSummary,
    haveIdenticalSimulationHistoryDropComparisons,
    matchSimulationHistoryPlayers,
    scaleSimulationHistoryComparisonRows,
    sortSimulationHistoryDropRows,
} = await import(historyModuleUrl);

const ONE_HOUR = 60 * 60 * 1e9;

function createSimResult() {
    return {
        zoneName: "/actions/combat/swamp",
        difficultyTier: 2,
        isDungeon: false,
        isLabyrinth: false,
        simulatedTime: ONE_HOUR,
        lastEncounterFinishTime: ONE_HOUR,
        encounters: 120,
        deaths: {
            player1: 2,
            player2: 0,
            "/monsters/frog": 120,
        },
        attacks: {
            player1: {
                "/monsters/frog": {
                    autoAttack: { "100": 36, miss: 4 },
                },
            },
            player2: {
                "/monsters/frog": {
                    autoAttack: { "200": 36 },
                },
            },
            "/monsters/frog": {
                player1: {
                    autoAttack: { "50": 36 },
                },
                player2: {
                    autoAttack: { "25": 36 },
                },
            },
        },
        experienceGained: {
            player1: { stamina: 1800, attack: 1800 },
            player2: { stamina: 3600 },
        },
        consumablesUsed: {
            player1: { "/items/food": 3 },
            player2: { "/items/drink": 4 },
        },
        hitpointsSpent: { player1: { "/items/food": 300 } },
        manaUsed: { player1: { "/abilities/heal": 120 } },
        hitpointsGained: { player1: { "/items/food": 3600 } },
        manapointsGained: { player1: { "/items/drink": 1800 } },
        playerRanOutOfManaTime: {},
        dungeonsCompleted: 0,
        dungeonsFailed: 0,
        labyAttemptCount: 0,
        maxWaveReached: 0,
        maxEnrageStack: 1,
    };
}

test("builds a compact per-player history record with consumables and expected drops", () => {
    const record = buildSimulationHistoryRecord({
        simResult: createSimResult(),
        players: [
            { slot: 1, playerKey: "player1", name: "Alice" },
            { slot: 2, playerKey: "player2", name: "Bob" },
        ],
        expectedDropsByPlayer: {
            player1: { "/items/coin": 20 },
            player2: { "/items/coin": 10 },
        },
        teamPresetName: "Alice-Loadout Bob-Loadout",
        id: "record-1",
        completedAt: "2026-08-29T00:00:00.000Z",
    });

    assert.equal(record.mapKey, "zone:/actions/combat/swamp");
    assert.equal(record.difficulty, 2);
    assert.equal(record.encountersPerHour, 120);
    assert.equal(record.monsterKillsPerHour["/monsters/frog"], 120);
    assert.equal(record.players.length, 2);

    const alice = record.players[0];
    assert.equal(alice.dps, 1);
    assert.equal(alice.damageTakenPerSecond, 0.5);
    assert.equal(alice.deathsPerHour, 2);
    assert.equal(alice.totalExperiencePerHour, 3600);
    assert.equal(alice.consumablesPerHour["/items/food"], 3);
    assert.equal(alice.expectedDropsPerHour["/items/coin"], 20);
    assert.equal(alice.hitpointsSpentPerHour, 300);
    assert.equal(alice.hitpointsRestoredPerSecond, 1);
});

test("distinguishes normal zones, dungeons, and labyrinths without splitting difficulty", () => {
    assert.deepEqual(
        getSimulationHistoryMapDescriptor({ zoneName: "/zone/a", difficultyTier: 4 }),
        { mapKey: "zone:/zone/a", mapType: "zone", mapHrid: "/zone/a", difficulty: 4 },
    );
    assert.deepEqual(
        getSimulationHistoryMapDescriptor({ zoneName: "/dungeon/a", difficultyTier: 1, isDungeon: true }),
        { mapKey: "dungeon:/dungeon/a", mapType: "dungeon", mapHrid: "/dungeon/a", difficulty: 1 },
    );
    assert.deepEqual(
        getSimulationHistoryMapDescriptor({ labyrinthName: "/monster/a", roomLevel: 140, isLabyrinth: true }),
        { mapKey: "labyrinth:/monster/a", mapType: "labyrinth", mapHrid: "/monster/a", difficulty: 140 },
    );
});

test("matches the same character by name even when team slots change", () => {
    const baseline = [
        { slot: "1", name: "Alice" },
        { slot: "2", name: "Bob" },
    ];
    const comparison = [
        { slot: "1", name: "Bob" },
        { slot: "2", name: "Alice" },
    ];

    const pairs = matchSimulationHistoryPlayers(baseline, comparison);
    assert.deepEqual(
        pairs.map((pair) => [pair.baseline?.name, pair.comparison?.name]),
        [["Alice", "Alice"], ["Bob", "Bob"]],
    );
});

test("compares player metrics and the union of item rates", () => {
    const baseline = {
        mapKey: "zone:/zone/a",
        encountersPerHour: 10,
        players: [{
            slot: "1",
            name: "Alice",
            dps: 100,
            damageTakenPerSecond: 50,
            deathsPerHour: 2,
            totalExperiencePerHour: 1000,
            consumablesPerHour: { "/items/food": 5 },
            expectedDropsPerHour: { "/items/a": 2 },
            experiencePerHour: { attack: 500 },
        }],
    };
    const comparison = {
        mapKey: "zone:/zone/a",
        encountersPerHour: 12,
        players: [{
            slot: "2",
            name: "Alice",
            dps: 125,
            damageTakenPerSecond: 40,
            deathsPerHour: 1,
            totalExperiencePerHour: 1200,
            consumablesPerHour: { "/items/drink": 3 },
            expectedDropsPerHour: { "/items/a": 3, "/items/b": 1 },
            experiencePerHour: { attack: 600 },
        }],
    };

    const result = compareSimulationHistoryRecords(baseline, comparison);
    assert.equal(result.sameMap, true);
    assert.equal(result.summary.encountersPerHour.delta, 2);
    assert.equal(result.players[0].metrics.dps.delta, 25);
    assert.deepEqual(
        result.players[0].consumables.map((item) => item.key),
        ["/items/drink", "/items/food"],
    );
    assert.deepEqual(
        result.players[0].drops.map((item) => [item.key, item.delta]),
        [["/items/a", 1], ["/items/b", 1]],
    );
});

test("scales only displayed drop comparisons to 24 hours", () => {
    const [scaled] = scaleSimulationHistoryComparisonRows([{
        key: "/items/rare_drop",
        baseline: 0.125,
        comparison: 0.25,
        delta: 0.125,
        percent: 100,
    }]);

    assert.deepEqual(scaled, {
        key: "/items/rare_drop",
        baseline: 3,
        comparison: 6,
        delta: 3,
        percent: 100,
    });
});

test("orders important drop types before other items", () => {
    const rows = [
        { key: "/items/log" },
        { key: "/items/swamp_essence" },
        { key: "/items/advanced_attack_charm" },
        { key: "/items/blue_key_fragment" },
        { key: "/items/coin" },
    ];

    assert.deepEqual(
        sortSimulationHistoryDropRows(rows).map((row) => row.key),
        [
            "/items/coin",
            "/items/blue_key_fragment",
            "/items/advanced_attack_charm",
            "/items/swamp_essence",
            "/items/log",
        ],
    );
});

test("detects when every player's drop comparison is identical", () => {
    const identicalDrops = [
        { key: "/items/coin", baseline: 10, comparison: 12 },
        { key: "/items/blue_key_fragment", baseline: 0.1, comparison: 0.2 },
    ];
    const comparisons = ["Alice", "Bob", "Carol"].map((name) => ({
        baseline: { name },
        comparison: { name },
        drops: structuredClone(identicalDrops),
    }));

    assert.equal(haveIdenticalSimulationHistoryDropComparisons(comparisons), true);
    comparisons[2].drops[0].comparison = 13;
    assert.equal(haveIdenticalSimulationHistoryDropComparisons(comparisons), false);
    assert.equal(haveIdenticalSimulationHistoryDropComparisons(comparisons.slice(0, 1)), false);
});

test("reports the serialized history size", () => {
    const summary = getSimulationHistoryStorageSummary([{ id: "one" }, { id: "two" }]);
    assert.equal(summary.count, 2);
    assert.ok(summary.bytes > 0);
});
