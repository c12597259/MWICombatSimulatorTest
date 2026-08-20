import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
    new URL("../src/privateSnapshotStore.js", import.meta.url),
    "utf8",
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const {
    buildPrivatePlayerImportData,
    groupPrivateSnapshotSummaries,
} = await import(moduleUrl);

function summary(snapshotId, receivedAt, characters) {
    return {
        snapshotId,
        receivedAt,
        loadoutCount: characters.length,
        characters: characters.map(([characterId, characterName, gameMode = "ironcow"]) => ({
            characterId,
            characterName,
            gameMode,
            loadoutCount: 1,
        })),
    };
}

test("groups partial and complete histories by overlapping character IDs", () => {
    const groups = groupPrivateSnapshotSummaries([
        summary("20260820T174306005485Z-c336ec5e2946", "2026-08-20T17:43:06Z", [
            ["b1", "B1", "standard"],
            ["b2", "B2"],
        ]),
        summary("20260820T174252076894Z-f925746c3d5c", "2026-08-20T17:42:52Z", [
            ["a1", "A1", "standard"],
            ["a2", "A2"],
            ["a3", "A3"],
            ["a4", "A4"],
        ]),
        summary("20260820T173357660621Z-c00bfa77d1fc", "2026-08-20T17:33:57Z", [
            ["a2", "A2"],
            ["a3", "A3"],
            ["a4", "A4"],
        ]),
    ]);

    assert.equal(groups.length, 2);
    assert.equal(groups[0].snapshots.length, 1);
    assert.equal(groups[1].snapshots.length, 2);
    assert.equal(groups[1].latestSnapshotId, "20260820T174252076894Z-f925746c3d5c");
    assert.deepEqual(groups[1].characters.map(character => character.characterName), ["A1", "A2", "A3", "A4"]);
});

test("builds simulator import data without mutating the server snapshot", () => {
    const loadout = {
        loadoutName: "Dungeon",
        simulationInput: {
            player: { attackLevel: 100, equipment: [] },
            food: { "/action_types/combat": [] },
        },
    };
    const original = JSON.stringify(loadout);
    const result = buildPrivatePlayerImportData({
        snapshotId: "20260820T174252076894Z-f925746c3d5c",
        character: { characterId: "a1", characterName: "A1", gameMode: "standard" },
        loadout,
    });

    assert.equal(result.characterName, "A1");
    assert.equal(result.loadoutName, "Dungeon");
    assert.equal(result.privateSnapshot.characterId, "a1");
    assert.notEqual(result, loadout.simulationInput);
    assert.equal(JSON.stringify(loadout), original);
});

test("rejects loadouts without simulator player data", () => {
    assert.throws(() => buildPrivatePlayerImportData({
        snapshotId: "20260820T174252076894Z-f925746c3d5c",
        character: { characterId: "a1", characterName: "A1" },
        loadout: { loadoutName: "Broken", simulationInput: {} },
    }), /Invalid private snapshot loadout/);
});
