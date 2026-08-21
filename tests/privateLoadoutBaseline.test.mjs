import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
    new URL("../src/privateLoadoutBaseline.js", import.meta.url),
    "utf8",
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
    buildPrivateLoadoutReferences,
    resolvePrivateLoadoutBaseline,
} = await import(moduleUrl);

function makePlayerData(overrides = {}) {
    return {
        characterName: "角色甲",
        loadoutName: "配装甲",
        gameMode: "ironcow",
        player: { attackLevel: 100, equipment: [] },
        ...overrides,
    };
}

function makePreset() {
    return {
        id: "preset-1",
        name: "角色甲-配装甲 角色乙-配装乙",
        selectedPlayers: ["1", "2"],
        playerNames: { "1": "角色甲", "2": "角色乙" },
        playerDataMap: {
            "1": JSON.stringify(makePlayerData({
                privateSnapshot: {
                    characterId: "character-1",
                    loadoutId: "loadout-1",
                    gameMode: "ironcow",
                },
            })),
            "2": JSON.stringify(makePlayerData({
                characterName: "角色乙",
                loadoutName: "配装乙",
                gameMode: "standard",
            })),
        },
    };
}

test("prefers the explicit per-preset loadout mapping over snapshot metadata", () => {
    const preset = makePreset();
    preset.loadoutReferences = {
        "1": {
            characterId: "explicit-character",
            characterName: "显式角色",
            loadoutId: "explicit-loadout",
            loadoutName: "显式配装",
            gameMode: "standard",
        },
    };

    const [reference] = buildPrivateLoadoutReferences(preset);
    assert.deepEqual(reference, {
        slot: "1",
        characterId: "explicit-character",
        characterName: "显式角色",
        loadoutId: "explicit-loadout",
        loadoutName: "显式配装",
        gameMode: "standard",
    });
});

test("builds per-slot server references from preset loadout metadata", () => {
    const references = buildPrivateLoadoutReferences(makePreset());

    assert.deepEqual(references, [
        {
            slot: "1",
            characterId: "character-1",
            characterName: "角色甲",
            loadoutId: "loadout-1",
            loadoutName: "配装甲",
            gameMode: "ironcow",
        },
        {
            slot: "2",
            characterId: "",
            characterName: "角色乙",
            loadoutId: "",
            loadoutName: "配装乙",
            gameMode: "standard",
        },
    ]);
});

test("replaces matched slots with latest server loadouts and keeps explicit fallbacks", () => {
    const preset = makePreset();
    const response = {
        results: [
            {
                slot: "1",
                status: "matched",
                matchMethod: "character-id+loadout-id",
                characterId: "character-1",
                characterName: "角色甲",
                loadoutId: "loadout-1",
                loadoutName: "配装甲",
                gameMode: "ironcow",
                data: makePlayerData({ player: { attackLevel: 135, equipment: [] } }),
            },
            { slot: "2", status: "missing-loadout" },
        ],
    };

    const resolution = resolvePrivateLoadoutBaseline(preset, response);
    const slotOne = JSON.parse(resolution.baselinePreset.playerDataMap["1"]);
    const slotTwo = JSON.parse(resolution.baselinePreset.playerDataMap["2"]);

    assert.equal(slotOne.player.attackLevel, 135);
    assert.equal(slotOne.characterId, "character-1");
    assert.equal(slotOne.loadoutId, "loadout-1");
    assert.equal(slotTwo.player.attackLevel, 100);
    assert.deepEqual(resolution.matchedSlots.map((entry) => entry.slot), ["1"]);
    assert.deepEqual(
        resolution.fallbackSlots.map((entry) => [entry.slot, entry.reason]),
        [["2", "missing-loadout"]],
    );
    assert.equal(resolution.usesServerData, true);
    assert.equal(resolution.allMatched, false);
});

test("falls back to every saved preset snapshot when the bridge is unavailable", () => {
    const preset = makePreset();
    const resolution = resolvePrivateLoadoutBaseline(
        preset,
        { errorCode: "bridge-unavailable", results: [] },
        "bridge-unavailable",
    );

    assert.deepEqual(resolution.baselinePreset.playerDataMap, preset.playerDataMap);
    assert.equal(resolution.matchedSlots.length, 0);
    assert.deepEqual(
        resolution.fallbackSlots.map((entry) => entry.reason),
        ["bridge-unavailable", "bridge-unavailable"],
    );
});
