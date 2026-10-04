use crate::{
    actions::{
        definition, number, text, Ability, Consumable, Trigger, TriggerCondition, NEVER_USED,
    },
    attributes::{AttributeCase, AttributeStep, AttributeUnit, UnitInput},
    data::DefinitionSet,
    rng::CombatRng,
};
use serde_json::{json, Value};
pub struct Dependency {
    pub number: f64,
    pub active: bool,
    pub object: bool,
}

pub struct RuntimeUnit {
    pub case: AttributeCase,
    pub attributes: AttributeUnit,
    pub hrid: String,
    pub player: bool,
    pub tier: f64,
    pub enrage_time: f64,
    pub experience_rate: f64,
    pub abilities: Vec<Option<Ability>>,
    pub food: Vec<Option<Consumable>>,
    pub drinks: Vec<Option<Consumable>>,
    pub mana_costs: Vec<(String, f64)>,
    pub stunned: bool,
    pub stun_expire: Option<f64>,
    pub blinded: bool,
    pub blind_expire: Option<f64>,
    pub silenced: bool,
    pub silence_expire: Option<f64>,
    pub out_of_mana: bool,
    pub weakened: bool,
    pub weaken_percentage: f64,
    pub weaken_expire: Option<f64>,
}
impl RuntimeUnit {
    pub fn new(case: AttributeCase, data: &DefinitionSet) -> Result<Self, String> {
        let mut attributes = AttributeUnit::new(case.input.clone(), data)?;
        let (hrid, player, tier, enrage_time, abilities, food, drinks) = match &case.input {
            UnitInput::Player(input) => {
                let abilities = input
                    .abilities
                    .iter()
                    .map(|value| {
                        value
                            .as_ref()
                            .map(|value| Ability::selected(value, data))
                            .transpose()
                    })
                    .collect::<Result<_, _>>()?;
                let selection = |values: &[Option<crate::attributes::SelectionInput>]| {
                    values
                        .iter()
                        .map(|value| {
                            value
                                .as_ref()
                                .map(|value| Consumable::selected(value, data))
                                .transpose()
                        })
                        .collect::<Result<Vec<_>, String>>()
                };
                (
                    input.hrid.clone(),
                    true,
                    0.0,
                    0.0,
                    abilities,
                    selection(&input.food)?,
                    selection(&input.drinks)?,
                )
            }
            UnitInput::Monster(input) => {
                let raw = definition(data, "combatMonsterDetailMap", &input.hrid)?;
                let mut abilities = vec![None; 4];
                let scale = if input.room_level <= 0.0 {
                    1.0
                } else {
                    input.room_level / 100.0
                };
                for (index, entry) in raw["abilities"]
                    .as_array()
                    .ok_or("Missing monster abilities")?
                    .iter()
                    .enumerate()
                {
                    if number(entry, "minDifficultyTier") > input.difficulty_tier {
                        continue;
                    }
                    if abilities.len() <= index {
                        abilities.resize(index + 1, None);
                    }
                    abilities[index] = Some(Ability::new(
                        &text(entry, "abilityHrid"),
                        (number(entry, "level") * scale).floor(),
                        None,
                        data,
                    )?);
                }
                attributes.constructor_monster_state();
                (
                    input.hrid.clone(),
                    false,
                    input.difficulty_tier,
                    number(raw, "enrageTime"),
                    abilities,
                    vec![None; 3],
                    vec![None; 3],
                )
            }
        };
        Ok(Self {
            case,
            attributes,
            hrid,
            player,
            tier,
            enrage_time,
            experience_rate: 0.0,
            abilities,
            food,
            drinks,
            mana_costs: vec![],
            stunned: false,
            stun_expire: None,
            blinded: false,
            blind_expire: None,
            silenced: false,
            silence_expire: None,
            out_of_mana: false,
            weakened: false,
            weaken_percentage: 0.0,
            weaken_expire: None,
        })
    }
    pub fn step(&mut self, step: &AttributeStep, data: &DefinitionSet) -> Result<(), String> {
        self.attributes.apply(step, &self.case, data)
    }
    pub fn clear_cc(&mut self) {
        self.stunned = false;
        self.stun_expire = None;
        self.blinded = false;
        self.blind_expire = None;
        self.silenced = false;
        self.silence_expire = None;
        self.attributes.details.combat_stats.damage_taken = 0.0;
    }
    pub fn reset(
        &mut self,
        time: f64,
        first: bool,
        data: &DefinitionSet,
        rng: &mut CombatRng,
    ) -> Result<(), String> {
        self.clear_cc();
        if first && self.player {
            self.step(&AttributeStep::Start, data)?;
        }
        self.step(&AttributeStep::Reset { time }, data)?;
        if time == 0.0 || !self.player {
            for item in self.food.iter_mut().chain(&mut self.drinks).flatten() {
                item.last_used = NEVER_USED;
            }
            let haste = self.attributes.details.combat_stats.ability_haste;
            for ability in self.abilities.iter_mut().flatten() {
                if self.player {
                    ability.last_used = NEVER_USED;
                } else {
                    let cd = if haste > 0.0 {
                        ability.cooldown * 100.0 / (100.0 + haste)
                    } else {
                        ability.cooldown
                    };
                    ability.last_used =
                        time - (cd * 0.5).floor() + (rng.next_f64() * cd * 0.5).floor();
                }
            }
        }
        Ok(())
    }
    pub fn add_hp(&mut self, amount: f64) -> f64 {
        let details = &mut self.attributes.details;
        if details.current_hitpoints >= details.max_hitpoints {
            return 0.0;
        }
        let next = (details.current_hitpoints + amount).min(details.max_hitpoints);
        let added = next - details.current_hitpoints;
        details.current_hitpoints = next;
        added
    }
    pub fn add_mp(&mut self, amount: f64) -> f64 {
        let details = &mut self.attributes.details;
        if details.current_manapoints >= details.max_manapoints {
            return 0.0;
        }
        let next = (details.current_manapoints + amount).min(details.max_manapoints);
        let added = next - details.current_manapoints;
        details.current_manapoints = next;
        added
    }
    pub fn alive(&self) -> bool {
        self.attributes.details.current_hitpoints > 0.0
    }
    pub fn snapshot(&self) -> Value {
        let ability = |value: &Option<Ability>| {
            value.as_ref().map(
                |value| json!({"hrid":value.hrid,"level":value.level,"lastUsed":value.last_used}),
            )
        };
        let consumable = |value: &Option<Consumable>| {
            value
                .as_ref()
                .map(|value| json!({"hrid":value.hrid,"lastUsed":value.last_used}))
        };
        json!({ "hrid": self.hrid, "isPlayer": self.player, "attributes": self.attributes.snapshot(), "buffs": self.attributes.buffs_snapshot(),
            "isStunned": self.stunned, "stunExpireTime": self.stun_expire, "isBlinded": self.blinded, "blindExpireTime": self.blind_expire,
            "isSilenced": self.silenced, "silenceExpireTime": self.silence_expire, "isOutOfMana": self.out_of_mana,
            "isWeakened": self.weakened, "weakenPercentage": self.weaken_percentage, "weakenExpireTime": self.weaken_expire,
            "experienceRate": self.experience_rate, "abilities": self.abilities.iter().map(ability).collect::<Vec<_>>(),
            "food": self.food.iter().map(consumable).collect::<Vec<_>>(), "drinks": self.drinks.iter().map(consumable).collect::<Vec<_>>(), "abilityManaCosts": self.mana_costs })
    }
    pub(crate) fn assign_buff_identities(&mut self, prefix: usize) {
        let mut ordinal = 0u64;
        for ability in self.abilities.iter_mut().flatten() {
            for effect in &mut ability.effects {
                for buff in effect.buffs.iter_mut().flatten() {
                    ordinal += 1;
                    buff.buff.instance = Some(((prefix as u64 + 1) << 32) | ordinal);
                }
            }
        }
    }
    pub fn trigger_value(&self, trigger: &Trigger, time: f64) -> Result<Dependency, String> {
        let details = &self.attributes.details;
        let value = match trigger.condition {
            TriggerCondition::CurrentHp => details.current_hitpoints,
            TriggerCondition::CurrentMp => details.current_manapoints,
            TriggerCondition::MissingHp => details.max_hitpoints - details.current_hitpoints,
            TriggerCondition::MissingMp => details.max_manapoints - details.current_manapoints,
            TriggerCondition::Stun => {
                if self.stunned || self.stun_expire == Some(time) {
                    1.0
                } else {
                    0.0
                }
            }
            TriggerCondition::Blind => {
                if self.blinded || self.blind_expire == Some(time) {
                    1.0
                } else {
                    0.0
                }
            }
            TriggerCondition::Silence => {
                if self.silenced || self.silence_expire == Some(time) {
                    1.0
                } else {
                    0.0
                }
            }
            TriggerCondition::Buff { key, prefix } => {
                let active = self.attributes.has_buff(key, prefix);
                return Ok(Dependency {
                    number: f64::NAN,
                    active,
                    object: active,
                });
            }
            _ => {
                return Err(format!(
                    "Unknown trigger condition: {}",
                    trigger.condition_hrid.rsplit('/').next().unwrap_or("")
                ))
            }
        };
        Ok(Dependency {
            number: value,
            active: value != 0.0 && !value.is_nan(),
            object: false,
        })
    }
}
