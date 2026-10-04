use crate::{
    attributes::{buff_definition, CombatBuff, SelectionInput},
    data::DefinitionSet,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const NEVER_USED: f64 = -9_007_199_254_740_991.0;
pub fn number(value: &Value, key: &str) -> f64 {
    value[key].as_f64().unwrap_or(0.0)
}
pub fn text(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or("").into()
}
pub fn definition<'a>(
    data: &'a DefinitionSet,
    table: &str,
    hrid: &str,
) -> Result<&'a Value, String> {
    data.definition(table)?
        .get(hrid)
        .ok_or_else(|| format!("Unknown {table} entry: {hrid}"))
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", from = "TriggerInput")]
pub struct Trigger {
    dependency_hrid: String,
    pub(crate) condition_hrid: String,
    comparator_hrid: String,
    pub value: f64,
    #[serde(skip)]
    pub(crate) dependency: TriggerDependency,
    #[serde(skip)]
    pub(crate) condition: TriggerCondition,
    #[serde(skip)]
    pub(crate) comparator: TriggerComparator,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TriggerInput {
    dependency_hrid: String,
    condition_hrid: String,
    comparator_hrid: String,
    #[serde(default)]
    value: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum TriggerDependency {
    SelfUnit,
    Target,
    Allies,
    Enemies,
    Unknown,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum TriggerComparator {
    GreaterEqual,
    LessEqual,
    Active,
    Inactive,
    Unknown,
}
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum TriggerCondition {
    CurrentHp,
    CurrentMp,
    MissingHp,
    MissingMp,
    Stun,
    Blind,
    Silence,
    ActiveUnits,
    DeadUnits,
    LowestHp,
    Buff { key: &'static str, prefix: bool },
    Unknown,
}

impl From<TriggerInput> for Trigger {
    fn from(input: TriggerInput) -> Self {
        let dependency = match input.dependency_hrid.rsplit('/').next().unwrap_or("") {
            "self" => TriggerDependency::SelfUnit,
            "targeted_enemy" => TriggerDependency::Target,
            "all_allies" => TriggerDependency::Allies,
            "all_enemies" => TriggerDependency::Enemies,
            _ => TriggerDependency::Unknown,
        };
        let comparator = match input.comparator_hrid.rsplit('/').next().unwrap_or("") {
            "greater_than_equal" => TriggerComparator::GreaterEqual,
            "less_than_equal" => TriggerComparator::LessEqual,
            "is_active" => TriggerComparator::Active,
            "is_inactive" => TriggerComparator::Inactive,
            _ => TriggerComparator::Unknown,
        };
        // Keep unknown identifiers for the original evaluation-time error path.
        // Cooldown/CC/absent-target checks must still be able to skip them.
        let condition = TriggerCondition::parse(&input.condition_hrid);
        Self {
            dependency_hrid: input.dependency_hrid,
            condition_hrid: input.condition_hrid,
            comparator_hrid: input.comparator_hrid,
            value: input.value,
            dependency,
            condition,
            comparator,
        }
    }
}

impl TriggerCondition {
    fn parse(hrid: &str) -> Self {
        match hrid.rsplit('/').next().unwrap_or("") {
            "current_hp" => Self::CurrentHp,
            "current_mp" => Self::CurrentMp,
            "missing_hp" => Self::MissingHp,
            "missing_mp" => Self::MissingMp,
            "stun_status" => Self::Stun,
            "blind_status" => Self::Blind,
            "silence_status" => Self::Silence,
            "number_of_active_units" => Self::ActiveUnits,
            "number_of_dead_units" => Self::DeadUnits,
            "lowest_hp_percentage" => Self::LowestHp,
            "berserk" => Self::Buff {
                key: "/buff_uniques/berserk",
                prefix: false,
            },
            "frenzy" => Self::Buff {
                key: "/buff_uniques/frenzy",
                prefix: false,
            },
            "precision" => Self::Buff {
                key: "/buff_uniques/precision",
                prefix: false,
            },
            "vampirism" => Self::Buff {
                key: "/buff_uniques/vampirism",
                prefix: false,
            },
            "attack_coffee" => Self::Buff {
                key: "/buff_uniques/attack_coffee",
                prefix: false,
            },
            "defense_coffee" => Self::Buff {
                key: "/buff_uniques/defense_coffee",
                prefix: false,
            },
            "lucky_coffee" => Self::Buff {
                key: "/buff_uniques/lucky_coffee",
                prefix: false,
            },
            "magic_coffee" => Self::Buff {
                key: "/buff_uniques/magic_coffee",
                prefix: false,
            },
            "melee_coffee" => Self::Buff {
                key: "/buff_uniques/melee_coffee",
                prefix: false,
            },
            "ranged_coffee" => Self::Buff {
                key: "/buff_uniques/ranged_coffee",
                prefix: false,
            },
            "swiftness_coffee" => Self::Buff {
                key: "/buff_uniques/swiftness_coffee",
                prefix: false,
            },
            "wisdom_coffee" => Self::Buff {
                key: "/buff_uniques/wisdom_coffee",
                prefix: false,
            },
            "ice_spear" => Self::Buff {
                key: "/buff_uniques/ice_spear",
                prefix: false,
            },
            "puncture" => Self::Buff {
                key: "/buff_uniques/puncture",
                prefix: false,
            },
            "frost_surge" => Self::Buff {
                key: "/buff_uniques/frost_surge",
                prefix: false,
            },
            "elusiveness" => Self::Buff {
                key: "/buff_uniques/elusiveness",
                prefix: false,
            },
            "channeling_coffee" => Self::Buff {
                key: "/buff_uniques/channeling_coffee",
                prefix: false,
            },
            "fierce_aura" => Self::Buff {
                key: "/buff_uniques/fierce_aura",
                prefix: false,
            },
            "invincible_armor" => Self::Buff {
                key: "/buff_uniques/invincible_armor",
                prefix: false,
            },
            "invincible_fire_resistance" => Self::Buff {
                key: "/buff_uniques/invincible_fire_resistance",
                prefix: false,
            },
            "invincible_nature_resistance" => Self::Buff {
                key: "/buff_uniques/invincible_nature_resistance",
                prefix: false,
            },
            "invincible_water_resistance" => Self::Buff {
                key: "/buff_uniques/invincible_water_resistance",
                prefix: false,
            },
            "provoke" => Self::Buff {
                key: "/buff_uniques/provoke",
                prefix: false,
            },
            "taunt" => Self::Buff {
                key: "/buff_uniques/taunt",
                prefix: false,
            },
            "crippling_slash" => Self::Buff {
                key: "/buff_uniques/crippling_slash",
                prefix: false,
            },
            "mana_spring" => Self::Buff {
                key: "/buff_uniques/mana_spring",
                prefix: false,
            },
            "retribution" => Self::Buff {
                key: "/buff_uniques/retribution",
                prefix: false,
            },
            "fracturing_impact" => Self::Buff {
                key: "/buff_uniques/fracturing_impact",
                prefix: false,
            },
            "maim" => Self::Buff {
                key: "/buff_uniques/maim",
                prefix: false,
            },
            "curse" => Self::Buff {
                key: "/buff_uniques/curse",
                prefix: false,
            },
            "weaken" => Self::Buff {
                key: "/buff_uniques/weaken",
                prefix: false,
            },
            "critical_aura" => Self::Buff {
                key: "/buff_uniques/critical_aura",
                prefix: true,
            },
            "critical_coffee" => Self::Buff {
                key: "/buff_uniques/critical_coffee",
                prefix: true,
            },
            "intelligence_coffee" => Self::Buff {
                key: "/buff_uniques/intelligence_coffee",
                prefix: true,
            },
            "stamina_coffee" => Self::Buff {
                key: "/buff_uniques/stamina_coffee",
                prefix: true,
            },
            "elemental_affinity" => Self::Buff {
                key: "/buff_uniques/elemental_affinity",
                prefix: true,
            },
            "fury" => Self::Buff {
                key: "/buff_uniques/fury",
                prefix: true,
            },
            "guardian_aura" => Self::Buff {
                key: "/buff_uniques/guardian_aura",
                prefix: true,
            },
            "insanity" => Self::Buff {
                key: "/buff_uniques/insanity",
                prefix: true,
            },
            "spike_shell" => Self::Buff {
                key: "/buff_uniques/spike_shell",
                prefix: true,
            },
            "toxic_pollen" => Self::Buff {
                key: "/buff_uniques/toxic_pollen",
                prefix: true,
            },
            "invincible" => Self::Buff {
                key: "/buff_uniques/invincible",
                prefix: true,
            },
            "mystic_aura" => Self::Buff {
                key: "/buff_uniques/mystic_aura",
                prefix: true,
            },
            "pestilent_shot" => Self::Buff {
                key: "/buff_uniques/pestilent_shot",
                prefix: true,
            },
            "smoke_burst" => Self::Buff {
                key: "/buff_uniques/smoke_burst",
                prefix: true,
            },
            "speed_aura" => Self::Buff {
                key: "/buff_uniques/speed_aura",
                prefix: true,
            },
            "toughness" => Self::Buff {
                key: "/buff_uniques/toughness",
                prefix: true,
            },
            "enrage" => Self::Buff {
                key: "/buff_uniques/enrage",
                prefix: true,
            },
            _ => Self::Unknown,
        }
    }
}
fn triggers(selection: Option<&Value>, defaults: &Value) -> Result<Vec<Trigger>, String> {
    let value = selection
        .filter(|value| !value.is_null())
        .unwrap_or(defaults);
    let result: Vec<Trigger> =
        serde_json::from_value(value.clone()).map_err(|_| "Invalid combat triggers")?;
    Ok(result)
}

#[cfg(test)]
mod trigger_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn compiled_triggers_preserve_wire_shape_defaults_and_late_errors() {
        let input = json!({"dependencyHrid": "/custom/self", "conditionHrid": "/custom/critical_aura",
            "comparatorHrid": "/custom/is_active"});
        let trigger: Trigger = serde_json::from_value(input.clone()).unwrap();
        assert_eq!(trigger.dependency, TriggerDependency::SelfUnit);
        assert_eq!(
            trigger.condition,
            TriggerCondition::Buff {
                key: "/buff_uniques/critical_aura",
                prefix: true
            }
        );
        assert_eq!(trigger.comparator, TriggerComparator::Active);
        assert_eq!(trigger.value, 0.0);
        let mut expected = input;
        expected["value"] = json!(0.0);
        assert_eq!(serde_json::to_value(&trigger).unwrap(), expected);
        expected["condition"] = json!("injected compiled value");
        assert!(serde_json::from_value::<Trigger>(expected).is_err());
        let unknown: Trigger = serde_json::from_value(json!({"dependencyHrid": "future",
            "conditionHrid": "future", "comparatorHrid": "future"}))
        .unwrap();
        assert_eq!(unknown.dependency, TriggerDependency::Unknown);
        assert_eq!(unknown.condition, TriggerCondition::Unknown);
        assert_eq!(unknown.comparator, TriggerComparator::Unknown);
    }
}

#[derive(Clone)]
pub struct EffectBuff {
    pub buff: CombatBuff,
    pub skill: String,
    pub multiplier: f64,
}
impl EffectBuff {
    fn new(value: &Value, level: f64) -> Result<Self, String> {
        Ok(Self {
            buff: buff_definition(value, level)?,
            skill: text(value, "multiplierForSkillHrid"),
            multiplier: number(value, "multiplierPerSkillLevel"),
        })
    }
}
#[derive(Clone)]
pub struct AbilityEffect {
    pub target: String,
    pub kind: String,
    pub style: String,
    pub damage_type: String,
    pub damage_flat: f64,
    pub damage_ratio: f64,
    pub bonus_accuracy: f64,
    pub dot_ratio: f64,
    pub dot_duration: f64,
    pub armor_damage_ratio: f64,
    pub hp_drain_ratio: f64,
    pub pierce: f64,
    pub stun: f64,
    pub stun_duration: f64,
    pub blind: f64,
    pub blind_duration: f64,
    pub silence: f64,
    pub silence_duration: f64,
    pub spend_hp_ratio: f64,
    pub buffs: Option<Vec<EffectBuff>>,
}
#[derive(Clone)]
pub struct Ability {
    pub hrid: String,
    pub level: f64,
    pub mana_cost: f64,
    pub cooldown: f64,
    pub cast: f64,
    pub special: bool,
    pub effects: Vec<AbilityEffect>,
    pub triggers: Vec<Trigger>,
    pub last_used: f64,
}
impl Ability {
    pub fn new(
        hrid: &str,
        level: f64,
        selected: Option<&Value>,
        data: &DefinitionSet,
    ) -> Result<Self, String> {
        let raw = definition(data, "abilityDetailMap", hrid)?;
        let mut effects = Vec::new();
        for effect in raw["abilityEffects"]
            .as_array()
            .ok_or("Invalid ability effects")?
        {
            let scaled = |key: &str| {
                number(effect, key) + (level - 1.0) * number(effect, &format!("{key}LevelBonus"))
            };
            let buffs = effect["buffs"]
                .as_array()
                .map(|values| {
                    values
                        .iter()
                        .map(|value| EffectBuff::new(value, level))
                        .collect::<Result<_, _>>()
                })
                .transpose()?;
            effects.push(AbilityEffect {
                target: text(effect, "targetType"),
                kind: text(effect, "effectType"),
                style: text(effect, "combatStyleHrid"),
                damage_type: text(effect, "damageType"),
                damage_flat: scaled("baseDamageFlat"),
                damage_ratio: scaled("baseDamageRatio"),
                bonus_accuracy: scaled("bonusAccuracyRatio"),
                dot_ratio: number(effect, "damageOverTimeRatio"),
                dot_duration: number(effect, "damageOverTimeDuration"),
                armor_damage_ratio: scaled("armorDamageRatio"),
                hp_drain_ratio: number(effect, "hpDrainRatio"),
                pierce: number(effect, "pierceChance"),
                stun: number(effect, "stunChance"),
                stun_duration: number(effect, "stunDuration"),
                blind: number(effect, "blindChance"),
                blind_duration: number(effect, "blindDuration"),
                silence: number(effect, "silenceChance"),
                silence_duration: number(effect, "silenceDuration"),
                spend_hp_ratio: number(effect, "spendHpRatio"),
                buffs,
            });
        }
        Ok(Self {
            hrid: hrid.into(),
            level,
            mana_cost: number(raw, "manaCost"),
            cooldown: number(raw, "cooldownDuration"),
            cast: number(raw, "castDuration"),
            special: raw["isSpecialAbility"].as_bool().unwrap_or(false),
            effects,
            triggers: triggers(selected, &raw["defaultCombatTriggers"])?,
            last_used: NEVER_USED,
        })
    }
    pub fn selected(value: &SelectionInput, data: &DefinitionSet) -> Result<Self, String> {
        Self::new(&value.hrid, value.level, value.triggers.as_ref(), data)
    }
    // These two effects are defined in the original Ability JS class, not the public map.
    pub fn proc(kind: &str) -> Self {
        let effect = AbilityEffect {
            target: if kind == "blaze" {
                "allEnemies"
            } else {
                "lowestHpAlly"
            }
            .into(),
            kind: format!(
                "/ability_effect_types/{}",
                if kind == "blaze" { "damage" } else { "heal" }
            ),
            style: "/combat_styles/magic".into(),
            damage_type: if kind == "blaze" {
                "/damage_types/fire"
            } else {
                ""
            }
            .into(),
            damage_flat: if kind == "blaze" { 0.0 } else { 10.0 },
            damage_ratio: if kind == "blaze" { 0.3 } else { 0.15 },
            bonus_accuracy: 0.0,
            dot_ratio: 0.0,
            dot_duration: 0.0,
            armor_damage_ratio: 0.0,
            hp_drain_ratio: 0.0,
            pierce: 0.0,
            stun: 0.0,
            stun_duration: 0.0,
            blind: 0.0,
            blind_duration: 0.0,
            silence: 0.0,
            silence_duration: 0.0,
            spend_hp_ratio: 0.0,
            buffs: None,
        };
        Self {
            hrid: kind.into(),
            level: 1.0,
            mana_cost: 0.0,
            cooldown: 0.0,
            cast: 0.0,
            special: false,
            effects: vec![effect],
            triggers: vec![],
            last_used: NEVER_USED,
        }
    }
}
#[derive(Clone)]
pub struct Consumable {
    pub hrid: String,
    // Preserve the two independent substring checks, including categories
    // containing both names or neither; classification is fixed at creation.
    pub is_food: bool,
    pub is_drink: bool,
    pub cooldown: f64,
    pub hp: f64,
    pub mp: f64,
    pub recovery: f64,
    pub buffs: Vec<CombatBuff>,
    pub triggers: Vec<Trigger>,
    pub last_used: f64,
}
impl Consumable {
    pub fn selected(value: &SelectionInput, data: &DefinitionSet) -> Result<Self, String> {
        let item = definition(data, "itemDetailMap", &value.hrid)?;
        let category = item["categoryHrid"].as_str().unwrap_or("");
        let raw = &item["consumableDetail"];
        let buffs = raw["buffs"]
            .as_array()
            .map(|values| {
                values
                    .iter()
                    .map(|value| buff_definition(value, 1.0))
                    .collect::<Result<_, _>>()
            })
            .transpose()?
            .unwrap_or_default();
        Ok(Self {
            hrid: value.hrid.clone(),
            is_food: category.contains("food"),
            is_drink: category.contains("drink"),
            cooldown: number(raw, "cooldownDuration"),
            hp: number(raw, "hitpointRestore"),
            mp: number(raw, "manapointRestore"),
            recovery: number(raw, "recoveryDuration"),
            buffs,
            triggers: triggers(value.triggers.as_ref(), &raw["defaultCombatTriggers"])?,
            last_used: NEVER_USED,
        })
    }
}
