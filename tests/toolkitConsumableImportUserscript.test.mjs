import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(
    new URL("../userscripts/mwi-toolkit-consumable-import.user.js", import.meta.url),
    "utf8",
);
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const api = sandbox.MWI_TOOLKIT_CONSUMABLE_IMPORT_TEST_API;

test("Toolkit importer accepts and normalizes simulator consumable payloads", () => {
    const payload = api.parseTransferPayload(JSON.stringify({
        type: "mwi-simulation-plan-consumables",
        schemaVersion: 1,
        characterName: "Alice",
        items: [
            {
                itemHrid: "/items/apple_gummy",
                quantity: 2.1,
                names: { zh: "苹果软糖", en: "Apple Gummy" },
            },
            {
                itemHrid: "/items/apple_gummy",
                quantity: 3,
                names: { zh: "苹果软糖", en: "Apple Gummy" },
            },
        ],
    }));

    assert.equal(payload.characterName, "Alice");
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0].quantity, 6);
    assert.deepEqual(
        [...api.getNameCandidates(payload.items[0], "en")],
        ["Apple Gummy", "苹果软糖"],
    );
});

test("Toolkit importer rejects unrelated clipboard JSON", () => {
    assert.throws(
        () => api.parseTransferPayload('{"type":"something-else","items":[]}'),
        /不是战斗模拟器导出的消耗品数据/,
    );
});

test("Toolkit importer rejects a duplicate quantity that exceeds the safe integer range", () => {
    assert.throws(
        () => api.parseTransferPayload(JSON.stringify({
            type: "mwi-simulation-plan-consumables",
            schemaVersion: 1,
            items: [
                { itemHrid: "/items/apple_gummy", quantity: Number.MAX_SAFE_INTEGER },
                { itemHrid: "/items/apple_gummy", quantity: 1 },
            ],
        })),
        /数量过大/,
    );
});
