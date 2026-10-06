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
        const executions = new Array(tasks.length);
        const results = await runSimulationWorkerPool(tasks, {
            createWorker: () => new Worker(new URL("rustWorker.js", import.meta.url)),
            concurrency: getSimulationWorkerCount(navigator.hardwareConcurrency, navigator.deviceMemory),
            onProgress: progress => this.postMessage({ type: "simulation_progress", progress }),
            onResult: (index, message) => { executions[index] = message.execution; },
        });
        this.postMessage({ type: isZones ? "simulation_result_allZones" : "simulation_result_allLabyrinths", simResults: results,
            execution: { engine: executions.every(value => value?.engine === 'rust-wasm-worker') ? 'rust-wasm-worker' : 'mixed-workers', executions } });
    } catch (error) {
        this.postMessage({ type: "simulation_error", error });
    }
};
