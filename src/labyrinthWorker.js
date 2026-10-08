import { loadEngine, manifest } from './combatWasmEngine.js';
import { normalizeSimulationRequest } from './rustSimulationInput.js';

// The calculator fetches this fixed entry and runs it in a same-origin Blob
// Worker. Only immutable WASM/data assets use the supplied simulator base URL.
__webpack_public_path__ = self.__mwiLabAssetBase || new URL('.', self.location.href).href;
self.__mwiLabyrinthApiVersion = 1;
let enginePromise;
let queue = Promise.resolve();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function roomResult(result, requestedTrials, simulationLimitNs, execution) {
    const stats = result.labyrinthStats;
    if (!stats || stats.completed !== stats.successes + stats.deaths + stats.timeouts) {
        throw new Error('Labyrinth engine did not return completed-attempt statistics');
    }
    const simulatedNs = finite(result.simulatedTime);
    const completedHours = stats.lastEnd / 3.6e12;
    const uiHours = simulatedNs / 3.6e12;
    const monsterKills = Object.entries(result.deaths || {}).reduce((sum, [hrid, count]) =>
        sum + (hrid.startsWith('player') ? 0 : finite(count)), 0);
    return {
        successes: stats.successes, trials: stats.completed,
        totalSpentSeconds: stats.lastEnd / 1e9,
        minElapsedSeconds: stats.minDuration / 1e9, maxElapsedSeconds: stats.maxDuration / 1e9,
        failedByTimeout: stats.timeouts, failedByDeath: stats.deaths, execution,
        firstRunDebug: {
            requestedTrials, simulatedSecondsLimit: simulationLimitNs / 1e9,
            completedSeconds: stats.lastEnd / 1e9, completedTrials: stats.completed,
            completedTrialsRecorded: stats.completed, encounters: stats.successes,
            monsterKillCount: monsterKills, simulatedTime: simulatedNs,
            lastEncounterFinishTime: finite(result.lastEncounterFinishTime), simulationLimitNs,
            encountersPerHour: completedHours ? stats.successes / completedHours : 0,
            monsterKillsPerHour: completedHours ? monsterKills / completedHours : 0,
            playerDeathsPerHour: completedHours ? stats.deaths / completedHours : 0,
            uiMonsterKillsPerHour: uiHours ? monsterKills / uiHours : 0,
            uiPlayerDeathsPerHour: uiHours ? stats.deaths / uiHours : 0,
            hadIncompleteFinalEncounter: result.labyAttemptCount > stats.completed,
            deaths: result.deaths, deathCount: stats.deaths, engine: execution.engine,
        },
    };
}

async function simulateRoom(data) {
    let simulation;
    try {
        if (data.apiVersion !== 1) throw new Error('Please update the labyrinth calculator (API version mismatch)');
        const trials = Math.max(1, Math.floor(finite(data.trials, 1)));
        const seconds = finite(data.roomDurationSeconds, 120);
        if (seconds !== 120 || trials > 100000) throw new Error('Invalid labyrinth simulation duration');
        if (!data.playerDto || !data.monsterHrid) throw new Error('Missing player or monster');
        enginePromise ||= loadEngine().catch(error => { enginePromise = null; throw error; });
        const engine = await enginePromise;
        const seed = data.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
        const limit = seconds * trials * 1e9;
        const input = normalizeSimulationRequest({
            players: [{ ...data.playerDto, food: [null, null, null], drinks: [null, null, null] }],
            labyrinth: { labyrinthHrid: data.monsterHrid, roomLevel: data.mazeDifficulty, crates: data.mazeCrateItemHrids || [] },
            extra: { buffs: data.extraBuffs || [] }, simulationTimeLimit: limit,
        }, seed);
        input.recordLabyrinthStats = true;
        simulation = engine.create_simulation(JSON.stringify(input));
        const progress = completed => self.postMessage({ type: 'room_progress', requestId: data.requestId, completed, trials });
        progress(0);
        let lastReport = performance.now();
        while (!simulation.done()) {
            const status = JSON.parse(simulation.advance(10000));
            if (performance.now() - lastReport >= 100) {
                progress(Math.floor(status.progress * trials));
                await new Promise(resolve => setTimeout(resolve, 0));
                lastReport = performance.now();
            }
        }
        const { result } = JSON.parse(simulation.finish());
        const execution = { engine: 'rust-wasm-worker', apiVersion: 1, seed,
            wasmSha256: manifest.artifacts['combat_wasm_bg.wasm'], dataFingerprint: manifest.dataFingerprint };
        progress(trials);
        self.postMessage({ type: 'room_result', requestId: data.requestId, ...roomResult(result, trials, limit, execution) });
    } catch (error) {
        self.postMessage({ type: 'room_error', requestId: data.requestId, error: String(error?.message || error) });
    } finally { simulation?.free(); }
}

self.onmessage = ({ data }) => {
    if (data?.type === 'simulate_room') queue = queue.then(() => simulateRoom(data));
};
