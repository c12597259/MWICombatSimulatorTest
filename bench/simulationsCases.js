import { normalizeCharacterInput } from '../src/combatEngineInput.js';
import party from '../tests/fixtures/combat/synthetic-party.json';
import weak from '../tests/fixtures/combat/synthetic-weak.json';
import scenarios from '../tests/fixtures/combat/scenarios.json';
import actions from '../src/combatsimulator/data/actionDetailMap.json';

export function simulationCase(name, options = {}, team = party) {
    const opts = { zone: '/actions/combat/pirate_cove', tier: 2, hours: 1, players: 5, seed: 1, ...options };
    const players = Object.entries(team).sort(([a], [b]) => Number(a) - Number(b)).slice(0, opts.players)
        .map(([, raw], index) => ({ input: normalizeCharacterInput(typeof raw === 'string' ? JSON.parse(raw) : raw, `player${index + 1}`),
            zoneHrid: opts.labyrinth ? null : opts.zone, extra: opts.extra || {}, steps: [] }));
    const level = input => { const [s, i, a, m, d, r, g] = input.levels; return 0.1 * (s + i + a + d + Math.max(m, r, g)) + 0.5 * Math.max(a, d, m, r, g); };
    const highest = Math.max(...players.map(player => level(player.input)));
    for (const player of players) { const ratio = highest / level(player.input); player.input.debuffOnLevelGap = ratio > 1.2 ? -Math.min(0.9, 3 * (ratio - 1.2)) : 0; }
    return { name, request: { players, zone: opts.labyrinth ? null : { hrid: opts.zone, difficultyTier: opts.tier },
        labyrinth: opts.labyrinth ? { hrid: opts.labyrinth, roomLevel: opts.room || 100, crates: opts.crates || [] } : null,
        seed: opts.seed, timeLimit: opts.hours * 3600e9, visualization: !!opts.visualization }, options: opts };
}
export function simulationCases() {
    const cases = scenarios.map(spec => ({ ...simulationCase(spec.name, spec.options, spec.fixture === 'synthetic-weak.json' ? weak : party), minimumCoverage: spec.minimumCoverage || {} }));
    for (const [hrid, action] of Object.entries(actions)) if (action.combatZoneInfo?.isDungeon) {
        for (const seed of [1, 0xffffffff]) cases.push(simulationCase(`${hrid}:${seed}`, { zone: hrid, tier: 0, hours: 0.2, seed }));
    }
    cases.push(simulationCase('early-cutoff', { hours: 0.0001 }));
    cases.push({ ...simulationCase('normal-map-party-respawn', { hours: 0.2, players: 1, zone: '/actions/combat/infernal_abyss', tier: 0 }, weak), minimumCoverage: { respawns: 1 } });
    return cases;
}
