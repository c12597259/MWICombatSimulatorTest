import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const formationSource = await readFile(
    new URL("../src/playerFormation.js", import.meta.url),
    "utf8",
);
const formationModuleUrl = `data:text/javascript;base64,${Buffer.from(formationSource).toString("base64")}`;
const {
    mergeSelectedPlayerFormation,
    normalizePlayerFormation,
    orderSelectedPlayerSlots,
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

test("restores a preset formation while keeping unused slots available", () => {
    assert.deepEqual(
        mergeSelectedPlayerFormation(["4", "2", "5"], ["3", "2", "1", "5", "4"]),
        ["4", "2", "5", "3", "1"],
    );
});
