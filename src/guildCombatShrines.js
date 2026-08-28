export const GUILD_COMBAT_SHRINE_DETAILS = Object.freeze([
    {
        key: "force",
        buffTypes: ["/buff_types/damage"],
        ratioPerLevel: 0.003,
    },
    {
        key: "tempo",
        buffTypes: ["/buff_types/attack_speed", "/buff_types/cast_speed"],
        ratioPerLevel: 0.004,
    },
    {
        key: "spirit",
        buffTypes: ["/buff_types/max_hitpoints", "/buff_types/max_manapoints"],
        ratioPerLevel: 0.01,
    },
    {
        key: "rarity",
        buffTypes: ["/buff_types/rare_find"],
        ratioPerLevel: 0.015,
    },
    {
        key: "scholar",
        buffTypes: ["/buff_types/wisdom"],
        ratioPerLevel: 0.005,
    },
]);

export const GUILD_COMBAT_SHRINE_DEFAULTS = Object.freeze(
    Object.fromEntries(GUILD_COMBAT_SHRINE_DETAILS.map(({ key }) => [key, 0])),
);

const SHRINE_KEYS = new Set(GUILD_COMBAT_SHRINE_DETAILS.map(({ key }) => key));
const KNOWN_BUFF_TYPES = new Set(
    GUILD_COMBAT_SHRINE_DETAILS.flatMap(({ buffTypes }) => buffTypes),
);

export function normalizeGuildCombatShrineLevel(level) {
    const numericLevel = Number(level);
    if (!Number.isFinite(numericLevel)) {
        return 0;
    }
    return Math.max(0, Math.min(20, Math.floor(numericLevel)));
}

function findShrineKey(key, entry) {
    const candidate = `${String(key ?? "")} ${String(entry?.shrineHrid ?? "")}`.toLowerCase();
    return GUILD_COMBAT_SHRINE_DETAILS.find(({ key: shrineKey }) => (
        candidate === shrineKey
        || candidate.includes(`/${shrineKey}_combat`)
        || candidate.includes(`/combat_${shrineKey}`)
        || candidate.includes(shrineKey)
    ))?.key;
}

function readShrineLevel(entry) {
    if (entry && typeof entry === "object") {
        return entry.activeLevel ?? entry.effectiveLevel ?? entry.purchasedLevel ?? entry.level;
    }
    return entry;
}

export function hasExplicitGuildCombatShrineLevels(levels) {
    if (!levels || typeof levels !== "object") {
        return false;
    }
    return Object.entries(levels).some(([key, entry]) => (
        SHRINE_KEYS.has(key) || findShrineKey(key, entry)
    ));
}

export function normalizeGuildCombatShrineLevels(levels = {}) {
    const normalized = { ...GUILD_COMBAT_SHRINE_DEFAULTS };
    if (!levels || typeof levels !== "object") {
        return normalized;
    }

    for (const [key, entry] of Object.entries(levels)) {
        const shrineKey = SHRINE_KEYS.has(key) ? key : findShrineKey(key, entry);
        if (!shrineKey) {
            continue;
        }
        normalized[shrineKey] = normalizeGuildCombatShrineLevel(readShrineLevel(entry));
    }
    return normalized;
}

function inferLevelFromBuff(buff, detail) {
    if (!buff || !detail.buffTypes.includes(buff.typeHrid)) {
        return 0;
    }
    const boost = buff.typeHrid === "/buff_types/cast_speed"
        || buff.typeHrid === "/buff_types/rare_find"
        || buff.typeHrid === "/buff_types/wisdom"
        ? Number(buff.flatBoost)
        : Number(buff.ratioBoost);
    if (!Number.isFinite(boost) || boost <= 0) {
        return 0;
    }
    return normalizeGuildCombatShrineLevel(Math.round(boost / detail.ratioPerLevel));
}

export function inferGuildCombatShrineLevels(guildCombatBuffs = []) {
    const inferred = { ...GUILD_COMBAT_SHRINE_DEFAULTS };
    if (!Array.isArray(guildCombatBuffs)) {
        return inferred;
    }

    for (const detail of GUILD_COMBAT_SHRINE_DETAILS) {
        inferred[detail.key] = guildCombatBuffs.reduce(
            (highestLevel, buff) => Math.max(highestLevel, inferLevelFromBuff(buff, detail)),
            0,
        );
    }
    return inferred;
}

export function resolveGuildCombatShrineLevels(levels, guildCombatBuffs = []) {
    return hasExplicitGuildCombatShrineLevels(levels)
        ? normalizeGuildCombatShrineLevels(levels)
        : inferGuildCombatShrineLevels(guildCombatBuffs);
}

export function isKnownGuildCombatShrineBuffType(typeHrid) {
    return KNOWN_BUFF_TYPES.has(typeHrid);
}

export function getGuildCombatShrineBoosts(typeHrid, levels = {}) {
    const normalized = normalizeGuildCombatShrineLevels(levels);
    const boosts = [];

    if (typeHrid === "/buff_types/damage" && normalized.force > 0) {
        boosts.push({ ratioBoost: 0.003 * normalized.force, flatBoost: 0 });
    }
    if (typeHrid === "/buff_types/attack_speed" && normalized.tempo > 0) {
        boosts.push({ ratioBoost: 0.004 * normalized.tempo, flatBoost: 0 });
    }
    if (typeHrid === "/buff_types/cast_speed" && normalized.tempo > 0) {
        boosts.push({ ratioBoost: 0, flatBoost: 0.004 * normalized.tempo });
    }
    if (typeHrid === "/buff_types/max_hitpoints" && normalized.spirit > 0) {
        boosts.push({ ratioBoost: 0.01 * normalized.spirit, flatBoost: 0 });
    }
    if (typeHrid === "/buff_types/max_manapoints" && normalized.spirit > 0) {
        boosts.push({ ratioBoost: 0.01 * normalized.spirit, flatBoost: 0 });
    }
    if (typeHrid === "/buff_types/rare_find" && normalized.rarity > 0) {
        boosts.push({ ratioBoost: 0, flatBoost: 0.015 * normalized.rarity });
    }
    if (typeHrid === "/buff_types/wisdom" && normalized.scholar > 0) {
        boosts.push({ ratioBoost: 0, flatBoost: 0.005 * normalized.scholar });
    }

    return boosts;
}
