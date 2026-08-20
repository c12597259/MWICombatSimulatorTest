const SNAPSHOT_ID_PATTERN = /^[0-9TZ-]+-[a-f0-9]{12}$/;

function toTimestamp(value) {
    const timestamp = Date.parse(String(value ?? ""));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function normalizeCharacterSummary(value) {
    if (!value || typeof value !== "object") return null;
    const characterId = String(value.characterId ?? "").trim();
    if (!characterId) return null;
    return {
        characterId,
        characterName: String(value.characterName ?? `#${characterId}`).trim() || `#${characterId}`,
        gameMode: String(value.gameMode ?? "").trim(),
        loadoutCount: Math.max(0, Math.trunc(Number(value.loadoutCount) || 0)),
    };
}

function normalizeSnapshotSummary(value) {
    if (!value || typeof value !== "object") return null;
    const snapshotId = String(value.snapshotId ?? "").trim();
    if (!SNAPSHOT_ID_PATTERN.test(snapshotId)) return null;
    const characters = (Array.isArray(value.characters) ? value.characters : [])
        .map(normalizeCharacterSummary)
        .filter(Boolean);
    if (!characters.length) return null;
    return {
        snapshotId,
        receivedAt: String(value.receivedAt ?? ""),
        exportedAt: String(value.exportedAt ?? ""),
        characterCount: characters.length,
        loadoutCount: Math.max(0, Math.trunc(Number(value.loadoutCount) || 0)),
        characters,
    };
}

export function normalizePrivateSnapshotSummaries(value) {
    return (Array.isArray(value) ? value : [])
        .map(normalizeSnapshotSummary)
        .filter(Boolean)
        .sort((left, right) =>
            toTimestamp(right.receivedAt) - toTimestamp(left.receivedAt)
            || right.snapshotId.localeCompare(left.snapshotId)
        );
}

export function groupPrivateSnapshotSummaries(value) {
    const snapshots = normalizePrivateSnapshotSummaries(value);
    const parents = snapshots.map((_, index) => index);
    const find = (index) => {
        while (parents[index] !== index) {
            parents[index] = parents[parents[index]];
            index = parents[index];
        }
        return index;
    };
    const union = (left, right) => {
        const leftRoot = find(left);
        const rightRoot = find(right);
        if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
    };
    const characterIdSets = snapshots.map(snapshot =>
        new Set(snapshot.characters.map(character => character.characterId))
    );

    for (let left = 0; left < snapshots.length; left += 1) {
        for (let right = left + 1; right < snapshots.length; right += 1) {
            if ([...characterIdSets[left]].some(characterId => characterIdSets[right].has(characterId))) {
                union(left, right);
            }
        }
    }

    const grouped = new Map();
    snapshots.forEach((snapshot, index) => {
        const root = find(index);
        const group = grouped.get(root) ?? [];
        group.push(snapshot);
        grouped.set(root, group);
    });

    return [...grouped.values()]
        .map(groupSnapshots => {
            groupSnapshots.sort((left, right) =>
                toTimestamp(right.receivedAt) - toTimestamp(left.receivedAt)
                || right.snapshotId.localeCompare(left.snapshotId)
            );
            const characterMap = new Map();
            for (const snapshot of groupSnapshots) {
                for (const character of snapshot.characters) {
                    if (!characterMap.has(character.characterId)) {
                        characterMap.set(character.characterId, character);
                    }
                }
            }
            const characters = [...characterMap.values()].sort((left, right) =>
                left.characterName.localeCompare(right.characterName, "zh-CN")
            );
            return {
                id: [...characterMap.keys()].sort().join("|"),
                latestReceivedAt: groupSnapshots[0].receivedAt,
                latestSnapshotId: groupSnapshots[0].snapshotId,
                snapshots: groupSnapshots,
                characters,
            };
        })
        .sort((left, right) =>
            toTimestamp(right.latestReceivedAt) - toTimestamp(left.latestReceivedAt)
            || left.id.localeCompare(right.id)
        );
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

export function buildPrivatePlayerImportData({ snapshotId, character, loadout }) {
    if (!SNAPSHOT_ID_PATTERN.test(String(snapshotId ?? ""))) {
        throw new Error("Invalid private snapshot ID");
    }
    if (!character || typeof character !== "object" || !String(character.characterId ?? "").trim()) {
        throw new Error("Invalid private snapshot character");
    }
    if (!loadout || typeof loadout !== "object" || !loadout.simulationInput?.player) {
        throw new Error("Invalid private snapshot loadout");
    }

    const importData = cloneJson(loadout.simulationInput);
    importData.characterName = String(character.characterName ?? "").trim()
        || `#${String(character.characterId)}`;
    importData.loadoutName = String(loadout.loadoutName ?? "").trim() || "Server loadout";
    importData.privateSnapshot = {
        snapshotId: String(snapshotId),
        characterId: String(character.characterId),
        gameMode: String(character.gameMode ?? ""),
    };
    return importData;
}
