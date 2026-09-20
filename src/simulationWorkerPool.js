export function getSimulationWorkerCount(hardwareConcurrency, deviceMemory) {
    const cores = Number(hardwareConcurrency);
    const available = Number.isFinite(cores) ? Math.max(1, Math.floor(cores) - 1) : 1;
    const limit = Number(deviceMemory) > 0 && Number(deviceMemory) <= 4 ? 2 : 8;
    return Math.min(available, limit);
}

// Reuse workers within a batch; always release them on success or failure.
export function runSimulationWorkerPool(tasks, { createWorker, concurrency, onProgress = () => {} }) {
    if (!tasks.length) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
        const workers = [];
        const results = new Array(tasks.length);
        const progress = new Array(tasks.length).fill(0);
        let next = 0;
        let completed = 0;
        let settled = false;
        const finish = error => {
            if (settled) return;
            settled = true;
            for (const worker of workers) worker.terminate();
            if (error) reject(error);
            else resolve(results);
        };
        const report = () => onProgress(progress.reduce((sum, value) => sum + value, 0) / tasks.length);
        const assign = worker => {
            if (settled || next >= tasks.length) return;
            const index = next++;
            worker.onmessage = ({ data }) => {
                if (settled) return;
                if (data.type === "simulation_error") {
                    finish(data.error || new Error("Simulation failed"));
                } else if (data.type === "simulation_progress") {
                    progress[index] = Math.max(progress[index], Math.min(1, Number(data.progress) || 0));
                    report();
                } else if (data.type === "simulation_result") {
                    results[index] = data.simResult;
                    progress[index] = 1;
                    report();
                    if (++completed === tasks.length) finish();
                    else assign(worker);
                }
            };
            try { worker.postMessage(tasks[index]); } catch (error) { finish(error); }
        };
        const count = Math.min(tasks.length, Math.max(1, Math.floor(Number(concurrency)) || 1));
        try {
            for (let i = 0; i < count && !settled; i++) {
                const worker = createWorker();
                workers.push(worker);
                worker.onerror = event => finish(new Error(event.message || "Simulation worker failed"));
                worker.onmessageerror = () => finish(new Error("Could not read simulation worker response"));
                assign(worker);
            }
        } catch (error) { finish(error); }
    });
}
