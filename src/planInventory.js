export const INVENTORY_REQUEST_EVENT = 'mwi-private-inventory-request';
export const INVENTORY_RESPONSE_EVENT = 'mwi-private-inventory-response';
export const INVENTORY_BRIDGE_ATTRIBUTE = 'mwiPrivateInventoryBridge';

// Inventory is separate from historical combat/profession snapshots.
export function normalizePlanInventory(value, characterId) {
    if (!characterId || value?.schemaVersion !== 1 || value.complete !== true
        || String(value.characterId) !== String(characterId) || !Number.isFinite(Date.parse(value.capturedAt))
        || !value.items || typeof value.items !== 'object' || Array.isArray(value.items)) return null;
    const items = {};
    for (const [hrid, amount] of Object.entries(value.items)) {
        if (!/^\/items\/[a-z0-9_]+$/.test(hrid) || typeof amount !== 'number'
            || !Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) return null;
        items[hrid] = Math.floor(amount);
    }
    return { schemaVersion: 1, characterId: String(characterId), complete: true,
        capturedAt: value.capturedAt, items };
}

export function calculateConsumableShortfall(consumables, inventory) {
    return Object.entries(consumables || {}).filter(([, amount]) => Number.isFinite(amount) && amount > 0)
        .map(([itemHrid, amount]) => {
            const required = Math.ceil(amount);
            const available = inventory ? inventory.items[itemHrid] || 0 : null;
            return { itemHrid, required, available,
                missing: available === null ? null : Math.max(0, required - available) };
        });
}

export function requestPlanInventories(characterIds, { force = false } = {}) {
    if (document.documentElement.dataset[INVENTORY_BRIDGE_ATTRIBUTE] !== '1')
        return Promise.reject(new Error('bridge-unavailable'));
    return new Promise((resolve, reject) => {
        const requestId = crypto.randomUUID();
        const cleanup = () => { clearTimeout(timer); document.removeEventListener(INVENTORY_RESPONSE_EVENT, receive); };
        const receive = event => {
            let response;
            try { response = JSON.parse(event.detail); } catch { return; }
            if (response?.requestId !== requestId) return;
            cleanup();
            if (response.errorCode) reject(new Error(response.errorCode)); else resolve(response.inventories || {});
        };
        const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, force ? 125000 : 10000);
        document.addEventListener(INVENTORY_RESPONSE_EVENT, receive);
        document.dispatchEvent(new CustomEvent(INVENTORY_REQUEST_EVENT,
            { detail: JSON.stringify({ requestId, characterIds: [...new Set(characterIds)].slice(0, 50), force }) }));
    });
}
