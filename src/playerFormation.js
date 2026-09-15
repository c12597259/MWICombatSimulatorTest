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

export function remapPlayerSlotValues(
    valuesBySlot,
    sourceOrder,
    availableSlots = PLAYER_FORMATION_SLOTS,
) {
    const slots = [...availableSlots].map(String);
    const normalizedSourceOrder = normalizePlayerFormation(sourceOrder, slots);
    return Object.fromEntries(slots.map((destinationSlot, index) => [
        destinationSlot,
        valuesBySlot?.[normalizedSourceOrder[index]],
    ]));
}

export function createFixedPlayerSlotAssignments(
    sourceSlots,
    availableSlots = PLAYER_FORMATION_SLOTS,
) {
    const slots = [...availableSlots].map(String);
    const sources = normalizeSlotList(sourceSlots, slots);
    const destinations = [...sources].sort(
        (left, right) => slots.indexOf(left) - slots.indexOf(right),
    );
    return destinations.map((destinationSlot, index) => ({
        destinationSlot,
        sourceSlot: sources[index],
    }));
}
