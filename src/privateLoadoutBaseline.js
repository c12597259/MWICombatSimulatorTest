export const PRIVATE_LOADOUT_BASELINE_REQUEST_EVENT = "mwi-private-loadout-baseline-request";
export const PRIVATE_LOADOUT_BASELINE_RESPONSE_EVENT = "mwi-private-loadout-baseline-response";
export const PRIVATE_LOADOUT_BASELINE_BRIDGE_ATTRIBUTE = "mwiPrivateLoadoutBaselineBridge";

const VALID_PLAYER_SLOTS = new Set(["1", "2", "3", "4", "5"]);

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value) {
    return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function parseSerializedPlayerData(value) {
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return isPlainObject(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function normalizeSlots(values) {
    if (!Array.isArray(values)) {
        return [];
    }
    return [...new Set(values.map(String).filter((slot) => VALID_PLAYER_SLOTS.has(slot)))]
        .sort((left, right) => Number(left) - Number(right));
}

function firstText(...values) {
    for (const value of values) {
        const normalized = normalizeText(value === undefined || value === null ? "" : String(value));
        if (normalized) {
            return normalized;
        }
    }
    return "";
}

export function buildPrivateLoadoutReferences(preset) {
    if (!isPlainObject(preset)) {
        return [];
    }

    return normalizeSlots(preset.selectedPlayers).map((slot) => {
        const playerData = parseSerializedPlayerData(preset.playerDataMap?.[slot]);
        const storedReference = isPlainObject(preset.loadoutReferences?.[slot])
            ? preset.loadoutReferences[slot]
            : {};
        return {
            slot,
            characterId: firstText(
                storedReference.characterId,
                playerData.characterId,
                playerData.privateSnapshot?.characterId,
                playerData.characterMeta?.id,
            ),
            characterName: firstText(
                storedReference.characterName,
                playerData.characterName,
                playerData.characterMeta?.name,
                preset.playerNames?.[slot],
            ),
            loadoutId: firstText(
                storedReference.loadoutId,
                playerData.loadoutId,
                playerData.privateSnapshot?.loadoutId,
                playerData.loadoutMeta?.id,
            ),
            loadoutName: firstText(
                storedReference.loadoutName,
                playerData.loadoutName,
                playerData.loadoutMeta?.name,
            ),
            gameMode: firstText(
                storedReference.gameMode,
                playerData.gameMode,
                playerData.privateSnapshot?.gameMode,
            ),
        };
    });
}

function parseResolvedBaselineData(result) {
    const parsed = parseSerializedPlayerData(result?.data);
    if (!isPlainObject(parsed.player)) {
        return null;
    }

    const copy = JSON.parse(JSON.stringify(parsed));
    copy.characterId = firstText(result.characterId, copy.characterId);
    copy.characterName = firstText(result.characterName, copy.characterName);
    copy.loadoutId = firstText(result.loadoutId, copy.loadoutId);
    copy.loadoutName = firstText(result.loadoutName, copy.loadoutName);
    copy.gameMode = firstText(result.gameMode, copy.gameMode);
    return copy;
}

export function resolvePrivateLoadoutBaseline(preset, response, unavailableReason = "bridge-unavailable") {
    const references = buildPrivateLoadoutReferences(preset);
    const baselinePlayerDataMap = { ...(preset?.playerDataMap || {}) };
    const baselinePlayerNames = { ...(preset?.playerNames || {}) };
    const results = Array.isArray(response?.results) ? response.results : [];
    const resultBySlot = new Map(results.map((result) => [String(result?.slot || ""), result]));
    const matchedSlots = [];
    const fallbackSlots = [];

    for (const reference of references) {
        const result = resultBySlot.get(reference.slot);
        const resolvedData = result?.status === "matched"
            ? parseResolvedBaselineData(result)
            : null;

        if (resolvedData) {
            baselinePlayerDataMap[reference.slot] = JSON.stringify(resolvedData);
            if (resolvedData.characterName) {
                baselinePlayerNames[reference.slot] = resolvedData.characterName;
            }
            matchedSlots.push({
                slot: reference.slot,
                reference,
                characterId: resolvedData.characterId,
                characterName: resolvedData.characterName,
                loadoutId: resolvedData.loadoutId,
                loadoutName: resolvedData.loadoutName,
                matchMethod: normalizeText(result.matchMethod),
            });
        } else {
            const reason = result?.status === "matched"
                ? "invalid-response"
                : (normalizeText(result?.status)
                    || normalizeText(response?.errorCode)
                    || (response ? "invalid-response" : unavailableReason));
            fallbackSlots.push({
                slot: reference.slot,
                reference,
                reason,
            });
        }
    }

    return {
        baselinePreset: {
            ...preset,
            playerDataMap: baselinePlayerDataMap,
            playerNames: baselinePlayerNames,
        },
        references,
        matchedSlots,
        fallbackSlots,
        allMatched: references.length > 0 && fallbackSlots.length === 0,
        usesServerData: matchedSlots.length > 0,
    };
}
