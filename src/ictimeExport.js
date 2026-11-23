import { KEY_FRAGMENT_HRIDS } from './fragmentTimeCost.js';
import { SIMULATION_PLAN_TARGETS } from './simulationPlan.js';

const dungeonTargets = new Map(SIMULATION_PLAN_TARGETS.filter(target => target.type === 'dungeon')
    .map(target => [target.mapKey, target]));
const positive = value => Number.isFinite(Number(value)) && Number(value) > 0;
export const ictimeCharacterName = player => String(player?.name ?? '').trim();

// ICTime stores one entry per item for the current character. Preserve the
// winning run's consumables rather than combining rates from different runs.
export function buildICTimeExport(records, characterName, itemDetails, exportedAt = new Date().toISOString()) {
    const best = new Map();
    for (const record of records) {
        if (record.mapType === 'labyrinth' || !positive(record.simulationHours)) continue;
        for (const player of record.players ?? []) {
            if (ictimeCharacterName(player) !== characterName) continue;
            const foods = [], drinks = [];
            for (const [itemHrid, rate] of Object.entries(player.consumablesPerHour ?? {})) {
                if (!positive(rate)) continue;
                const category = itemDetails[itemHrid]?.categoryHrid;
                const target = category === '/item_categories/food' ? foods
                    : category === '/item_categories/drink' ? drinks : null;
                target?.push({ itemHrid, perHour: Number(rate) });
            }
            const candidates = [];
            if (record.mapType === 'dungeon') {
                const dungeon = dungeonTargets.get(record.mapKey ?? `dungeon:${record.mapHrid}`);
                const tier = Number(record.difficulty);
                if (!dungeon || ![0, 1, 2].includes(tier) || !positive(record.averageMinutes)) continue;
                candidates.push({
                    itemHrid: tier === 0 ? dungeon.itemHrid : dungeon.refinementItemHrid,
                    dungeonTier: tier, runMinutes: Number(record.averageMinutes), quantityPer24h: 0,
                    partyCount: Math.min(5, record.players.length),
                });
            } else {
                for (const itemHrid of KEY_FRAGMENT_HRIDS) {
                    const quantityPer24h = Number(player.expectedDropsPerHour?.[itemHrid]) * 24;
                    if (positive(quantityPer24h)) candidates.push({ itemHrid, dungeonTier: 0,
                        runMinutes: 0, quantityPer24h, partyCount: 5 });
                }
            }
            for (const candidate of candidates) {
                const { itemHrid, dungeonTier, runMinutes, quantityPer24h } = candidate;
                const previous = best.get(itemHrid);
                // ICTime has only one refinement entry. Prefer T2; within a tier
                // choose the fastest clear. Fragments still rank by daily yield.
                if (previous) {
                    const improvement = dungeonTier - previous.entry.dungeonTier
                        || previous.entry.runMinutes - runMinutes
                        || quantityPer24h - previous.entry.quantityPer24h;
                    if (improvement < 0 || (improvement === 0 && previous.createdAt >= record.createdAt)) continue;
                }
                best.set(itemHrid, {
                    createdAt: record.createdAt,
                    entry: { ...candidate, collapsed: false, foods, drinks },
                });
            }
        }
    }
    const entries = [...best.values()].map(value => value.entry)
        .sort((a, b) => a.itemHrid.localeCompare(b.itemHrid));
    const missingBaseChests = entries.filter(entry => entry.itemHrid.includes('_refinement_chest'))
        .map(entry => entry.itemHrid.replace('_refinement_chest', '_chest'))
        .filter(hrid => !best.has(hrid));
    return {
        data: { version: 1, type: 'ICTime_TimeCalculatorEntries', exportedAt, entries },
        missingBaseChests,
    };
}
