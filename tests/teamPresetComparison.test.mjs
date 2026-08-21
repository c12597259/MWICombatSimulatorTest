import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const comparisonSource = await readFile(
    new URL("../src/teamPresetComparison.js", import.meta.url),
    "utf8",
);
const comparisonModuleUrl = `data:text/javascript;base64,${Buffer.from(comparisonSource).toString("base64")}`;
const {
    comparePlayerLoadouts,
    compareTeamPresetWithCurrent,
} = await import(comparisonModuleUrl);

function createPlayerData(overrides = {}) {
    return {
        characterId: "character-1",
        characterName: "Player One",
        player: {
            staminaLevel: 100,
            intelligenceLevel: 100,
            attackLevel: 100,
            meleeLevel: 100,
            defenseLevel: 100,
            rangedLevel: 100,
            magicLevel: 100,
            equipment: [],
        },
        food: { "/action_types/combat": [{ itemHrid: "" }, { itemHrid: "" }, { itemHrid: "" }] },
        drinks: { "/action_types/combat": [{ itemHrid: "" }, { itemHrid: "" }, { itemHrid: "" }] },
        abilities: Array.from({ length: 5 }, () => ({ abilityHrid: "", level: 1 })),
        triggerMap: {},
        houseRooms: {},
        achievements: {},
        ...overrides,
    };
}

test("detects level, equipment replacement, and enhancement changes", () => {
    const baseline = createPlayerData({
        player: {
            ...createPlayerData().player,
            defenseLevel: 110,
            equipment: [
                { itemLocationHrid: "/item_locations/head", itemHrid: "/items/old_helmet", enhancementLevel: 10 },
                { itemLocationHrid: "/item_locations/main_hand", itemHrid: "/items/sword", enhancementLevel: 12 },
            ],
        },
    });
    const current = createPlayerData({
        player: {
            ...createPlayerData().player,
            defenseLevel: 125,
            equipment: [
                { itemLocationHrid: "/item_locations/head", itemHrid: "/items/new_helmet", enhancementLevel: 8 },
                { itemLocationHrid: "/item_locations/main_hand", itemHrid: "/items/sword", enhancementLevel: 14 },
            ],
        },
    });

    const changes = comparePlayerLoadouts(baseline, current);

    assert.deepEqual(
        changes.filter((change) => change.kind === "level").map((change) => [change.field, change.before, change.after]),
        [["defenseLevel", 110, 125]],
    );
    assert.deepEqual(
        changes.filter((change) => change.kind === "equipment").map((change) => change.locationHrid).sort(),
        ["/item_locations/head", "/item_locations/weapon"],
    );
});

test("reports ability slot order, ability level, food, and drink changes", () => {
    const baseline = createPlayerData({
        abilities: [
            { abilityHrid: "/abilities/a", level: 10 },
            { abilityHrid: "/abilities/b", level: 11 },
            { abilityHrid: "", level: 1 },
            { abilityHrid: "", level: 1 },
            { abilityHrid: "", level: 1 },
        ],
        food: { "/action_types/combat": [{ itemHrid: "/items/apple" }] },
        drinks: { "/action_types/combat": [{ itemHrid: "/items/tea" }] },
    });
    const current = createPlayerData({
        abilities: [
            { abilityHrid: "/abilities/b", level: 12 },
            { abilityHrid: "/abilities/a", level: 10 },
            { abilityHrid: "", level: 1 },
            { abilityHrid: "", level: 1 },
            { abilityHrid: "", level: 1 },
        ],
        food: { "/action_types/combat": [{ itemHrid: "/items/orange" }] },
        drinks: { "/action_types/combat": [{ itemHrid: "/items/coffee" }] },
    });

    const changes = comparePlayerLoadouts(baseline, current);

    assert.equal(changes.filter((change) => change.kind === "ability").length, 2);
    assert.equal(changes.filter((change) => change.section === "food").length, 1);
    assert.equal(changes.filter((change) => change.section === "drinks").length, 1);
});

test("treats missing zero-value rooms and false achievements as unchanged", () => {
    const baseline = createPlayerData({
        houseRooms: { "/house_rooms/gym": 0 },
        achievements: { "/achievements/test": false },
    });
    const current = createPlayerData();

    assert.deepEqual(comparePlayerLoadouts(baseline, current), []);
});

test("summarizes trigger changes without exposing every nested value", () => {
    const baseline = createPlayerData({
        triggerMap: { "/abilities/a": [{ comparator: "greater", value: 0.5 }] },
    });
    const current = createPlayerData({
        triggerMap: { "/abilities/a": [{ comparator: "less", value: 0.25 }] },
    });

    const triggerChange = comparePlayerLoadouts(baseline, current)
        .find((change) => change.kind === "triggers");

    assert.ok(triggerChange);
    assert.equal(triggerChange.beforeCount, 1);
    assert.equal(triggerChange.afterCount, 1);
    assert.equal(triggerChange.differenceCount, 2);
});

test("compares the union of preset and currently selected team slots", () => {
    const slotOne = createPlayerData();
    const slotTwo = createPlayerData({ characterId: "character-2", characterName: "Player Two" });
    const slotThree = createPlayerData({ characterId: "character-3", characterName: "Player Three" });
    const preset = {
        selectedPlayers: ["1", "2"],
        playerDataMap: {
            "1": JSON.stringify(slotOne),
            "2": JSON.stringify(slotTwo),
        },
    };
    const currentPlayerDataMap = {
        "1": JSON.stringify(slotOne),
        "3": JSON.stringify(slotThree),
    };

    const result = compareTeamPresetWithCurrent(preset, currentPlayerDataMap, ["1", "3"]);

    assert.deepEqual(result.players.map((player) => [player.slot, player.status]), [
        ["1", "unchanged"],
        ["2", "removed"],
        ["3", "added"],
    ]);
    assert.equal(result.totalChanges, 2);
    assert.equal(result.changedPlayers, 2);
});
