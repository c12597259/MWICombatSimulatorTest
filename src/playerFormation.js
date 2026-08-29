export const PLAYER_FORMATION_SLOTS = Object.freeze(["1", "2", "3", "4", "5"]);

function normalizeSlotList(values, allowedSlots) {
    const allowed = new Set(allowedSlots);
    const result = [];

    for (const value of Array.isArray(values) ? values : []) {
        const slot = String(value);
        if (allowed.has(slot) && !result.includes(slot)) {
            result.push(slot);
        }
    }

    return result;
}

export function normalizePlayerFormation(
    formation,
    availableSlots = PLAYER_FORMATION_SLOTS,
) {
    const slots = [...availableSlots].map(String);
    const normalized = normalizeSlotList(formation, slots);
    return [...normalized, ...slots.filter((slot) => !normalized.includes(slot))];
}

export function orderSelectedPlayerSlots(formation, selectedSlots) {
    const selected = new Set(normalizeSlotList(selectedSlots, PLAYER_FORMATION_SLOTS));
    return normalizePlayerFormation(formation).filter((slot) => selected.has(slot));
}

export function mergeSelectedPlayerFormation(selectedSlots, currentFormation) {
    const selected = normalizeSlotList(selectedSlots, PLAYER_FORMATION_SLOTS);
    const current = normalizePlayerFormation(currentFormation);
    return [...selected, ...current.filter((slot) => !selected.includes(slot))];
}
