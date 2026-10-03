// This index lives for one recalculation only. Keep the ordered boosts as well
// as their sums: level/evasion formulas round differently if pre-summed.
export const EMPTY_BOOSTS = Object.freeze([]);
export const ZERO_BOOST = Object.freeze({ ratioBoost: 0, flatBoost: 0 });

export function appendBuffBoost(index, type, ratioBoost, flatBoost) {
    let group = index.get(type);
    if (!group) {
        group = { boosts: [], total: { ratioBoost: 0, flatBoost: 0 } };
        index.set(type, group);
    }
    group.boosts.push({ ratioBoost, flatBoost });
    group.total.ratioBoost += ratioBoost ?? 0;
    group.total.flatBoost += flatBoost ?? 0;
}
