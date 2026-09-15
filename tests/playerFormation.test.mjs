import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const formationSource = await readFile(
    new URL("../src/playerFormation.js", import.meta.url),
    "utf8",
);
const formationModuleUrl = `data:text/javascript;base64,${Buffer.from(formationSource).toString("base64")}`;
const {
    createFixedPlayerSlotAssignments,
    normalizePlayerFormation,
    orderSelectedPlayerSlots,
    remapPlayerSlotValues,
} = await import(formationModuleUrl);

test("normalizes a saved formation and appends missing player slots", () => {
    assert.deepEqual(
        normalizePlayerFormation(["3", 1, "3", "invalid"]),
        ["3", "1", "2", "4", "5"],
    );
});

test("orders selected players by their visible tab formation", () => {
    assert.deepEqual(
        orderSelectedPlayerSlots(["3", "1", "2", "5", "4"], [1, 2, 3]),
        ["3", "1", "2"],
    );
});

test("moves loadout values between fixed player slots", () => {
    assert.deepEqual(
        remapPlayerSlotValues(
            { "1": "A", "2": "B", "3": "C", "4": "D", "5": "E" },
            ["2", "3", "1", "4", "5"],
        ),
        { "1": "B", "2": "C", "3": "A", "4": "D", "5": "E" },
    );
});

test("maps a legacy preset formation onto the same fixed selected slots", () => {
    assert.deepEqual(
        createFixedPlayerSlotAssignments(["4", "2", "5"]),
        [
            { destinationSlot: "2", sourceSlot: "4" },
            { destinationSlot: "4", sourceSlot: "2" },
            { destinationSlot: "5", sourceSlot: "5" },
        ],
    );
});
