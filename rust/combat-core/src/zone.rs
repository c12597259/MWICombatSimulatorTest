use crate::{
    actions::{definition, number, text},
    attributes::{AttributeCase, MonsterInput, UnitInput},
    data::DefinitionSet,
    rng::CombatRng,
};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ZoneInput {
    pub hrid: String,
    pub difficulty_tier: f64,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LabyrinthInput {
    pub hrid: String,
    pub room_level: f64,
    #[serde(default)]
    pub crates: Vec<String>,
}
pub struct ZoneState {
    pub input: ZoneInput,
    pub dungeon: bool,
    pub killed: u32,
    pub completed: u32,
    pub failed: u32,
    pub max_waves: u32,
    pub fight: Value,
    pub waves: Value,
}
impl ZoneState {
    pub fn new(input: ZoneInput, data: &DefinitionSet) -> Result<Self, String> {
        let value = definition(data, "actionDetailMap", &input.hrid)?;
        let info = &value["combatZoneInfo"];
        if !info.is_object() || !input.difficulty_tier.is_finite() || input.difficulty_tier < 0.0 {
            return Err("Invalid combat zone".into());
        }
        Ok(Self {
            input,
            dungeon: info["isDungeon"].as_bool().unwrap_or(false),
            killed: 1,
            completed: 0,
            failed: 0,
            max_waves: number(&info["dungeonInfo"], "maxWaves") as u32,
            fight: info["fightInfo"].clone(),
            waves: info["dungeonInfo"].clone(),
        })
    }
    pub fn fail(&mut self) {
        self.failed += 1;
        self.killed = 1;
    }
    pub fn snapshot(&self) -> Value {
        json!({"encountersKilled":self.killed,"dungeonsCompleted":self.completed,"dungeonsFailed":self.failed})
    }
    pub fn next(&mut self, rng: &mut CombatRng) -> Result<Vec<AttributeCase>, String> {
        let spawns = if self.dungeon {
            if self.killed > self.max_waves {
                self.completed += 1;
                self.killed = 1;
            }
            let fixed = &self.waves["fixedSpawnsMap"][self.killed.to_string()];
            fixed.as_array().cloned()
        } else if self.killed == 10 && self.fight["bossSpawns"].is_array() {
            self.killed = 0;
            Some(self.fight["bossSpawns"].as_array().unwrap().clone())
        } else {
            None
        };
        let spawns = if let Some(values) = spawns {
            values
        } else {
            let mut keys: Vec<u32> = self.waves["randomSpawnInfoMap"]
                .as_object()
                .map(|map| map.keys().filter_map(|key| key.parse().ok()).collect())
                .unwrap_or_default();
            keys.sort_unstable();
            let info = if self.dungeon {
                let key = if self.killed > *keys.last().ok_or("No random dungeon wave")? {
                    *keys.last().unwrap()
                } else {
                    keys.windows(2)
                        .find(|pair| self.killed >= pair[0] && self.killed <= pair[1])
                        .map(|pair| pair[0])
                        .ok_or("No random dungeon interval")?
                };
                &self.waves["randomSpawnInfoMap"][key.to_string()]
            } else {
                &self.fight["randomSpawnInfo"]
            };
            let choices = info["spawns"].as_array().ok_or("No monster spawns")?;
            let weight: f64 = choices.iter().map(|spawn| number(spawn, "rate")).sum();
            let mut selected = Vec::new();
            let mut strength = 0.0;
            for _ in 0..number(info, "maxSpawnCount") as u32 {
                let roll = rng.next_f64() * weight;
                let mut cumulative = 0.0;
                let mut over = false;
                for spawn in choices {
                    cumulative += number(spawn, "rate");
                    if roll <= cumulative {
                        strength += number(spawn, "strength");
                        if strength <= number(info, "maxTotalStrength") {
                            selected.push(spawn.clone());
                        } else {
                            over = true;
                        }
                        break;
                    }
                }
                if over {
                    break;
                }
            }
            selected
        };
        self.killed += 1;
        Ok(spawns
            .iter()
            .map(|spawn| AttributeCase {
                input: UnitInput::Monster(MonsterInput {
                    hrid: text(spawn, "combatMonsterHrid"),
                    difficulty_tier: number(spawn, "difficultyTier") + self.input.difficulty_tier,
                    room_level: 0.0,
                }),
                zone_hrid: None,
                extra: Value::Null,
                steps: vec![],
            })
            .collect())
    }
}
