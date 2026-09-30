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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Trigger {
    pub dependency_hrid: String,
    pub condition_hrid: String,
    pub comparator_hrid: String,
    #[serde(default)]
    pub value: f64,
}
fn triggers(selection: Option<&Value>, defaults: &Value) -> Result<Vec<Trigger>, String> {
    let value = selection
        .filter(|value| !value.is_null())
        .unwrap_or(defaults);
    let result: Vec<Trigger> =
        serde_json::from_value(value.clone()).map_err(|_| "Invalid combat triggers")?;
    Ok(result)
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
    pub category: String,
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
            category: text(item, "categoryHrid"),
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
