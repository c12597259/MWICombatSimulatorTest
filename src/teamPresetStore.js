export const TEAM_PRESET_STORAGE_KEY = "mwiCombatSimulatorTeamPresets_v1";

const TEAM_PRESET_STORE_VERSION = 1;

export function createEmptyTeamPresetStore() {
    return {
        version: TEAM_PRESET_STORE_VERSION,
        autoLoad: false,
        defaults: {},
        presets: [],
    };
}

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePreset(preset) {
    if (!isPlainObject(preset) || typeof preset.id !== "string" || typeof preset.name !== "string") {
        return null;
    }

    if (typeof preset.targetKey !== "string" || !isPlainObject(preset.target)) {
        return null;
    }

    if (!isPlainObject(preset.playerDataMap) || !isPlainObject(preset.playerNames)) {
        return null;
    }

    const selectedPlayers = Array.isArray(preset.selectedPlayers)
        ? preset.selectedPlayers
            .map((playerNumber) => String(playerNumber))
            .filter((playerNumber) => ["1", "2", "3", "4", "5"].includes(playerNumber))
        : [];

    if (selectedPlayers.length === 0) {
        return null;
    }

    return {
        ...preset,
        name: preset.name.trim(),
        selectedPlayers: [...new Set(selectedPlayers)],
    };
}

function normalizeStore(value) {
    const emptyStore = createEmptyTeamPresetStore();
    if (!isPlainObject(value) || value.version !== TEAM_PRESET_STORE_VERSION) {
        return emptyStore;
    }

    const presets = Array.isArray(value.presets)
        ? value.presets.map(normalizePreset).filter(Boolean)
        : [];
    const validIds = new Set(presets.map((preset) => preset.id));
    const defaults = {};

    if (isPlainObject(value.defaults)) {
        for (const [targetKey, presetId] of Object.entries(value.defaults)) {
            if (typeof presetId === "string" && validIds.has(presetId)) {
                defaults[targetKey] = presetId;
            }
        }
    }

    return {
        version: TEAM_PRESET_STORE_VERSION,
        autoLoad: value.autoLoad === true,
        defaults,
        presets,
    };
}

export function loadTeamPresetStore(storage = window.localStorage) {
    try {
        const rawValue = storage.getItem(TEAM_PRESET_STORAGE_KEY);
        return rawValue ? normalizeStore(JSON.parse(rawValue)) : createEmptyTeamPresetStore();
    } catch (error) {
        console.warn("Unable to load team presets; using an empty store.", error);
        return createEmptyTeamPresetStore();
    }
}

export function saveTeamPresetStore(store, storage = window.localStorage) {
    storage.setItem(TEAM_PRESET_STORAGE_KEY, JSON.stringify(normalizeStore(store)));
}

export function createTeamPresetTargetKey(target) {
    return `${target.kind}:${target.hrid}:T${target.difficultyTier}`;
}

export function getTeamPresetsForTarget(store, targetKey) {
    return store.presets
        .filter((preset) => preset.targetKey === targetKey)
        .sort((left, right) => left.name.localeCompare(right.name));
}

export function getDefaultTeamPreset(store, targetKey) {
    const defaultId = store.defaults[targetKey];
    return store.presets.find((preset) => preset.id === defaultId && preset.targetKey === targetKey) ?? null;
}

export function createTeamPresetId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
