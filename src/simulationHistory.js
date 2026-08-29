export const SIMULATION_HISTORY_DATABASE_NAME = "mwiCombatSimulatorHistory";
export const SIMULATION_HISTORY_STORE_NAME = "records";
export const SIMULATION_HISTORY_SCHEMA_VERSION = 1;

const PLAYER_KEYS = new Set(["player1", "player2", "player3", "player4", "player5"]);
const SKILL_KEYS = ["stamina", "intelligence", "attack", "melee", "defense", "ranged", "magic"];

function toFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function roundNumber(value, digits = 4) {
    const number = toFiniteNumber(value);
    const factor = 10 ** digits;
    return Math.round(number * factor) / factor;
}

function sumValues(value) {
    if (!value || typeof value !== "object") {
        return 0;
    }
    return Object.values(value).reduce((total, current) => total + toFiniteNumber(current), 0);
}

function createRateMap(value, divisor) {
    if (!value || typeof value !== "object" || divisor <= 0) {
        return {};
    }

    const result = {};
    for (const [key, amount] of Object.entries(value)) {
        const rate = toFiniteNumber(amount) / divisor;
        if (rate !== 0) {
            result[key] = roundNumber(rate, 8);
        }
    }
    return result;
}

function calculateAttackDamage(abilityMap) {
    if (!abilityMap || typeof abilityMap !== "object") {
        return 0;
    }

    let damage = 0;
    for (const hitMap of Object.values(abilityMap)) {
        if (!hitMap || typeof hitMap !== "object") {
            continue;
        }
        for (const [hit, count] of Object.entries(hitMap)) {
            if (hit === "miss") {
                continue;
            }
            damage += toFiniteNumber(hit) * toFiniteNumber(count);
        }
    }
    return damage;
}

function calculateDamageDone(attacks, playerKey) {
    const targets = attacks?.[playerKey];
    if (!targets || typeof targets !== "object") {
        return 0;
    }
    return Object.values(targets).reduce(
        (total, abilities) => total + calculateAttackDamage(abilities),
        0,
    );
}

function calculateDamageTaken(attacks, playerKey) {
    if (!attacks || typeof attacks !== "object") {
        return 0;
    }

    let damage = 0;
    for (const [source, targets] of Object.entries(attacks)) {
        if (PLAYER_KEYS.has(source)) {
            continue;
        }
        damage += calculateAttackDamage(targets?.[playerKey]);
    }
    return damage;
}

function calculateRanOutOfManaPercent(simResult, playerKey) {
    const state = simResult.playerRanOutOfManaTime?.[playerKey];
    const simulatedTime = toFiniteNumber(simResult.simulatedTime);
    if (!state || simulatedTime <= 0) {
        return 0;
    }

    const trailingTime = state.isOutOfMana
        ? Math.max(0, simulatedTime - toFiniteNumber(state.startTimeForOutOfMana))
        : 0;
    const totalTime = toFiniteNumber(state.totalTimeForOutOfMana) + trailingTime;
    return roundNumber(100 * totalTime / simulatedTime);
}

export function createSimulationHistoryId(completedAt = new Date().toISOString()) {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.parse(completedAt).toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getSimulationHistoryMapDescriptor(simResult) {
    if (simResult?.isLabyrinth) {
        const mapHrid = simResult.labyrinthName ?? "unknown";
        return {
            mapKey: `labyrinth:${mapHrid}`,
            mapType: "labyrinth",
            mapHrid,
            difficulty: toFiniteNumber(simResult.roomLevel),
        };
    }

    const mapHrid = simResult?.zoneName ?? "unknown";
    const mapType = simResult?.isDungeon ? "dungeon" : "zone";
    return {
        mapKey: `${mapType}:${mapHrid}`,
        mapType,
        mapHrid,
        difficulty: toFiniteNumber(simResult?.difficultyTier),
    };
}

export function buildSimulationHistoryRecord({
    simResult,
    players = [],
    expectedDropsByPlayer = {},
    teamPresetName = "",
    startedAt = "",
    completedAt = new Date().toISOString(),
    id = createSimulationHistoryId(completedAt),
    nanosecondsPerHour = 60 * 60 * 1e9,
    nanosecondsPerSecond = 1e9,
}) {
    const map = getSimulationHistoryMapDescriptor(simResult);
    const simulatedHours = Math.max(
        toFiniteNumber(simResult?.simulatedTime) / nanosecondsPerHour,
        0,
    );
    const simulatedSeconds = Math.max(
        toFiniteNumber(simResult?.simulatedTime) / nanosecondsPerSecond,
        0,
    );

    let completedHours = simulatedHours;
    if (simResult?.isDungeon && toFiniteNumber(simResult.lastDungeonFinishTime) > 0) {
        completedHours = toFiniteNumber(simResult.lastDungeonFinishTime) / nanosecondsPerHour;
    } else if (toFiniteNumber(simResult?.lastEncounterFinishTime) > 0) {
        completedHours = toFiniteNumber(simResult.lastEncounterFinishTime) / nanosecondsPerHour;
    }
    if (completedHours <= 0) {
        completedHours = simulatedHours || 1;
    }

    const completed = toFiniteNumber(simResult?.dungeonsCompleted);
    const failed = toFiniteNumber(simResult?.dungeonsFailed);
    const attempts = toFiniteNumber(simResult?.labyAttemptCount);
    const encounters = toFiniteNumber(simResult?.encounters);
    const encounterCount = simResult?.isDungeon ? completed : encounters;
    let successRate = null;
    if (simResult?.isLabyrinth && attempts > 0) {
        successRate = roundNumber(100 * encounters / attempts);
    } else if (simResult?.isDungeon && completed + failed > 0) {
        successRate = roundNumber(100 * completed / (completed + failed));
    }

    const monsterDeaths = Object.fromEntries(
        Object.entries(simResult?.deaths ?? {}).filter(([key]) => !PLAYER_KEYS.has(key)),
    );

    const historyPlayers = players.map((playerContext) => {
        const slot = String(playerContext.slot);
        const playerKey = playerContext.playerKey ?? `player${slot}`;
        const experience = simResult?.experienceGained?.[playerKey] ?? {};
        const experiencePerHour = {};
        for (const skill of SKILL_KEYS) {
            const rate = simulatedHours > 0
                ? toFiniteNumber(experience[skill]) / simulatedHours
                : 0;
            if (rate !== 0) {
                experiencePerHour[skill] = roundNumber(rate);
            }
        }

        return {
            slot,
            playerKey,
            name: String(playerContext.name ?? playerKey).trim() || playerKey,
            deathsPerHour: roundNumber(
                simulatedHours > 0
                    ? toFiniteNumber(simResult?.deaths?.[playerKey]) / simulatedHours
                    : 0,
            ),
            dps: roundNumber(
                simulatedSeconds > 0
                    ? calculateDamageDone(simResult?.attacks, playerKey) / simulatedSeconds
                    : 0,
            ),
            damageTakenPerSecond: roundNumber(
                simulatedSeconds > 0
                    ? calculateDamageTaken(simResult?.attacks, playerKey) / simulatedSeconds
                    : 0,
            ),
            totalExperiencePerHour: roundNumber(
                simulatedHours > 0 ? sumValues(experience) / simulatedHours : 0,
            ),
            experiencePerHour,
            consumablesPerHour: createRateMap(
                simResult?.consumablesUsed?.[playerKey],
                simulatedHours,
            ),
            expectedDropsPerHour: createRateMap(
                expectedDropsByPlayer[playerKey],
                simulatedHours,
            ),
            hitpointsSpentPerHour: roundNumber(
                simulatedHours > 0
                    ? sumValues(simResult?.hitpointsSpent?.[playerKey]) / simulatedHours
                    : 0,
            ),
            manaUsedPerHour: roundNumber(
                simulatedHours > 0
                    ? sumValues(simResult?.manaUsed?.[playerKey]) / simulatedHours
                    : 0,
            ),
            hitpointsRestoredPerSecond: roundNumber(
                simulatedSeconds > 0
                    ? sumValues(simResult?.hitpointsGained?.[playerKey]) / simulatedSeconds
                    : 0,
            ),
            manapointsRestoredPerSecond: roundNumber(
                simulatedSeconds > 0
                    ? sumValues(simResult?.manapointsGained?.[playerKey]) / simulatedSeconds
                    : 0,
            ),
            ranOutOfManaPercent: calculateRanOutOfManaPercent(simResult ?? {}, playerKey),
        };
    });

    return {
        schemaVersion: SIMULATION_HISTORY_SCHEMA_VERSION,
        id,
        createdAt: completedAt,
        startedAt,
        ...map,
        simulationHours: roundNumber(simulatedHours),
        teamPresetName: String(teamPresetName ?? "").trim(),
        playerNames: historyPlayers.map((playerEntry) => playerEntry.name),
        encountersPerHour: roundNumber(encounterCount / completedHours),
        labyrinthAttemptsPerHour: simResult?.isLabyrinth
            ? roundNumber(attempts / completedHours)
            : null,
        completedDungeons: completed,
        failedDungeons: failed,
        successRate,
        averageMinutes: simResult?.isDungeon && completed > 0
            ? roundNumber(completedHours * 60 / completed)
            : null,
        maxWaveReached: toFiniteNumber(simResult?.maxWaveReached),
        maxEnrageStack: toFiniteNumber(simResult?.maxEnrageStack),
        monsterKillsPerHour: createRateMap(monsterDeaths, completedHours),
        players: historyPlayers,
    };
}

function normalizePlayerName(value) {
    return String(value ?? "").trim().toLocaleLowerCase();
}

export function matchSimulationHistoryPlayers(baselinePlayers = [], comparisonPlayers = []) {
    const unusedComparisonPlayers = new Set(comparisonPlayers);
    const pairs = [];

    for (const baseline of baselinePlayers) {
        const normalizedName = normalizePlayerName(baseline.name);
        let comparison = [...unusedComparisonPlayers].find(
            (candidate) => normalizedName && normalizePlayerName(candidate.name) === normalizedName,
        );
        if (!comparison) {
            comparison = [...unusedComparisonPlayers].find(
                (candidate) => String(candidate.slot) === String(baseline.slot),
            );
        }
        if (comparison) {
            unusedComparisonPlayers.delete(comparison);
        }
        pairs.push({ baseline, comparison: comparison ?? null });
    }

    for (const comparison of unusedComparisonPlayers) {
        pairs.push({ baseline: null, comparison });
    }

    return pairs;
}

export function compareSimulationHistoryNumber(baseline, comparison) {
    const before = toFiniteNumber(baseline);
    const after = toFiniteNumber(comparison);
    const delta = roundNumber(after - before, 8);
    return {
        baseline: roundNumber(before, 8),
        comparison: roundNumber(after, 8),
        delta,
        percent: before === 0 ? null : roundNumber(100 * delta / Math.abs(before), 4),
    };
}

export function compareSimulationHistoryMaps(baseline = {}, comparison = {}) {
    const keys = [...new Set([...Object.keys(baseline), ...Object.keys(comparison)])].sort();
    return keys.map((key) => ({
        key,
        ...compareSimulationHistoryNumber(baseline[key], comparison[key]),
    }));
}

export function compareSimulationHistoryRecords(baseline, comparison) {
    return {
        sameMap: baseline?.mapKey === comparison?.mapKey,
        summary: {
            encountersPerHour: compareSimulationHistoryNumber(
                baseline?.encountersPerHour,
                comparison?.encountersPerHour,
            ),
            successRate: compareSimulationHistoryNumber(
                baseline?.successRate,
                comparison?.successRate,
            ),
            averageMinutes: compareSimulationHistoryNumber(
                baseline?.averageMinutes,
                comparison?.averageMinutes,
            ),
        },
        players: matchSimulationHistoryPlayers(
            baseline?.players ?? [],
            comparison?.players ?? [],
        ).map(({ baseline: baselinePlayer, comparison: comparisonPlayer }) => ({
            baseline: baselinePlayer,
            comparison: comparisonPlayer,
            metrics: {
                dps: compareSimulationHistoryNumber(baselinePlayer?.dps, comparisonPlayer?.dps),
                damageTakenPerSecond: compareSimulationHistoryNumber(
                    baselinePlayer?.damageTakenPerSecond,
                    comparisonPlayer?.damageTakenPerSecond,
                ),
                deathsPerHour: compareSimulationHistoryNumber(
                    baselinePlayer?.deathsPerHour,
                    comparisonPlayer?.deathsPerHour,
                ),
                totalExperiencePerHour: compareSimulationHistoryNumber(
                    baselinePlayer?.totalExperiencePerHour,
                    comparisonPlayer?.totalExperiencePerHour,
                ),
                hitpointsSpentPerHour: compareSimulationHistoryNumber(
                    baselinePlayer?.hitpointsSpentPerHour,
                    comparisonPlayer?.hitpointsSpentPerHour,
                ),
                manaUsedPerHour: compareSimulationHistoryNumber(
                    baselinePlayer?.manaUsedPerHour,
                    comparisonPlayer?.manaUsedPerHour,
                ),
                hitpointsRestoredPerSecond: compareSimulationHistoryNumber(
                    baselinePlayer?.hitpointsRestoredPerSecond,
                    comparisonPlayer?.hitpointsRestoredPerSecond,
                ),
                manapointsRestoredPerSecond: compareSimulationHistoryNumber(
                    baselinePlayer?.manapointsRestoredPerSecond,
                    comparisonPlayer?.manapointsRestoredPerSecond,
                ),
                ranOutOfManaPercent: compareSimulationHistoryNumber(
                    baselinePlayer?.ranOutOfManaPercent,
                    comparisonPlayer?.ranOutOfManaPercent,
                ),
            },
            experience: compareSimulationHistoryMaps(
                baselinePlayer?.experiencePerHour,
                comparisonPlayer?.experiencePerHour,
            ),
            consumables: compareSimulationHistoryMaps(
                baselinePlayer?.consumablesPerHour,
                comparisonPlayer?.consumablesPerHour,
            ),
            drops: compareSimulationHistoryMaps(
                baselinePlayer?.expectedDropsPerHour,
                comparisonPlayer?.expectedDropsPerHour,
            ),
        })),
    };
}

function openSimulationHistoryDatabase(indexedDb) {
    return new Promise((resolve, reject) => {
        if (!indexedDb) {
            reject(new Error("IndexedDB is unavailable."));
            return;
        }

        const request = indexedDb.open(SIMULATION_HISTORY_DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(SIMULATION_HISTORY_STORE_NAME)) {
                const store = database.createObjectStore(
                    SIMULATION_HISTORY_STORE_NAME,
                    { keyPath: "id" },
                );
                store.createIndex("mapKey", "mapKey", { unique: false });
                store.createIndex("createdAt", "createdAt", { unique: false });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Unable to open history database."));
    });
}

function runHistoryTransaction(indexedDb, mode, operation) {
    return openSimulationHistoryDatabase(indexedDb).then((database) => new Promise((resolve, reject) => {
        const transaction = database.transaction(SIMULATION_HISTORY_STORE_NAME, mode);
        const store = transaction.objectStore(SIMULATION_HISTORY_STORE_NAME);
        let result;

        try {
            result = operation(store);
        } catch (error) {
            database.close();
            reject(error);
            return;
        }

        transaction.oncomplete = () => {
            database.close();
            resolve(result?.result ?? result);
        };
        transaction.onerror = () => {
            const error = transaction.error ?? new Error("History database transaction failed.");
            database.close();
            reject(error);
        };
        transaction.onabort = () => {
            const error = transaction.error ?? new Error("History database transaction was aborted.");
            database.close();
            reject(error);
        };
    }));
}

export function saveSimulationHistoryRecord(record, indexedDb = window.indexedDB) {
    return runHistoryTransaction(indexedDb, "readwrite", (store) => store.put(record));
}

export async function loadSimulationHistoryRecords(indexedDb = window.indexedDB) {
    const records = await runHistoryTransaction(indexedDb, "readonly", (store) => store.getAll());
    return (records ?? []).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function deleteSimulationHistoryRecord(id, indexedDb = window.indexedDB) {
    return runHistoryTransaction(indexedDb, "readwrite", (store) => store.delete(id));
}

export async function deleteSimulationHistoryMap(mapKey, indexedDb = window.indexedDB) {
    const database = await openSimulationHistoryDatabase(indexedDb);
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(SIMULATION_HISTORY_STORE_NAME, "readwrite");
        const store = transaction.objectStore(SIMULATION_HISTORY_STORE_NAME);
        const request = store.index("mapKey").getAllKeys(mapKey);
        let deletedCount = 0;

        request.onsuccess = () => {
            const keys = request.result ?? [];
            deletedCount = keys.length;
            keys.forEach((key) => store.delete(key));
        };
        request.onerror = () => transaction.abort();
        transaction.oncomplete = () => {
            database.close();
            resolve(deletedCount);
        };
        transaction.onerror = () => {
            const error = transaction.error ?? request.error ?? new Error("Unable to delete map history.");
            database.close();
            reject(error);
        };
        transaction.onabort = transaction.onerror;
    });
}

export function clearSimulationHistory(indexedDb = window.indexedDB) {
    return runHistoryTransaction(indexedDb, "readwrite", (store) => store.clear());
}

export function getSimulationHistoryStorageSummary(records = []) {
    const serialized = JSON.stringify(records);
    const bytes = typeof TextEncoder === "function"
        ? new TextEncoder().encode(serialized).length
        : serialized.length * 2;
    return { count: records.length, bytes };
}
