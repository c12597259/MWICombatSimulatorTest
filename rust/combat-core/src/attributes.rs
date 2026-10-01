use crate::{
    data::DefinitionSet,
    stats::{CombatDetails, CombatStats, EQUIPMENT_STATS, MONSTER_ZERO_STATS},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const LEVELS: [&str; 7] = [
    "stamina",
    "intelligence",
    "attack",
    "melee",
    "defense",
    "ranged",
    "magic",
];
const DEFAULT_SLOTS: [&str; 10] = [
    "head",
    "body",
    "legs",
    "feet",
    "hands",
    "main_hand",
    "two_hand",
    "off_hand",
    "pouch",
    "back",
];

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EquipmentInput {
    pub slot: String,
    pub hrid: Option<String>,
    pub enhancement_level: f64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SelectionInput {
    pub hrid: String,
    #[serde(default)]
    pub level: f64,
    pub triggers: Option<Value>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayerInput {
    pub input_version: u32,
    pub hrid: String,
    pub levels: [f64; 7],
    pub equipment: Vec<EquipmentInput>,
    pub house_rooms: Vec<(String, f64)>,
    pub achievements: Value,
    pub shrines: [f64; 5],
    pub guild_buffs: Vec<CombatBuff>,
    pub food: Vec<Option<SelectionInput>>,
    pub drinks: Vec<Option<SelectionInput>>,
    pub abilities: Vec<Option<SelectionInput>>,
    pub debuff_on_level_gap: f64,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MonsterInput {
    pub hrid: String,
    #[serde(default)]
    pub difficulty_tier: f64,
    #[serde(default)]
    pub room_level: f64,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum UnitInput {
    Player(Box<PlayerInput>),
    Monster(MonsterInput),
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatBuff {
    #[serde(skip)]
    pub instance: Option<u64>,
    pub unique_hrid: String,
    pub type_hrid: String,
    pub ratio_boost: f64,
    pub flat_boost: f64,
    #[serde(default)]
    pub duration: f64,
    #[serde(default)]
    pub start_time: Option<f64>,
}

#[derive(Clone, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum AttributeStep {
    Update,
    Start,
    Clear,
    Add { buffs: Vec<CombatBuff>, time: f64 },
    Remove { keys: Vec<String> },
    Expire { time: f64 },
    Reset { time: f64 },
    Equip { equipment: EquipmentInput },
    Levels { levels: [f64; 7] },
    Shrines { levels: [f64; 5] },
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttributeCase {
    pub input: UnitInput,
    #[serde(default)]
    pub zone_hrid: Option<String>,
    #[serde(default)]
    pub extra: Value,
    #[serde(default)]
    pub steps: Vec<AttributeStep>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttributeSnapshot {
    base_levels: [f64; 7],
    experience: f64,
    combat_details: Value,
    buff_keys: Vec<String>,
}

#[derive(Clone)]
struct BuffEntry {
    key: String,
    buff: CombatBuff,
}

struct EquipmentStatsCache {
    definition_hash: String,
    stats: CombatStats,
}

pub struct AttributeUnit {
    input: UnitInput,
    equipment: Vec<EquipmentInput>,
    equipment_base: Option<EquipmentStatsCache>,
    base_levels: [f64; 7],
    pub details: CombatDetails,
    pub experience: f64,
    buffs: Vec<BuffEntry>,
    permanent: Vec<BuffEntry>,
    initialized: bool,
}

fn number(value: &Value, key: &str) -> f64 {
    value.get(key).and_then(Value::as_f64).unwrap_or(0.0)
}
fn string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(String::from)
}
fn lookup<'a>(data: &'a DefinitionSet, table: &str, key: &str) -> Result<&'a Value, String> {
    data.definition(table)?
        .get(key)
        .ok_or_else(|| format!("Unknown {table} entry: {key}"))
}
pub fn buff_definition(value: &Value, level: f64) -> Result<CombatBuff, String> {
    Ok(CombatBuff {
        instance: None,
        unique_hrid: string(value, "uniqueHrid").ok_or("Missing buff identity")?,
        type_hrid: string(value, "typeHrid").ok_or("Missing buff type")?,
        ratio_boost: number(value, "ratioBoost")
            + (level - 1.0) * number(value, "ratioBoostLevelBonus"),
        flat_boost: number(value, "flatBoost")
            + (level - 1.0) * number(value, "flatBoostLevelBonus"),
        duration: number(value, "duration"),
        start_time: None,
    })
}
fn integer_key(key: &str) -> Option<u32> {
    let value: u32 = key.parse().ok()?;
    (value != u32::MAX && value.to_string() == key).then_some(value)
}
fn ordered_buffs(buffs: &[BuffEntry]) -> Vec<&BuffEntry> {
    let mut output: Vec<_> = buffs.iter().collect();
    output.sort_by_key(|entry| integer_key(&entry.key).map_or((1, 0), |value| (0, value)));
    output
}

impl AttributeUnit {
    // JS ability buffs are shared objects. Refresh only their timestamp here;
    // cached combat details are recalculated by the same later events as JS.
    pub(crate) fn refresh_shared_buff(&mut self, instance: u64, time: Option<f64>) {
        for entry in &mut self.buffs {
            if entry.buff.instance == Some(instance) {
                entry.buff.start_time = time;
            }
        }
    }
    pub fn constructor_monster_state(&mut self) {
        self.base_levels = [1.0; 7];
        self.experience = 0.0;
        self.details = CombatDetails::default();
        self.initialized = false;
    }
    pub fn buffs_snapshot(&self) -> Vec<Value> {
        ordered_buffs(&self.buffs).iter().map(|entry| json!({ "key": entry.key, "uniqueHrid": entry.buff.unique_hrid,
            "typeHrid": entry.buff.type_hrid, "ratioBoost": entry.buff.ratio_boost, "flatBoost": entry.buff.flat_boost,
            "duration": entry.buff.duration, "startTime": entry.buff.start_time })).collect()
    }
    pub fn has_buff(&self, key: &str, prefix: bool) -> bool {
        self.buffs.iter().any(|entry| {
            if prefix {
                entry.key.starts_with(key)
            } else {
                entry.key == key
            }
        })
    }
    pub fn add_buffs(
        &mut self,
        buffs: &[CombatBuff],
        time: Option<f64>,
        data: &DefinitionSet,
    ) -> Result<(), String> {
        let mut changed = false;
        for buff in buffs {
            let mut buff = buff.clone();
            buff.start_time = time;
            if let Some(entry) = self
                .buffs
                .iter_mut()
                .find(|entry| entry.key == buff.unique_hrid)
            {
                changed |= entry.buff.ratio_boost != buff.ratio_boost
                    || entry.buff.flat_boost != buff.flat_boost;
                entry.buff = buff;
            } else {
                changed = true;
                self.buffs.push(BuffEntry {
                    key: buff.unique_hrid.clone(),
                    buff,
                });
            }
        }
        if changed {
            self.update(data)?;
        }
        Ok(())
    }
    pub fn new(input: UnitInput, data: &DefinitionSet) -> Result<Self, String> {
        let mut equipment: Vec<_> = DEFAULT_SLOTS
            .iter()
            .map(|slot| EquipmentInput {
                slot: format!("/equipment_types/{slot}"),
                hrid: None,
                enhancement_level: 0.0,
            })
            .collect();
        let base_levels = match &input {
            UnitInput::Player(player) => {
                if player.input_version != 1 {
                    return Err("Unsupported combat input version".into());
                }
                if player
                    .levels
                    .iter()
                    .any(|level| !level.is_finite() || *level < 0.0)
                {
                    return Err("Invalid player levels".into());
                }
                if player.shrines.iter().any(|level| {
                    !level.is_finite() || *level < 0.0 || *level > 20.0 || level.fract() != 0.0
                }) {
                    return Err("Invalid normalized shrine levels".into());
                }
                for entry in &player.equipment {
                    Self::validate_equipment(entry, data)?;
                    Self::set_equipment(&mut equipment, entry.clone());
                }
                for (hrid, level) in &player.house_rooms {
                    lookup(data, "houseRoomDetailMap", hrid)?;
                    if !level.is_finite() || *level <= 0.0 {
                        return Err("Invalid house room level".into());
                    }
                }
                for selection in player.food.iter().chain(&player.drinks).flatten() {
                    if lookup(data, "itemDetailMap", &selection.hrid)?
                        .get("consumableDetail")
                        .is_none()
                    {
                        return Err("Selected item is not a consumable".into());
                    }
                }
                for selection in player.abilities.iter().flatten() {
                    lookup(data, "abilityDetailMap", &selection.hrid)?;
                    if !selection.level.is_finite() || selection.level <= 0.0 {
                        return Err("Invalid ability level".into());
                    }
                }
                player.levels
            }
            UnitInput::Monster(monster) => {
                lookup(data, "combatMonsterDetailMap", &monster.hrid)?;
                [1.0; 7]
            }
        };
        let mut unit = Self {
            input,
            equipment,
            equipment_base: None,
            base_levels,
            details: CombatDetails::default(),
            experience: 0.0,
            buffs: Vec::new(),
            permanent: Vec::new(),
            initialized: true,
        };
        unit.update(data)?;
        Ok(unit)
    }

    fn validate_equipment(equipment: &EquipmentInput, data: &DefinitionSet) -> Result<(), String> {
        if let Some(hrid) = &equipment.hrid {
            if lookup(data, "itemDetailMap", hrid)?
                .get("equipmentDetail")
                .is_none()
            {
                return Err("Selected item is not equipment".into());
            }
            let table = data
                .definition("enhancementLevelTotalBonusMultiplierTable")?
                .as_array()
                .ok_or("Invalid enhancement table")?;
            if !equipment.enhancement_level.is_finite()
                || equipment.enhancement_level < 0.0
                || equipment.enhancement_level.fract() != 0.0
                || equipment.enhancement_level >= table.len() as f64
            {
                return Err("Invalid enhancement level".into());
            }
        }
        Ok(())
    }
    fn set_equipment(equipment: &mut Vec<EquipmentInput>, input: EquipmentInput) {
        if let Some(index) = equipment.iter().position(|entry| entry.slot == input.slot) {
            equipment[index] = input;
        } else {
            equipment.push(input);
        }
    }
    fn equipment_stat(
        data: &DefinitionSet,
        equipment: &EquipmentInput,
        key: &str,
    ) -> Result<f64, String> {
        let Some(hrid) = &equipment.hrid else {
            return Ok(0.0);
        };
        let definition = &lookup(data, "itemDetailMap", hrid)?["equipmentDetail"];
        let base = number(&definition["combatStats"], key);
        if base == 0.0 {
            return Ok(0.0);
        }
        let multiplier = data.definition("enhancementLevelTotalBonusMultiplierTable")?
            [equipment.enhancement_level as usize]
            .as_f64()
            .ok_or("Invalid enhancement multiplier")?;
        Ok(base + multiplier * number(&definition["combatEnhancementBonuses"], key))
    }

    fn initial_stats(&mut self, data: &DefinitionSet) -> Result<CombatStats, String> {
        if let Some(cache) = &self.equipment_base {
            if cache.definition_hash == data.source_hash() {
                return Ok(cache.stats.clone());
            }
        }
        let mut stats = CombatStats::default();
        match &self.input {
            UnitInput::Player(_) => {
                let find = |slot: &str| {
                    self.equipment.iter().find(|entry| {
                        entry.slot == format!("/equipment_types/{slot}") && entry.hrid.is_some()
                    })
                };
                if let Some(weapon) = find("main_hand").or_else(|| find("two_hand")) {
                    let raw = &lookup(data, "itemDetailMap", weapon.hrid.as_ref().unwrap())?
                        ["equipmentDetail"]["combatStats"];
                    stats.combat_style_hrid = raw["combatStyleHrids"][0]
                        .as_str()
                        .ok_or("Weapon has no combat style")?
                        .into();
                    stats.damage_type =
                        string(raw, "damageType").ok_or("Weapon has no damage type")?;
                    stats.primary_training = string(raw, "primaryTraining");
                    stats.attack_interval = Self::equipment_stat(data, weapon, "attackInterval")?;
                } else {
                    stats.primary_training = Some("/skills/melee".into());
                }
                if let Some(charm) = find("charm") {
                    stats.focus_training = string(
                        &lookup(data, "itemDetailMap", charm.hrid.as_ref().unwrap())?
                            ["equipmentDetail"]["combatStats"],
                        "focusTraining",
                    );
                }
                for key in EQUIPMENT_STATS {
                    let mut value = 0.0;
                    for equipment in &self.equipment {
                        value += Self::equipment_stat(data, equipment, key)?;
                    }
                    stats.set(key, value);
                }
                for (key, slot) in [("foodSlots", "pouch"), ("drinkSlots", "pouch")] {
                    stats.set(
                        key,
                        1.0 + find(slot)
                            .map(|item| Self::equipment_stat(data, item, key))
                            .transpose()?
                            .unwrap_or(0.0),
                    );
                }
                stats.hp_regen_per10 += 0.01;
                stats.mp_regen_per10 += 0.01;
            }
            UnitInput::Monster(monster) => {
                let raw = lookup(data, "combatMonsterDetailMap", &monster.hrid)?;
                let room = if monster.room_level <= 0.0 {
                    100.0
                } else {
                    monster.room_level
                };
                let scale = room / 100.0;
                let tier = monster.difficulty_tier;
                for (index, key) in LEVELS.iter().enumerate() {
                    let multiplier = 1.0 + (if *key == "defense" { 0.15 } else { 0.25 }) * tier;
                    self.base_levels[index] = multiplier
                        * (number(&raw["combatDetails"], &format!("{key}Level")) + 20.0 * tier)
                        * scale;
                }
                self.experience = (1.0 + 0.5 * tier) * (number(raw, "experience") + 5.0 * tier);
                let combat = &raw["combatDetails"]["combatStats"];
                for key in MONSTER_ZERO_STATS {
                    stats.set(key, number(combat, key));
                }
                for (key, value) in combat.as_object().ok_or("Invalid monster stats")? {
                    if let Some(number) = value.as_f64() {
                        stats.set(key, number);
                    }
                }
                stats.combat_style_hrid = combat["combatStyleHrids"][0]
                    .as_str()
                    .ok_or("Monster has no combat style")?
                    .into();
                stats.combat_style_hrids =
                    serde_json::from_value(combat["combatStyleHrids"].clone()).ok();
                stats.damage_type = string(combat, "damageType").unwrap_or(stats.damage_type);
                stats.armor *= scale;
                stats.water_resistance *= scale;
                stats.nature_resistance *= scale;
                stats.fire_resistance *= scale;
                if stats.attack_interval == 0.0 {
                    stats.attack_interval = number(&raw["combatDetails"], "attackInterval");
                }
            }
        }
        // Cache the original equipment sums before levels or buffs are applied.
        // Equipment is private and Equip invalidates it; definition sets are immutable.
        // Preserve the original accumulation order on every cache miss.
        if matches!(self.input, UnitInput::Player(_)) {
            self.equipment_base = Some(EquipmentStatsCache {
                definition_hash: data.source_hash().into(),
                stats: stats.clone(),
            });
        }
        Ok(stats)
    }

    fn boosts(&self, kind: &str) -> Vec<(f64, f64)> {
        let mut boosts: Vec<_> = ordered_buffs(&self.buffs)
            .iter()
            .filter(|entry| entry.buff.type_hrid == kind)
            .map(|entry| (entry.buff.ratio_boost, entry.buff.flat_boost))
            .collect();
        if let UnitInput::Player(player) = &self.input {
            let shrine = match kind {
                "/buff_types/damage" => Some((player.shrines[0] * 0.003, 0.0)),
                "/buff_types/attack_speed" => Some((player.shrines[1] * 0.004, 0.0)),
                "/buff_types/cast_speed" => Some((0.0, player.shrines[1] * 0.004)),
                "/buff_types/max_hitpoints" | "/buff_types/max_manapoints" => {
                    Some((player.shrines[2] * 0.01, 0.0))
                }
                "/buff_types/rare_find" => Some((0.0, player.shrines[3] * 0.015)),
                "/buff_types/wisdom" => Some((0.0, player.shrines[4] * 0.005)),
                _ => None,
            };
            if let Some(boost) = shrine {
                if boost.0 != 0.0 || boost.1 != 0.0 {
                    boosts.push(boost);
                }
            }
        }
        boosts
    }
    fn boost(&self, kind: &str) -> (f64, f64) {
        let mut total = (0.0, 0.0);
        for (ratio, flat) in self.boosts(kind) {
            total.0 += ratio;
            total.1 += flat;
        }
        total
    }

    pub fn update(&mut self, data: &DefinitionSet) -> Result<(), String> {
        self.initialized = true;
        let mut stats = self.initial_stats(data)?;
        let mut levels = self.base_levels;
        for (index, key) in LEVELS.iter().enumerate() {
            for (ratio, flat) in self.boosts(&format!("/buff_types/{key}_level")) {
                levels[index] += self.base_levels[index] * ratio;
                levels[index] += flat;
            }
        }
        let hp = self.boost("/buff_types/max_hitpoints");
        let mp = self.boost("/buff_types/max_manapoints");
        let mut details = self.details.clone();
        details.stamina_level = levels[0];
        details.intelligence_level = levels[1];
        details.attack_level = levels[2];
        details.melee_level = levels[3];
        details.defense_level = levels[4];
        details.ranged_level = levels[5];
        details.magic_level = levels[6];
        details.max_hitpoints = ((10.0 * (10.0 + levels[0]) + stats.max_hitpoints + hp.1)
            * (1.0 + stats.max_hitpoints_ratio + hp.0))
            .floor();
        details.max_manapoints = ((10.0 * (10.0 + levels[1]) + stats.max_manapoints + mp.1)
            * (1.0 + stats.max_manapoints_ratio + mp.0))
            .floor();
        let accuracy = self.boost("/buff_types/accuracy").0;
        let damage = self.boost("/buff_types/damage").0;
        let fury_accuracy = self.boost("/buff_types/fury_accuracy").0;
        let fury_damage = self.boost("/buff_types/fury_damage").0;
        let mut ratings = [(0.0, 0.0, 0.0); 5];
        for (index, style) in ["stab", "slash", "smash", "ranged", "magic"]
            .iter()
            .enumerate()
        {
            let damage_level = if index < 3 {
                levels[3]
            } else {
                levels[index + 2]
            };
            let accuracy = (10.0 + levels[2])
                * (1.0 + stats.get(&format!("{style}Accuracy")))
                * (1.0 + accuracy)
                * (1.0 + fury_accuracy);
            let damage = (10.0 + damage_level)
                * (1.0 + stats.get(&format!("{style}Damage")))
                * (1.0 + damage)
                * (1.0 + fury_damage);
            let base = (10.0 + levels[4]) * (1.0 + stats.get(&format!("{style}Evasion")));
            let mut evasion = base;
            for (ratio, flat) in self.boosts("/buff_types/evasion") {
                evasion += flat;
                evasion += base * ratio;
            }
            ratings[index] = (accuracy, damage, evasion);
        }
        details.defensive_max_damage = (10.0 + levels[4])
            * (1.0 + stats.defensive_damage)
            * (1.0 + damage)
            * (1.0 + fury_damage);
        if self.equipment.iter().any(|entry| {
            entry.slot == "/equipment_types/two_hand"
                && entry
                    .hrid
                    .as_ref()
                    .is_some_and(|hrid| hrid.contains("bulwark"))
        }) {
            ratings[2].1 += details.defensive_max_damage;
        }
        details.stab_accuracy_rating = ratings[0].0;
        details.stab_max_damage = ratings[0].1;
        details.stab_evasion_rating = ratings[0].2;
        details.slash_accuracy_rating = ratings[1].0;
        details.slash_max_damage = ratings[1].1;
        details.slash_evasion_rating = ratings[1].2;
        details.smash_accuracy_rating = ratings[2].0;
        details.smash_max_damage = ratings[2].1;
        details.smash_evasion_rating = ratings[2].2;
        details.ranged_accuracy_rating = ratings[3].0;
        details.ranged_max_damage = ratings[3].1;
        details.ranged_evasion_rating = ratings[3].2;
        details.magic_accuracy_rating = ratings[4].0;
        details.magic_max_damage = ratings[4].1;
        details.magic_evasion_rating = ratings[4].2;
        stats.damage_taken = self.boost("/buff_types/damage_taken").1;
        for (key, kind) in [
            ("physicalAmplify", "physical_amplify"),
            ("waterAmplify", "water_amplify"),
            ("natureAmplify", "nature_amplify"),
            ("fireAmplify", "fire_amplify"),
            ("healingAmplify", "healing_amplify"),
        ] {
            stats.set(
                key,
                stats.get(key) + self.boost(&format!("/buff_types/{kind}")).1,
            );
        }
        stats.attack_interval /= 1.0 + levels[2] / 2000.0;
        stats.attack_interval /= 1.0 + stats.attack_speed;
        let mut attack_speed = 0.0;
        for (ratio, _) in self.boosts("/buff_types/attack_speed") {
            attack_speed += ratio;
        }
        stats.attack_interval /= 1.0 + attack_speed;
        let mut resistances = [0.0; 4];
        for (index, (key, kind)) in [
            ("armor", "armor"),
            ("waterResistance", "water_resistance"),
            ("natureResistance", "nature_resistance"),
            ("fireResistance", "fire_resistance"),
        ]
        .iter()
        .enumerate()
        {
            let base = 0.2 * levels[4] + stats.get(key);
            resistances[index] = base;
            for (ratio, flat) in self.boosts(&format!("/buff_types/{kind}")) {
                resistances[index] += flat;
                resistances[index] += base * ratio;
            }
        }
        details.total_armor = resistances[0];
        details.total_water_resistance = resistances[1];
        details.total_nature_resistance = resistances[2];
        details.total_fire_resistance = resistances[3];
        for (key, kind) in [("hpRegenPer10", "hp_regen"), ("mpRegenPer10", "mp_regen")] {
            let (ratio, flat) = self.boost(&format!("/buff_types/{kind}"));
            let mut value = stats.get(key);
            value += value * ratio;
            value += flat;
            stats.set(key, value);
        }
        for (key, kind) in [
            ("lifeSteal", "life_steal"),
            ("physicalThorns", "physical_thorns"),
            ("elementalThorns", "elemental_thorns"),
            ("combatExperience", "wisdom"),
            ("criticalRate", "critical_rate"),
            ("criticalDamage", "critical_damage"),
            ("castSpeed", "cast_speed"),
            ("retaliation", "retaliation"),
            ("tenacity", "tenacity"),
        ] {
            stats.set(
                key,
                stats.get(key) + self.boost(&format!("/buff_types/{kind}")).1,
            );
        }
        stats.cast_speed += levels[2] / 2000.0;
        for (key, kind) in [
            ("combatDropRate", "combat_drop_rate"),
            ("combatRareFind", "rare_find"),
            ("combatDropQuantity", "combat_drop_quantity"),
        ] {
            let (ratio, flat) = self.boost(&format!("/buff_types/{kind}"));
            let mut value = stats.get(key);
            value += (1.0 + value) * ratio;
            value += flat;
            stats.set(key, value);
        }
        let base_threat = 100.0 + stats.threat;
        details.total_threat = base_threat;
        let (ratio, flat) = self.boost("/buff_types/threat");
        if ratio != 0.0 {
            stats.threat += base_threat * ratio;
        } else {
            stats.threat = base_threat;
        }
        stats.threat += flat;
        details.combat_stats = stats;
        self.details = details;
        Ok(())
    }

    fn add_permanent(&mut self, mut buff: CombatBuff) {
        if let Some(entry) = self
            .permanent
            .iter_mut()
            .find(|entry| entry.key == buff.type_hrid)
        {
            entry.buff.flat_boost += buff.flat_boost;
            entry.buff.ratio_boost += buff.ratio_boost;
        } else {
            buff.start_time = None;
            self.permanent.push(BuffEntry {
                key: buff.type_hrid.clone(),
                buff,
            });
        }
    }
    fn generate_permanent(
        &mut self,
        case: &AttributeCase,
        data: &DefinitionSet,
    ) -> Result<(), String> {
        let UnitInput::Player(player) = &self.input else {
            return Ok(());
        };
        let player = player.clone();
        for (hrid, level) in &player.house_rooms {
            let room = lookup(data, "houseRoomDetailMap", hrid)?;
            for key in ["actionBuffs", "globalBuffs"] {
                if let Some(buffs) = room[key].as_array() {
                    for buff in buffs {
                        self.add_permanent(buff_definition(buff, *level)?);
                    }
                }
            }
        }
        for tier in data
            .definition("achievementTierDetailMap")?
            .as_object()
            .ok_or("Invalid achievement tiers")?
            .values()
        {
            let all = data
                .definition("achievementDetailMap")?
                .as_object()
                .ok_or("Invalid achievements")?
                .values()
                .filter(|entry| entry["tierHrid"] == tier["hrid"])
                .all(|entry| {
                    player.achievements[entry["hrid"].as_str().unwrap_or("")]
                        .as_bool()
                        .unwrap_or_else(|| {
                            player.achievements[entry["hrid"].as_str().unwrap_or("")]
                                .as_f64()
                                .is_some_and(|value| value != 0.0)
                        })
                });
            if all {
                self.add_permanent(buff_definition(&tier["buff"], 1.0)?);
            }
        }
        for buff in player.guild_buffs {
            self.add_permanent(buff);
        }
        if let Some(hrid) = &case.zone_hrid {
            if let Some(buffs) = lookup(data, "actionDetailMap", hrid)?["buffs"].as_array() {
                for buff in buffs {
                    self.add_permanent(buff_definition(buff, 1.0)?);
                }
            }
        }
        let extra = &case.extra;
        let mut extra_buff = |unique: &str, kind: &str, ratio: f64, flat: f64| {
            self.add_permanent(CombatBuff {
                instance: None,
                unique_hrid: unique.into(),
                type_hrid: format!("/buff_types/{kind}"),
                ratio_boost: ratio,
                flat_boost: flat,
                duration: 0.0,
                start_time: None,
            })
        };
        if extra["mooPass"].as_bool().unwrap_or(false) {
            extra_buff(
                "/buff_uniques/experience_moo_pass_buff",
                "wisdom",
                0.0,
                0.05,
            );
        }
        for (key, unique, kind) in [
            (
                "comExp",
                "/buff_uniques/experience_community_buff",
                "wisdom",
            ),
            (
                "comDrop",
                "/buff_uniques/combat_community_buff",
                "combat_drop_quantity",
            ),
        ] {
            if number(extra, key) > 0.0 {
                extra_buff(unique, kind, 0.0, 0.005 * (number(extra, key) - 1.0) + 0.2);
            }
        }
        if let Some(seals) = extra["personalBuffs"].as_array() {
            for seal in seals {
                match seal.as_str().unwrap_or("") {
                    "/items/seal_of_attack_speed" => extra_buff(
                        "/buff_uniques/personal_attack_speed",
                        "attack_speed",
                        0.15,
                        0.0,
                    ),
                    "/items/seal_of_cast_speed" => {
                        extra_buff("/buff_uniques/personal_cast_speed", "cast_speed", 0.0, 0.15)
                    }
                    "/items/seal_of_combat_drop" => extra_buff(
                        "/buff_uniques/personal_combat_drop",
                        "combat_drop_quantity",
                        0.0,
                        0.15,
                    ),
                    "/items/seal_of_critical_rate" => extra_buff(
                        "/buff_uniques/personal_critical_rate",
                        "critical_rate",
                        0.0,
                        0.1,
                    ),
                    "/items/seal_of_damage" => {
                        extra_buff("/buff_uniques/personal_damage", "damage", 0.08, 0.0)
                    }
                    "/items/seal_of_rare_find" => {
                        extra_buff("/buff_uniques/personal_rare_find", "rare_find", 0.0, 0.6)
                    }
                    "/items/seal_of_wisdom" => {
                        extra_buff("/buff_uniques/personal_wisdom", "wisdom", 0.0, 0.2)
                    }
                    _ => {}
                }
            }
        }
        Ok(())
    }
    fn expire(&mut self, time: f64, data: &DefinitionSet) -> Result<(), String> {
        self.buffs.retain(|entry| {
            !entry
                .buff
                .start_time
                .is_some_and(|start| start + entry.buff.duration <= time)
        });
        self.update(data)
    }
    pub fn apply(
        &mut self,
        step: &AttributeStep,
        case: &AttributeCase,
        data: &DefinitionSet,
    ) -> Result<(), String> {
        match step {
            AttributeStep::Update => self.update(data)?,
            AttributeStep::Start => {
                self.generate_permanent(case, data)?;
                self.buffs = self.permanent.clone();
                self.update(data)?;
                self.details.current_hitpoints = self.details.max_hitpoints;
                self.details.current_manapoints = self.details.max_manapoints;
            }
            AttributeStep::Clear => {
                self.buffs = self.permanent.clone();
                self.update(data)?;
            }
            AttributeStep::Add { buffs, time } => {
                self.add_buffs(buffs, Some(*time), data)?;
            }
            AttributeStep::Remove { keys } => {
                let before = self.buffs.len();
                self.buffs.retain(|entry| !keys.contains(&entry.key));
                if before != self.buffs.len() {
                    self.update(data)?;
                }
            }
            AttributeStep::Expire { time } => self.expire(*time, data)?,
            AttributeStep::Reset { time } => {
                if *time == 0.0 || matches!(self.input, UnitInput::Monster(_)) {
                    self.buffs = self.permanent.clone();
                    self.update(data)?;
                } else {
                    self.expire(*time, data)?;
                }
                self.details.current_hitpoints = self.details.max_hitpoints;
                self.details.current_manapoints = self.details.max_manapoints;
            }
            AttributeStep::Equip { equipment } => {
                if !matches!(self.input, UnitInput::Player(_)) {
                    return Err("Cannot equip a monster".into());
                }
                Self::validate_equipment(equipment, data)?;
                Self::set_equipment(&mut self.equipment, equipment.clone());
                self.equipment_base = None;
                self.update(data)?;
            }
            AttributeStep::Levels { levels } => {
                if levels
                    .iter()
                    .any(|level| !level.is_finite() || *level < 0.0)
                {
                    return Err("Invalid levels".into());
                }
                self.base_levels = *levels;
                self.update(data)?;
            }
            AttributeStep::Shrines { levels } => {
                if let UnitInput::Player(player) = &mut self.input {
                    if levels
                        .iter()
                        .any(|level| *level < 0.0 || *level > 20.0 || level.fract() != 0.0)
                    {
                        return Err("Invalid shrine levels".into());
                    }
                    player.shrines = *levels;
                    self.update(data)?;
                } else {
                    return Err("Monster has no shrines".into());
                }
            }
        }
        Ok(())
    }
    pub fn snapshot(&self) -> AttributeSnapshot {
        let mut combat_details = json!(self.details);
        if !self.initialized {
            let stats = combat_details["combatStats"]
                .as_object_mut()
                .expect("serialized stats");
            stats.remove("abilityHaste");
            stats.remove("tenacity");
        }
        AttributeSnapshot {
            base_levels: self.base_levels,
            experience: self.experience,
            combat_details,
            buff_keys: ordered_buffs(&self.buffs)
                .iter()
                .map(|entry| entry.key.clone())
                .collect(),
        }
    }
}

pub fn attribute_trace(cases: &[AttributeCase], data: &DefinitionSet) -> Result<Value, String> {
    if cases.len() > 20_000 {
        return Err("Too many attribute cases".into());
    }
    let mut output = Vec::with_capacity(cases.len());
    for case in cases {
        if case.steps.len() > 1000 {
            return Err("Too many attribute steps".into());
        }
        let mut unit = AttributeUnit::new(case.input.clone(), data)?;
        let mut frames = vec![unit.snapshot()];
        for step in &case.steps {
            unit.apply(step, case, data)?;
            frames.push(unit.snapshot());
        }
        output.push(frames);
    }
    Ok(json!(output))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn definitions(hash: &str, armor: f64) -> DefinitionSet {
        DefinitionSet::parse(
            &json!({"schemaVersion": 1, "sourceSha256": hash, "definitions": {
                "actionDetailMap": {}, "abilityDetailMap": {}, "combatMonsterDetailMap": {},
                "itemDetailMap": {"/items/test_helmet": {"equipmentDetail": {
                    "combatStats": {"armor": armor}, "combatEnhancementBonuses": {}
                }}}, "enhancementLevelTotalBonusMultiplierTable": [0.0]
            }})
            .to_string(),
            hash,
        )
        .unwrap()
    }

    #[test]
    fn equipment_follows_definition_version_and_rejected_edits_preserve_state() {
        let case: AttributeCase = serde_json::from_value(json!({"input": {
            "kind": "player", "inputVersion": 1, "hrid": "player1",
            "levels": [1, 1, 1, 1, 1, 1, 1], "equipment": [{
                "slot": "/equipment_types/head", "hrid": "/items/test_helmet", "enhancementLevel": 0
            }], "houseRooms": [], "achievements": {}, "shrines": [0, 0, 0, 0, 0],
            "guildBuffs": [], "food": [], "drinks": [], "abilities": [], "debuffOnLevelGap": 0
        }}))
        .unwrap();
        let old = definitions("old", 7.0);
        let new = definitions("new", 19.0);
        let mut unit = AttributeUnit::new(case.input.clone(), &old).unwrap();
        assert_eq!(unit.details.total_armor, 7.2);
        unit.update(&new).unwrap();
        assert_eq!(unit.details.total_armor, 19.2);
        let before = serde_json::to_value(unit.snapshot()).unwrap();
        for (hrid, enhancement_level) in [("/items/missing", 0.0), ("/items/test_helmet", 1.0)] {
            let edit = AttributeStep::Equip {
                equipment: EquipmentInput {
                    slot: "/equipment_types/head".into(),
                    hrid: Some(hrid.into()),
                    enhancement_level,
                },
            };
            assert!(unit.apply(&edit, &case, &new).is_err());
            unit.update(&new).unwrap();
            assert_eq!(serde_json::to_value(unit.snapshot()).unwrap(), before);
        }
        unit.update(&old).unwrap();
        assert_eq!(unit.details.total_armor, 7.2);
    }
}
