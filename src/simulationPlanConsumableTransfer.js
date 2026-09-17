export const SIMULATION_PLAN_CONSUMABLE_TRANSFER_TYPE = "mwi-simulation-plan-consumables";
export const SIMULATION_PLAN_CONSUMABLE_TRANSFER_VERSION = 1;

function resolveItemName(itemHrid, language, itemNameResolver) {
    try {
        const name = itemNameResolver?.(itemHrid, language);
        if (typeof name === "string" && name.trim()) {
            return name.trim();
        }
    } catch {
        // Fall back to a readable HRID when localization is unavailable.
    }
    return String(itemHrid ?? "")
        .split("/")
        .filter(Boolean)
        .pop()
        ?.replaceAll("_", " ") ?? String(itemHrid ?? "");
}

export function createSimulationPlanConsumableTransfer(player, itemNameResolver) {
    const items = Object.entries(player?.consumablesUsed ?? {})
        .map(([itemHrid, quantity]) => [itemHrid, Number(quantity)])
        .filter(([itemHrid, quantity]) => (
            typeof itemHrid === "string"
            && itemHrid.startsWith("/items/")
            && Number.isFinite(quantity)
            && quantity > 0
        ))
        .sort((left, right) => right[1] - left[1])
        .map(([itemHrid, quantity]) => ({
            itemHrid,
            quantity: Math.ceil(quantity),
            names: {
                zh: resolveItemName(itemHrid, "zh", itemNameResolver),
                en: resolveItemName(itemHrid, "en", itemNameResolver),
            },
        }));

    return {
        type: SIMULATION_PLAN_CONSUMABLE_TRANSFER_TYPE,
        schemaVersion: SIMULATION_PLAN_CONSUMABLE_TRANSFER_VERSION,
        source: "MWICombatSimulator",
        characterName: String(player?.name ?? "").trim(),
        items,
    };
}

export function serializeSimulationPlanConsumableTransfer(player, itemNameResolver) {
    return JSON.stringify(
        createSimulationPlanConsumableTransfer(player, itemNameResolver),
        null,
        2,
    );
}
