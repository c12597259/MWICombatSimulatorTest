import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const calculatorSource = await readFile(
    new URL("../src/fragmentTimeCost.js", import.meta.url),
    "utf8",
);
const calculatorModuleUrl = `data:text/javascript;base64,${Buffer.from(calculatorSource).toString("base64")}`;
const { calculateFragmentTimeCosts } = await import(calculatorModuleUrl);

const zeroBuffProfile = {
    complete: true,
    skillLevels: {
        "/skills/cooking": 1,
        "/skills/foraging": 1,
    },
    houseRooms: {},
    items: [],
    actionTypeDrinkSlots: {},
    buffs: {
        itemEfficiencyPercent: 0,
        gatheringQuantityPercent: 0,
        productionEfficiencyPercent: 0,
    },
};

test("calculates exact combat minutes per fragment when no consumables are used", () => {
    const result = calculateFragmentTimeCosts({
        expectedDropMap: new Map([["/items/blue_key_fragment", 4]]),
        simulatedHours: 2,
    });

    assert.equal(result.mode, "exact");
    assert.equal(result.fragments.length, 1);
    assert.equal(result.fragments[0].combatMinutesPerFragment, 30);
    assert.equal(result.fragments[0].totalMinutesPerFragment, 30);
});

test("adds direct consumable production time", () => {
    const actionDetailMap = {
        "/actions/cooking/test_food": {
            hrid: "/actions/cooking/test_food",
            type: "/action_types/cooking",
            name: "Test Food",
            baseTimeCost: 10e9,
            levelRequirement: { skillHrid: "/skills/cooking", level: 1 },
            inputItems: [],
            outputItems: [{ itemHrid: "/items/test_food", count: 1 }],
        },
    };
    const result = calculateFragmentTimeCosts({
        expectedDropMap: { "/items/blue_key_fragment": 4 },
        simulatedHours: 2,
        consumablesUsed: { "/items/test_food": 720 },
        productionProfile: zeroBuffProfile,
        actionDetailMap,
    });

    assert.equal(result.mode, "personalized");
    assert.ok(Math.abs(result.craftMinutesPerSimHour - 60) < 1e-9);
    assert.ok(Math.abs(result.fragments[0].totalMinutesPerFragment - 60) < 1e-9);
});

test("recursively includes raw material gathering time", () => {
    const actionDetailMap = {
        "/actions/cooking/test_food": {
            hrid: "/actions/cooking/test_food",
            type: "/action_types/cooking",
            name: "Test Food",
            baseTimeCost: 10e9,
            levelRequirement: { skillHrid: "/skills/cooking", level: 1 },
            inputItems: [{ itemHrid: "/items/test_berry", count: 2 }],
            outputItems: [{ itemHrid: "/items/test_food", count: 1 }],
        },
        "/actions/foraging/test_berry": {
            hrid: "/actions/foraging/test_berry",
            type: "/action_types/foraging",
            name: "Test Berry",
            baseTimeCost: 10e9,
            levelRequirement: { skillHrid: "/skills/foraging", level: 1 },
            inputItems: [],
            outputItems: null,
            dropTable: [{
                itemHrid: "/items/test_berry",
                dropRate: 1,
                minCount: 1,
                maxCount: 1,
            }],
        },
    };
    const result = calculateFragmentTimeCosts({
        expectedDropMap: { "/items/blue_key_fragment": 10 },
        simulatedHours: 1,
        consumablesUsed: { "/items/test_food": 360 },
        productionProfile: zeroBuffProfile,
        actionDetailMap,
        itemDetailMap: {
            "/items/test_food": { name: "Test Food" },
            "/items/test_berry": { name: "Test Berry" },
        },
    });

    assert.equal(result.craftMinutesPerSimHour, 180);
    assert.equal(result.fragments[0].combatMinutesPerFragment, 6);
    assert.equal(result.fragments[0].totalMinutesPerFragment, 24);
});

test("ignores non-fragment drops", () => {
    const result = calculateFragmentTimeCosts({
        expectedDropMap: new Map([
            ["/items/coin", 1000],
            ["/items/burning_key_fragment", 2],
        ]),
        simulatedHours: 1,
    });

    assert.deepEqual(result.fragments.map((entry) => entry.itemHrid), [
        "/items/burning_key_fragment",
    ]);
});

test("does not label an incomplete buff snapshot as personalized", () => {
    const actionDetailMap = {
        "/actions/cooking/test_food": {
            hrid: "/actions/cooking/test_food",
            type: "/action_types/cooking",
            name: "Test Food",
            baseTimeCost: 10e9,
            levelRequirement: { skillHrid: "/skills/cooking", level: 1 },
            inputItems: [],
            outputItems: [{ itemHrid: "/items/test_food", count: 1 }],
        },
    };
    const result = calculateFragmentTimeCosts({
        expectedDropMap: { "/items/blue_key_fragment": 1 },
        simulatedHours: 1,
        consumablesUsed: { "/items/test_food": 1 },
        productionProfile: {
            ...zeroBuffProfile,
            buffs: { itemEfficiencyPercent: 0 },
        },
        actionDetailMap,
    });

    assert.equal(result.mode, "estimated");
    assert.ok(result.issues.includes("defaultBuffs"));
});

test("uses captured game action buffs and boosted profession levels", () => {
    const actionDetailMap = {
        "/actions/cooking/test_food": {
            hrid: "/actions/cooking/test_food",
            type: "/action_types/cooking",
            name: "Test Food",
            baseTimeCost: 10e9,
            levelRequirement: { skillHrid: "/skills/cooking", level: 1 },
            inputItems: [],
            outputItems: [{ itemHrid: "/items/test_food", count: 1 }],
        },
    };
    const productionProfile = {
        complete: true,
        effectiveBuffsCaptured: true,
        characterSkills: [{ skillHrid: "/skills/cooking", level: 11 }],
        actionTypeDrinkSlotsMap: {},
        effectiveActionTypeBuffs: {
            "/action_types/cooking": [
                { typeHrid: "/buff_types/cooking_level", flatBoost: 2, ratioBoost: 0 },
                { typeHrid: "/buff_types/action_speed", flatBoost: 0.2, ratioBoost: 0 },
                { typeHrid: "/buff_types/efficiency", flatBoost: 0.3, ratioBoost: 0 },
                { typeHrid: "/buff_types/gourmet", flatBoost: 0.5, ratioBoost: 0 },
            ],
        },
        effectiveActionHridBuffs: {},
    };
    // 360 base actions * 1.2 speed * (1 + 0.30 + 0.12 level efficiency)
    // * 1.5 gourmet output = 920.16 items/hour.
    const result = calculateFragmentTimeCosts({
        expectedDropMap: { "/items/blue_key_fragment": 1 },
        simulatedHours: 1,
        consumablesUsed: { "/items/test_food": 920.16 },
        productionProfile,
        actionDetailMap,
    });

    assert.equal(result.mode, "personalized");
    assert.ok(Math.abs(result.craftMinutesPerSimHour - 60) < 1e-9);
    assert.ok(!result.issues.includes("defaultTools"));
    assert.ok(!result.issues.includes("defaultBuffs"));
});

test("applies captured action-level penalties before profession efficiency", () => {
    const actionDetailMap = {
        "/actions/cooking/test_food": {
            hrid: "/actions/cooking/test_food",
            type: "/action_types/cooking",
            name: "Test Food",
            baseTimeCost: 10e9,
            levelRequirement: { skillHrid: "/skills/cooking", level: 1 },
            inputItems: [],
            outputItems: [{ itemHrid: "/items/test_food", count: 1 }],
        },
    };
    const result = calculateFragmentTimeCosts({
        expectedDropMap: { "/items/blue_key_fragment": 1 },
        simulatedHours: 1,
        consumablesUsed: { "/items/test_food": 378 },
        productionProfile: {
            complete: true,
            effectiveBuffsCaptured: true,
            characterSkills: [{ skillHrid: "/skills/cooking", level: 11 }],
            actionTypeDrinkSlotsMap: {},
            effectiveActionTypeBuffs: {
                "/action_types/cooking": [
                    { typeHrid: "/buff_types/action_level", flatBoost: 5, ratioBoost: 0 },
                ],
            },
            effectiveActionHridBuffs: {},
        },
        actionDetailMap,
    });

    // Required level becomes 6, so level efficiency is 5%: 360 * 1.05 = 378.
    assert.equal(result.mode, "personalized");
    assert.ok(Math.abs(result.craftMinutesPerSimHour - 60) < 1e-9);
});
