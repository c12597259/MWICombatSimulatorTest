import { normalizeCharacterInput } from './combatEngineInput.js';

export function normalizeSimulationRequest(request, seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid simulation seed');
    return {
        players: request.players.map(player => ({
            input: normalizeCharacterInput(player, player.hrid), extra: request.extra || {}, steps: [],
        })),
        zone: request.zone ? { hrid: request.zone.zoneHrid, difficultyTier: request.zone.difficultyTier } : null,
        labyrinth: request.labyrinth ? {
            hrid: request.labyrinth.labyrinthHrid, roomLevel: request.labyrinth.roomLevel,
            crates: request.labyrinth.crates || [],
        } : null,
        seed, timeLimit: request.simulationTimeLimit,
        visualization: Boolean(request.extra?.enableHpMpVisualization),
    };
}
