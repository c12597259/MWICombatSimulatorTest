import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const buffIndexSource = await readFile(
    new URL("../src/combatsimulator/combatBuffIndex.js", import.meta.url),
    "utf8",
);
const buffIndexModuleUrl = `data:text/javascript;base64,${Buffer.from(buffIndexSource).toString("base64")}`;
const combatUnitSource = (await readFile(
    new URL("../src/combatsimulator/combatUnit.js", import.meta.url),
    "utf8",
)).replace('"./combatBuffIndex.js"', JSON.stringify(buffIndexModuleUrl));
const combatUnitModuleUrl = `data:text/javascript;base64,${Buffer.from(combatUnitSource).toString("base64")}`;
const { default: CombatUnit } = await import(combatUnitModuleUrl);

const shrineSource = await readFile(
    new URL("../src/guildCombatShrines.js", import.meta.url),
    "utf8",
);
const shrineModuleUrl = `data:text/javascript;base64,${Buffer.from(shrineSource).toString("base64")}`;
const {
    getGuildCombatShrineBoosts,
    inferGuildCombatShrineLevels,
    normalizeGuildCombatShrineLevels,
    resolveImportedGuildCombatShrineLevels,
} = await import(shrineModuleUrl);

test('imports the v1.5.7 guildShrine format sent to our simulator', () => {
    assert.deepEqual(resolveImportedGuildCombatShrineLevels({guildShrine: {force: 12, tempo: 8, spirit: 20}}),
        {force: 12, tempo: 8, spirit: 20, rarity: 0, scholar: 0});
});

test('imports all five alternate shrine names and prefers them over legacy three-shrine data', () => {
    assert.deepEqual(resolveImportedGuildCombatShrineLevels({
        guildShrine: {force: 19, tempo: 19, spirit: 19},
        shrines: {'/shrines/power': 12, '/shrines/rhythm': 8, '/shrines/spirit': {level: 4},
            '/shrines/rare': 7, '/shrines/scholar': 3},
    }), {force: 12, tempo: 8, spirit: 4, rarity: 7, scholar: 3});
});

test('saved explicit levels override stale importer fields and buffs without double counting', () => {
    const buffs = [{typeHrid: '/buff_types/damage', ratioBoost: 0.036, flatBoost: 0}];
    assert.deepEqual(resolveImportedGuildCombatShrineLevels({guildCombatBuffLevels: {force: 0},
        guildShrine: {force: 12}, shrines: {'/shrines/power': 12}, guildCombatBuffs: buffs}),
    {force: 0, tempo: 0, spirit: 0, rarity: 0, scholar: 0});
    assert.equal(resolveImportedGuildCombatShrineLevels({guildCombatBuffs: buffs}).force, 12);
    assert.deepEqual(resolveImportedGuildCombatShrineLevels({}), {force: 0, tempo: 0, spirit: 0, rarity: 0, scholar: 0});
});

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

test("applies max hitpoint and manapoint buffs in combat detail calculation", () => {
    const unit = new CombatUnit();
    unit.isPlayer = true;
    unit.staminaLevel = 1;
    unit.intelligenceLevel = 1;
    unit.guildCombatBuffs = [
        {
            uniqueHrid: "guild:spirit:hp",
            typeHrid: "/buff_types/max_hitpoints",
            flatBoost: 0,
            ratioBoost: 0.1,
            duration: 0,
        },
        {
            uniqueHrid: "guild:spirit:mp",
            typeHrid: "/buff_types/max_manapoints",
            flatBoost: 0,
            ratioBoost: 0.1,
            duration: 0,
        },
    ];

    unit.generatePermanentBuffs();
    unit.clearBuffs();

    assert.equal(unit.combatDetails.maxHitpoints, 121);
    assert.equal(unit.combatDetails.maxManapoints, 121);
});

test("infers all five combat shrine levels from effective guild buffs", () => {
    const levels = inferGuildCombatShrineLevels([
        { typeHrid: "/buff_types/damage", ratioBoost: 0.036, flatBoost: 0 },
        { typeHrid: "/buff_types/attack_speed", ratioBoost: 0.032, flatBoost: 0 },
        { typeHrid: "/buff_types/max_hitpoints", ratioBoost: 0.2, flatBoost: 0 },
        { typeHrid: "/buff_types/rare_find", ratioBoost: 0, flatBoost: 0.15 },
        { typeHrid: "/buff_types/wisdom", ratioBoost: 0, flatBoost: 0.055 },
    ]);

    assert.deepEqual(levels, {
        force: 12,
        tempo: 8,
        spirit: 20,
        rarity: 10,
        scholar: 11,
    });
});

test("normalizes direct and nested guild shrine levels to the supported range", () => {
    assert.deepEqual(normalizeGuildCombatShrineLevels({
        force: 7.9,
        shrineTempo: { shrineHrid: "/guild_buffs/tempo_combat", activeLevel: 25 },
        shrineSpirit: { shrineHrid: "/guild_buffs/combat_spirit", purchasedLevel: 4 },
    }), {
        force: 7,
        tempo: 20,
        spirit: 4,
        rarity: 0,
        scholar: 0,
    });
});

test("converts shrine levels into the official combat stat boosts", () => {
    const levels = { force: 10, tempo: 5, spirit: 4, rarity: 3, scholar: 2 };

    assert.deepEqual(getGuildCombatShrineBoosts("/buff_types/damage", levels), [
        { ratioBoost: 0.03, flatBoost: 0 },
    ]);
    assert.deepEqual(getGuildCombatShrineBoosts("/buff_types/cast_speed", levels), [
        { ratioBoost: 0, flatBoost: 0.02 },
    ]);
    assert.deepEqual(getGuildCombatShrineBoosts("/buff_types/max_hitpoints", levels), [
        { ratioBoost: 0.04, flatBoost: 0 },
    ]);
    assert.deepEqual(getGuildCombatShrineBoosts("/buff_types/rare_find", levels), [
        { ratioBoost: 0, flatBoost: 0.045 },
    ]);
    assert.deepEqual(getGuildCombatShrineBoosts("/buff_types/wisdom", levels), [
        { ratioBoost: 0, flatBoost: 0.01 },
    ]);
});
