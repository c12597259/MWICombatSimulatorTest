use crate::{actions::AbilityEffect, rng::CombatRng, runtime_unit::RuntimeUnit};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

// Frozen JS runs on V8 10.2's fdlibm pow. Do not substitute the host CRT powf.
pub fn js_pow_1p4(value: f64) -> f64 {
    crate::js_pow::pow_1p4(value)
}
pub fn random_int(mut min: f64, mut max: f64, rng: &mut CombatRng) -> f64 {
    if max < min {
        std::mem::swap(&mut min, &mut max);
    }
    let min_ceil = min.ceil();
    let max_floor = max.floor();
    if min.floor() == max_floor {
        return ((min + max) / 2.0 + rng.next_f64()).floor();
    }
    let min_tail = -(min - min_ceil);
    let max_tail = max - max_floor;
    let weight = 2.0 * min_tail + (max_floor - min_ceil);
    let balanced_average = (max_floor + min_ceil) / 2.0;
    let average = (max + min) / 2.0;
    let extra_weight = (weight * (average - balanced_average)) / (max_floor + 1.0 - average);
    let chance = (extra_weight / (extra_weight + weight)).abs();
    if rng.next_f64() < chance {
        return if max_tail > min_tail {
            (max_floor + 1.0).floor()
        } else {
            (min_ceil - 1.0).floor()
        };
    }
    if max_tail > min_tail {
        (min + rng.next_f64() * (max_floor + min_tail - min + 1.0)).floor()
    } else {
        (min_ceil - max_tail + rng.next_f64() * (max - (min_ceil - max_tail) + 1.0)).floor()
    }
}
pub fn tick_value(total: f64, ticks: f64, tick: f64) -> f64 {
    ((tick * total) / ticks).floor() - (((tick - 1.0) * total) / ticks).floor()
}
fn resistance_ratio(resistance: f64) -> f64 {
    if resistance < 0.0 {
        (100.0 - resistance) / 100.0
    } else {
        100.0 / (100.0 + resistance)
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttackResult {
    pub damage_done: f64,
    pub did_hit: bool,
    pub thorn_damage_done: f64,
    pub thorn_type: String,
    pub retaliation_damage_done: f64,
    pub life_steal_heal: f64,
    pub hp_drain: f64,
    pub mana_leech_mana: f64,
    pub is_crit: bool,
}
pub fn attack(
    source: &mut RuntimeUnit,
    target: &mut RuntimeUnit,
    effect: Option<&AbilityEffect>,
    rng: &mut CombatRng,
) -> Result<AttackResult, String> {
    let s = &source.attributes.details;
    let t = &target.attributes.details;
    let stats = &s.combat_stats;
    let target_stats = &t.combat_stats;
    let style = effect
        .map(|value| value.style.as_str())
        .unwrap_or(&stats.combat_style_hrid);
    let damage_type = effect
        .map(|value| value.damage_type.as_str())
        .unwrap_or(&stats.damage_type);
    let (mut accuracy, max_damage, evasion) = match style {
        "/combat_styles/stab" => (
            s.stab_accuracy_rating,
            s.stab_max_damage,
            t.stab_evasion_rating,
        ),
        "/combat_styles/slash" => (
            s.slash_accuracy_rating,
            s.slash_max_damage,
            t.slash_evasion_rating,
        ),
        "/combat_styles/smash" => (
            s.smash_accuracy_rating,
            s.smash_max_damage,
            t.smash_evasion_rating,
        ),
        "/combat_styles/ranged" => (
            s.ranged_accuracy_rating,
            s.ranged_max_damage,
            t.ranged_evasion_rating,
        ),
        "/combat_styles/magic" => (
            s.magic_accuracy_rating,
            s.magic_max_damage,
            t.magic_evasion_rating,
        ),
        _ => return Err("Unknown combat style".into()),
    };
    let (
        multiplier,
        source_resistance,
        penetration,
        target_resistance,
        thorns,
        target_penetration,
        thorn_type,
    ) = match damage_type {
        "/damage_types/physical" => (
            1.0 + stats.physical_amplify,
            s.total_armor,
            stats.armor_penetration,
            t.total_armor,
            target_stats.physical_thorns,
            target_stats.armor_penetration,
            "physicalThorns",
        ),
        "/damage_types/water" => (
            1.0 + stats.water_amplify,
            s.total_water_resistance,
            stats.water_penetration,
            t.total_water_resistance,
            target_stats.elemental_thorns,
            target_stats.water_penetration,
            "elementalThorns",
        ),
        "/damage_types/nature" => (
            1.0 + stats.nature_amplify,
            s.total_nature_resistance,
            stats.nature_penetration,
            t.total_nature_resistance,
            target_stats.elemental_thorns,
            target_stats.nature_penetration,
            "elementalThorns",
        ),
        "/damage_types/fire" => (
            1.0 + stats.fire_amplify,
            s.total_fire_resistance,
            stats.fire_penetration,
            t.total_fire_resistance,
            target_stats.elemental_thorns,
            target_stats.fire_penetration,
            "elementalThorns",
        ),
        _ => return Err("Unknown damage type".into()),
    };
    if let Some(effect) = effect {
        accuracy *= 1.0 + effect.bonus_accuracy;
    }
    if source.weakened {
        accuracy = accuracy - source.weaken_percentage * accuracy;
    }
    let hit_chance = js_pow_1p4(accuracy) / (js_pow_1p4(accuracy) + js_pow_1p4(evasion));
    let crit_chance = (if style == "/combat_styles/ranged" {
        0.3 * hit_chance
    } else {
        0.0
    }) + stats.critical_rate;
    let flat = effect.map_or(0.0, |value| value.damage_flat);
    let ratio = effect.map_or(1.0, |value| value.damage_ratio);
    let armor = effect.map_or(0.0, |value| value.armor_damage_ratio * s.total_armor);
    let mut min = multiplier * (1.0 + flat + armor);
    let mut max = multiplier * (ratio * max_damage + flat + armor);
    let is_crit = rng.next_f64() < crit_chance;
    if is_crit {
        max *= 1.0 + stats.critical_damage;
        min = max;
    }
    let mut roll = random_int(min, max, rng);
    roll *= 1.0 + stats.task_damage;
    roll *= 1.0 + target_stats.damage_taken;
    if effect.is_none() {
        roll += roll * stats.auto_attack_damage;
    } else {
        roll *= 1.0 + stats.ability_damage;
    }
    let did_hit = rng.next_f64() < hit_chance;
    let damage = if did_hit {
        let resistance = if penetration > 0.0 && target_resistance > 0.0 {
            target_resistance / (1.0 + penetration)
        } else {
            target_resistance
        };
        (resistance_ratio(resistance) * roll)
            .ceil()
            .min(t.current_hitpoints)
    } else {
        0.0
    };
    let thorn_damage = if thorns > 0.0 && target_resistance > -99.0 {
        let resistance = if source_resistance > 0.0 {
            source_resistance / (1.0 + target_penetration)
        } else {
            source_resistance
        };
        let multiplier = (1.0 + target_stats.task_damage) * (1.0 + stats.damage_taken);
        let roll = random_int(
            1.0,
            multiplier * t.defensive_max_damage * (1.0 + target_resistance / 100.0) * thorns,
            rng,
        );
        (resistance_ratio(resistance) * roll)
            .ceil()
            .min(s.current_hitpoints)
    } else {
        0.0
    };
    let retaliation = if target_stats.retaliation > 0.0 {
        let chance = js_pow_1p4(t.smash_accuracy_rating)
            / (js_pow_1p4(t.smash_accuracy_rating) + js_pow_1p4(s.smash_evasion_rating));
        if chance > rng.next_f64() {
            let resistance = if s.total_armor > 0.0 {
                s.total_armor / (1.0 + target_stats.armor_penetration)
            } else {
                s.total_armor
            };
            let multiplier = (1.0 + target_stats.task_damage) * (1.0 + stats.damage_taken);
            let damage = roll.min(t.defensive_max_damage * 5.0);
            let min = multiplier * target_stats.retaliation * damage;
            let max = multiplier * target_stats.retaliation * (t.defensive_max_damage + damage);
            (resistance_ratio(resistance) * random_int(min, max, rng))
                .ceil()
                .min(s.current_hitpoints - thorn_damage)
        } else {
            0.0
        }
    } else {
        0.0
    };
    let life_steal = stats.life_steal;
    let mana_leech = stats.mana_leech;
    let healing = 1.0 + stats.healing_amplify;
    target.attributes.details.current_hitpoints -= damage;
    source.attributes.details.current_hitpoints -= thorn_damage;
    source.attributes.details.current_hitpoints -= retaliation;
    let life_steal_heal = if effect.is_none() && did_hit && life_steal > 0.0 {
        source.add_hp((life_steal * damage).floor())
    } else {
        0.0
    };
    let hp_drain = if let Some(effect) = effect {
        if did_hit && effect.hp_drain_ratio > 0.0 {
            source.add_hp((effect.hp_drain_ratio * damage * healing).floor())
        } else {
            0.0
        }
    } else {
        0.0
    };
    let mana_leech_mana = if effect.is_none() && did_hit && mana_leech > 0.0 {
        source.add_mp((mana_leech * damage).floor())
    } else {
        0.0
    };
    Ok(AttackResult {
        damage_done: damage,
        did_hit,
        thorn_damage_done: thorn_damage,
        thorn_type: thorn_type.into(),
        retaliation_damage_done: retaliation,
        life_steal_heal,
        hp_drain,
        mana_leech_mana,
        is_crit,
    })
}
pub fn heal_roll(
    source: &RuntimeUnit,
    effect: &AbilityEffect,
    rng: &mut CombatRng,
) -> Result<f64, String> {
    if effect.style != "/combat_styles/magic" {
        return Err("Unsupported heal combat style".into());
    }
    let multiplier = 1.0 + source.attributes.details.combat_stats.healing_amplify;
    Ok(random_int(
        multiplier * (1.0 + effect.damage_flat),
        multiplier
            * (effect.damage_ratio * source.attributes.details.magic_max_damage
                + effect.damage_flat),
        rng,
    ))
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum MathCase {
    Pow {
        values: Vec<f64>,
    },
    RandomInt {
        min: f64,
        max: f64,
        seed: u32,
        draws: u32,
    },
    Tick {
        total: f64,
        ticks: f64,
    },
}
pub fn math_trace(cases: &[MathCase]) -> Result<Value, String> {
    if cases.len() > 10_000 {
        return Err("Too many math cases".into());
    }
    let mut result = Vec::new();
    for case in cases {
        result.push(match case {
            MathCase::Pow { values } => {
                if values.len() > 100_000 {
                    return Err("Too many pow values".into());
                }
                json!(values
                    .iter()
                    .map(|value| js_pow_1p4(*value))
                    .collect::<Vec<_>>())
            }
            MathCase::RandomInt {
                min,
                max,
                seed,
                draws,
            } => {
                if *draws > 100_000 {
                    return Err("Too many random draws".into());
                }
                let mut rng = CombatRng::new(*seed);
                let mut values = Vec::new();
                for _ in 0..*draws {
                    values.push(
                        json!({ "value": random_int(*min, *max, &mut rng), "calls": rng.calls() }),
                    );
                }
                json!(values)
            }
            MathCase::Tick { total, ticks } => {
                if *ticks < 1.0 || *ticks > 10_000.0 {
                    return Err("Invalid tick count".into());
                }
                json!((1..=*ticks as u32)
                    .map(|tick| tick_value(*total, *ticks, f64::from(tick)))
                    .collect::<Vec<_>>())
            }
        });
    }
    Ok(json!(result))
}
