import { getLabyrinthRequestBuffs } from './labyrinthUpgrades.js';
import { normalizeCharacterInput } from './combatEngineInput.js';

export function normalizeSimulationRequest(request, seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Invalid simulation seed');
    return {
        players: request.players.map(player => {
            const input = normalizeCharacterInput(player, player.hrid);
            const extra = { ...request.extra };
            if (request.labyrinth) {
                extra.personalBuffs = [];
                input.food = [null, null, null];
                input.drinks = [null, null, null];
                input.guildBuffs.push(...getLabyrinthRequestBuffs(player, extra).map(buff => ({
                    uniqueHrid: buff.uniqueHrid, typeHrid: buff.typeHrid,
                    ratioBoost: Number(buff.ratioBoost) || 0, flatBoost: Number(buff.flatBoost) || 0, duration: 0,
                })));
            }
            return { input, extra, steps: [] };
        }),
        zone: request.zone ? { hrid: request.zone.zoneHrid, difficultyTier: request.zone.difficultyTier } : null,
        labyrinth: request.labyrinth ? {
            hrid: request.labyrinth.labyrinthHrid, roomLevel: request.labyrinth.roomLevel,
            crates: request.labyrinth.crates || [],
        } : null,
        seed, timeLimit: request.simulationTimeLimit,
        visualization: Boolean(request.extra?.enableHpMpVisualization),
    };
}
