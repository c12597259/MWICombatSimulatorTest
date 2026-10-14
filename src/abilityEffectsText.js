// Base coefficients from the same level-scaled data used by the simulator.
// Character stats, amplifiers and haste are intentionally not applied here.
export function abilityEffectsText(details, level, t) {
    const n = value => Number(value.toFixed(3)).toString();
    const percent = value => `${n(value * 100)}%`;
    const scaled = (entry, field) => (entry[field] ?? 0) + (level - 1) * (entry[field + 'LevelBonus'] ?? 0);
    const word = hrid => { const key = hrid.split('/').pop(); return t(key, key.replaceAll('_', ' ')); };
    const lines = [];
    for (const effect of details.abilityEffects ?? []) {
        const target = t(effect.targetType, effect.targetType);
        const type = effect.effectType.split('/').pop();
        const flat = scaled(effect, 'baseDamageFlat'), ratio = scaled(effect, 'baseDamageRatio');
        if (['damage', 'heal', 'revive'].includes(type)) {
            const power = `${n(flat)} + ${percent(ratio)} × ${word(effect.combatStyleHrid)}`;
            lines.push(`${target} · ${t(type, type)}${effect.damageType ? ` (${word(effect.damageType)})` : ''}: ${power}`);
        }
        if (effect.spendHpRatio) lines.push(`${t('spend_hp', 'HP cost')}: ${percent(effect.spendHpRatio)}`);
        for (const [field, key] of [['bonusAccuracyRatio', 'bonus_accuracy'], ['armorDamageRatio', 'armor_damage']]) {
            const value = scaled(effect, field);
            if (value) lines.push(`${t(key, key)}: ${percent(value)}`);
        }
        if (effect.damageOverTimeRatio) lines.push(`${t('damage_over_time', 'Damage over time')}: ${percent(effect.damageOverTimeRatio)} · ${n(effect.damageOverTimeDuration / 1e9)}s`);
        for (const [key, field] of [['hp_drain', 'hpDrainRatio'], ['pierce', 'pierceChance'], ['blind', 'blindChance'], ['silence', 'silenceChance'], ['stun', 'stunChance']]) {
            if (effect[field]) lines.push(`${t(key, key)}: ${percent(effect[field])}${effect[key + 'Duration'] ? ` · ${n(effect[key + 'Duration'] / 1e9)}s` : ''}`);
        }
        for (const buff of effect.buffs ?? []) {
            const flat = scaled(buff, 'flatBoost'), ratio = scaled(buff, 'ratioBoost');
            const points = /\/(armor|water_resistance|nature_resistance|fire_resistance|tenacity)$/.test(buff.typeHrid);
            const signed = (value, asPercent) => `${value > 0 ? '+' : ''}${asPercent ? percent(value) : n(value)}`;
            const values = [ratio ? signed(ratio, true) : '', flat ? signed(flat, !points) : ''].filter(Boolean).join(' / ');
            let line = `${target} · ${word(buff.typeHrid)}: ${values} · ${n(buff.duration / 1e9)}s`;
            if (buff.multiplierForSkillHrid && buff.multiplierPerSkillLevel) line += ` × (1 + ${n(buff.multiplierPerSkillLevel)} × ${word(buff.multiplierForSkillHrid)} ${t('level', 'level')})`;
            lines.push(line);
        }
    }
    return lines;
}
