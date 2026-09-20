import { getSimulationWorkerCount, runSimulationWorkerPool } from "./simulationWorkerPool.js";

onmessage = async function ({ data }) {
    const isZones = data.type === "start_simulation_all_zones";
    if (!isZones && data.type !== "start_simulation_all_labyrinths") return;
    const targets = isZones ? data.zones : data.labyrinths;
    const tasks = targets.map(target => ({
        type: "start_simulation",
        players: data.players,
        [isZones ? "zone" : "labyrinth"]: target,
        extra: data.extra,
        simulationTimeLimit: data.simulationTimeLimit,
    }));
    try {
        const results = await runSimulationWorkerPool(tasks, {
            createWorker: () => new Worker(new URL("worker.js", import.meta.url)),
            concurrency: getSimulationWorkerCount(navigator.hardwareConcurrency, navigator.deviceMemory),
            onProgress: progress => this.postMessage({ type: "simulation_progress", progress }),
        });
        this.postMessage({ type: isZones ? "simulation_result_allZones" : "simulation_result_allLabyrinths", simResults: results });
    } catch (error) {
        this.postMessage({ type: "simulation_error", error });
    }
};
