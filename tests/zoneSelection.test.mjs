import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(
    new URL("../src/zoneSelection.js", import.meta.url),
    "utf8",
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
const {
    getSelectableCombatZones,
    isFullMapCombatAction,
    isSingleMonsterCombatAction,
} = await import(moduleUrl);
const actionDetailMap = JSON.parse(await readFile(
    new URL("../src/combatsimulator/data/actionDetailMap.json", import.meta.url),
    "utf8",
));

test("shows only the eleven complete maps when solo selection is disabled", () => {
    const zones = getSelectableCombatZones(actionDetailMap, false);

    assert.equal(zones.length, 11);
    assert.ok(zones.every(isFullMapCombatAction));
    assert.ok(zones.every((zone, index) => index === 0 || zones[index - 1].sortIndex <= zone.sortIndex));
});

test("adds all single-monster actions when solo selection is enabled", () => {
    const zones = getSelectableCombatZones(actionDetailMap, true);
    const soloZones = zones.filter(isSingleMonsterCombatAction);

    assert.equal(soloZones.length, 44);
    assert.equal(zones.length, 55);
    assert.ok(zones.some((zone) => zone.hrid === "/actions/combat/granite_golem"));
});
