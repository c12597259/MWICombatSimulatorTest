// Temporary performance-comparison capture. Keep only the latest completed run
// in memory; never reread the editor to reconstruct the input after completion.
export function createSimulationRecordCapture(metadata = {}, now = () => performance.now()) {
    let pending = null;
    let completed = null;
    let startedAt = 0;
    return {
        clear() {
            pending = null;
            completed = null;
        },
        start(request) {
            completed = null;
            pending = {
                format: "mwi-simulation-record",
                schemaVersion: 1,
                startedAt: new Date().toISOString(),
                ...metadata,
                randomness: { algorithm: "Math.random", seed: null, exactReplay: false },
                request: JSON.parse(JSON.stringify({
                    type: request.type,
                    players: request.players,
                    zone: request.zone,
                    labyrinth: request.labyrinth,
                    zones: request.zones,
                    labyrinths: request.labyrinths,
                    simulationTimeLimit: request.simulationTimeLimit,
                    extra: request.extra,
                })),
            };
            // Snapshotting is excluded from the measured Worker round trip.
            startedAt = now();
        },
        finish(result, execution) {
            if (!pending) return false;
            completed = {
                ...pending,
                ...(execution?.engine ? { engine: execution.engine, execution,
                    randomness: execution.randomness || { algorithm: 'per-task', exactReplay: false, seed: null } } : {}),
                completedAt: new Date().toISOString(),
                timing: {
                    elapsedMs: Math.max(0, now() - startedAt),
                    scope: pending.request.type === "start_simulation" ? "worker-round-trip-before-result-rendering" : "entire-parallel-batch-before-result-rendering",
                },
                // The received result is read-only in the UI. Avoid copying its
                // potentially large logs; serialize only when Export is clicked.
                result,
            };
            pending = null;
            return true;
        },
        getRecord() { return completed; },
    };
}

export async function createSimulationHistoryArchive(records, decodeSnapshot, { latestRun = null, metadata = {} } = {}) {
    const exported = [];
    for (const record of records) {
        const { teamSnapshot, ...summary } = record;
        let snapshot = null, snapshotError = null;
        try {
            if (teamSnapshot) snapshot = await decodeSnapshot(teamSnapshot);
        } catch (error) { snapshotError = String(error); }
        exported.push({
            ...summary,
            teamSnapshot: snapshot,
            replayAvailability: snapshot?.simulationRecord?.request ? "worker-request" : snapshot?.playerDataMap ? "team-snapshot-only" : "unavailable",
            snapshotError,
        });
    }
    return {
        format: "mwi-simulation-history-export",
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        ...metadata,
        recordCount: exported.length,
        mapCount: new Set(exported.map(record => record.mapKey)).size,
        records: exported,
        // History stores summaries, not raw attack logs. Keep the current run's
        // full result separately, without pretending older full results exist.
        latestRun,
        notes: {
            historyResults: "summaries-only",
            olderRecords: "Team snapshots may lack exact extra buffs, Worker requests and wall-clock timings; missing fields were not inferred from current settings.",
            randomness: "Native Math.random runs have no replayable seed. Rust runs record the seed and engine/data fingerprints in execution; batch execution.executions follows result/request target order. Exact replay requires the matching engine and definitions.",
        },
    };
}

export function getSimulationArchiveFilename(archive) {
    return `mwi-simulations-all-maps-${archive.exportedAt.replace(/[:.]/g, "-")}.json`;
}
