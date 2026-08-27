import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const combatUnitSource = await readFile(
    new URL("../src/combatsimulator/combatUnit.js", import.meta.url),
    "utf8",
);
const combatUnitModuleUrl = `data:text/javascript;base64,${Buffer.from(combatUnitSource).toString("base64")}`;
const { default: CombatUnit } = await import(combatUnitModuleUrl);

test("adds per-character guild shrine buffs to permanent combat buffs", () => {
    const unit = new CombatUnit();
    unit.guildCombatBuffs = [
        {
            uniqueHrid: "guild:damage:0",
            typeHrid: "/buff_types/damage",
            flatBoost: 0,
            ratioBoost: 0.08,
            duration: 0,
        },
        {
            uniqueHrid: "guild:damage:1",
            typeHrid: "/buff_types/damage",
            flatBoost: 0.02,
            ratioBoost: 0.04,
            duration: 0,
        },
    ];

    unit.generatePermanentBuffs();

    assert.equal(unit.permanentBuffs["/buff_types/damage"].flatBoost, 0.02);
    assert.equal(unit.permanentBuffs["/buff_types/damage"].ratioBoost, 0.12);
});
