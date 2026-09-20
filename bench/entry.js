import parsePlayerJson from "../src/parsePlayerJson.js";
import CombatSimulator from "../src/combatsimulator/combatSimulator.js";
import "../src/worker.js";

// Run the real worker handler, including DTO reconstruction, zone and extra buffs.
export async function run(team, options) {
    const players = Object.entries(team).sort(([a], [b]) => Number(a) - Number(b))
        .slice(0, options.players || 5)
        .map(([, value], index) => parsePlayerJson(typeof value === "string" ? JSON.parse(value) : value, `player${index + 1}`));
    const level = p => 0.1 * (p.staminaLevel + p.intelligenceLevel + p.attackLevel + p.defenseLevel + Math.max(p.meleeLevel, p.rangedLevel, p.magicLevel))
        + 0.5 * Math.max(p.attackLevel, p.defenseLevel, p.meleeLevel, p.rangedLevel, p.magicLevel);
    const highest = Math.max(...players.map(level));
    for (const p of players) {
        const ratio = highest / level(p);
        p.debuffOnLevelGap = ratio > 1.2 ? -Math.min(0.9, 3 * (ratio - 1.2)) : 0;
    }
    let result;
    let messages = 0;
    const events = {};
    let maxQueue = 0;
    const original = CombatSimulator.prototype.processEvent;
    if (options.metrics) CombatSimulator.prototype.processEvent = function(event) {
        events[event.type] = (events[event.type] || 0) + 1;
        maxQueue = Math.max(maxQueue, this.eventQueue.minHeap.length);
        return original.call(this, event);
    };
    globalThis.postMessage = message => {
        if (message.type === "simulation_error") throw message.error;
        if (message.type === "simulation_result") result = message.simResult;
        if (message.type === "simulation_progress") messages++;
    };
    const start = performance.now();
    try {
        await globalThis.onmessage({ data: {
            type: "start_simulation", players,
            zone: options.labyrinth ? null : { zoneHrid: options.zone, difficultyTier: options.tier },
            labyrinth: options.labyrinth ? { labyrinthHrid: options.labyrinth, roomLevel: options.room || 100, crates: [] } : null,
            extra: { ...options.extra, enableHpMpVisualization: options.visualization },
            simulationTimeLimit: options.hours * 3600e9,
        } });
        if (!result) throw new Error("Worker returned no result");
        return { elapsedMs: performance.now() - start, messages, events, maxQueue, result };
    } finally {
        CombatSimulator.prototype.processEvent = original;
    }
}
