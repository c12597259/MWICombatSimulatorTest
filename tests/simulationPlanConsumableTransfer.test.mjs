import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleSource = await readFile(
    new URL("../src/simulationPlanConsumableTransfer.js", import.meta.url),
    "utf8",
);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`;
const {
    SIMULATION_PLAN_CONSUMABLE_TRANSFER_TYPE,
    createSimulationPlanConsumableTransfer,
    serializeSimulationPlanConsumableTransfer,
} = await import(moduleUrl);

test('shortfall export cannot be mistaken for a Toolkit total-demand import', () => {
    const payload = JSON.parse(serializeSimulationPlanConsumableTransfer({name:'A',consumablesUsed:{'/items/donut':2.2}}, null, {shortfall:true}));
    assert.equal(payload.type, 'mwi-simulation-plan-consumable-shortfall');
    assert.notEqual(payload.type, SIMULATION_PLAN_CONSUMABLE_TRANSFER_TYPE);
    assert.equal(payload.items[0].quantity, 3);
});

test("rounds each character consumable upward and includes bilingual item names", () => {
    const payload = createSimulationPlanConsumableTransfer({
        name: "Alice",
        consumablesUsed: {
            "/items/cheese": 12,
            "/items/coffee": 2.001,
            "/items/tea": 0.01,
            "/items/unused": 0,
            "/items/invalid": Number.NaN,
        },
    }, (itemHrid, language) => `${language}:${itemHrid.split("/").pop()}`);

    assert.equal(payload.type, SIMULATION_PLAN_CONSUMABLE_TRANSFER_TYPE);
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.characterName, "Alice");
    assert.deepEqual(payload.items.map(({ itemHrid, quantity }) => [itemHrid, quantity]), [
        ["/items/cheese", 12],
        ["/items/coffee", 3],
        ["/items/tea", 1],
    ]);
    assert.deepEqual(payload.items[1].names, {
        zh: "zh:coffee",
        en: "en:coffee",
    });
});

test("serializes a payload that can be pasted into the Toolkit importer", () => {
    const serialized = serializeSimulationPlanConsumableTransfer({
        name: "Bob",
        consumablesUsed: { "/items/apple_gummy": 3.2 },
    }, (itemHrid, language) => `${language}-${itemHrid}`);
    const parsed = JSON.parse(serialized);

    assert.equal(parsed.source, "MWICombatSimulator");
    assert.equal(parsed.items[0].quantity, 4);
    assert.equal(parsed.items[0].names.zh, "zh-/items/apple_gummy");
});
