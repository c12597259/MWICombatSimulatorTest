import { KEY_FRAGMENT_HRIDS } from './fragmentTimeCost.js';

const CHESTS = new Set(['chimerical', 'sinister', 'enchanted', 'pirate']);
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
            for (const [itemHrid, rawRate] of Object.entries(player.expectedDropsPerHour ?? {})) {
                if (!positive(rawRate) || !Number.isFinite(Number(rawRate) * 24)) continue;
                const rate = Number(rawRate);
                const fragment = KEY_FRAGMENT_HRIDS.includes(itemHrid);
                const chest = itemHrid.match(/^\/items\/(\w+?)(_refinement)?_chest$/);
                const tier = Number(record.difficulty);
                if (!fragment && !(chest && CHESTS.has(chest[1]) && record.mapType === 'dungeon'
                    && positive(record.averageMinutes) && [0, 1, 2].includes(tier)
                    && (chest[2] ? tier > 0 : tier === 0))) continue;
                const previous = best.get(itemHrid);
                if (previous && (previous.rate > rate || (previous.rate === rate
                    && String(previous.createdAt) >= String(record.createdAt)))) continue;
                best.set(itemHrid, {
                    rate, createdAt: record.createdAt,
                    entry: {
                        itemHrid, collapsed: false,
                        dungeonTier: fragment ? 0 : tier,
                        partyCount: fragment ? 5 : Math.min(5, Math.max(1, record.players.length)),
                        runMinutes: fragment ? 0 : Number(record.averageMinutes),
                        quantityPer24h: fragment ? rate * 24 : 0,
                        foods, drinks,
                    },
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
