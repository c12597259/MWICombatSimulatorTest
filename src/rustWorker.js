import { loadEngine, manifest } from './combatWasmEngine.js';
import { normalizeSimulationRequest } from './rustSimulationInput.js';

let enginePromise, fallback, busy = false;

function runFallback(request, reason) {
    // Only loading failures fall back; simulation errors must stay visible.
    fallback ||= new Worker(new URL('./worker.js', import.meta.url));
    fallback.onmessage = ({ data }) => {
        if (data.type === 'simulation_result' || data.type === 'simulation_error') busy = false;
        self.postMessage({ ...data, execution: {
            engine: 'javascript-worker', fallbackReason: reason,
            randomness: { algorithm: 'Math.random', seed: null, exactReplay: false },
        } });
    };
    fallback.onerror = event => {
        busy = false;
        self.postMessage({ type: 'simulation_error', error: event.message || 'Simulation worker failed' });
    };
    fallback.postMessage(request);
}

self.onmessage = async ({ data: request }) => {
    if (request.type !== 'start_simulation') return;
    if (busy) {
        self.postMessage({ type: 'simulation_error', error: 'Simulation worker already has a task' });
        return;
    }
    busy = true;
    let engine;
    try {
        enginePromise ||= loadEngine();
        engine = await enginePromise;
    } catch (error) {
        try { runFallback(request, String(error)); }
        catch (fallbackError) {
            busy = false;
            self.postMessage({ type: 'simulation_error', error: String(fallbackError) });
        }
        return;
    }
    let simulation;
    try {
        const seed = request.seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
        const input = normalizeSimulationRequest(request, seed);
        simulation = engine.create_simulation(JSON.stringify(input));
        const progressMessage = progress => ({
            type: 'simulation_progress', progress,
            zone: request.zone?.zoneHrid, difficultyTier: request.zone?.difficultyTier,
            labyrinth: request.labyrinth?.labyrinthHrid, roomLevel: request.labyrinth?.roomLevel,
        });
        self.postMessage(progressMessage(0));
        let lastReport = performance.now();
        while (!simulation.done()) {
            const progress = JSON.parse(simulation.advance(10000));
            // Yield/report by elapsed time, rather than a timer for every event chunk.
            if (performance.now() - lastReport >= 100) {
                const message = progressMessage(progress.progress);
                if (input.visualization) message.timeSeriesData = JSON.parse(simulation.time_series());
                self.postMessage(message);
                await new Promise(resolve => setTimeout(resolve, 0));
                lastReport = performance.now();
            }
        }
        const output = JSON.parse(simulation.finish());
        const message = progressMessage(1);
        if (input.visualization) message.timeSeriesData = output.result.timeSeriesData;
        self.postMessage(message);
        self.postMessage({ type: 'simulation_result', simResult: output.result, execution: {
            engine: 'rust-wasm-worker', wasmSha256: manifest.artifacts['combat_wasm_bg.wasm'],
            dataFingerprint: manifest.dataFingerprint,
            randomness: { algorithm: manifest.rngVersion, seed, exactReplay: true },
        } });
    } catch (error) {
        self.postMessage({ type: 'simulation_error', error: String(error?.message || error) });
    } finally {
        simulation?.free();
        busy = false;
    }
};
