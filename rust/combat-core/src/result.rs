use crate::{
    actions::number,
    attributes::UnitInput,
    data::DefinitionSet,
    identity::UnitArena,
    runtime_unit::RuntimeUnit,
    zone::{LabyrinthInput, ZoneInput},
};
use serde_json::{json, Value};

pub struct SimResult {
    pub value: Value,
}
fn increment(root: &mut Value, keys: &[&str], amount: f64) {
    if keys.len() == 1 {
        let previous = root[keys[0]].as_f64().unwrap_or(0.0);
        root[keys[0]] = json!(previous + amount);
        return;
    }
    if !root[keys[0]].is_object() {
        root[keys[0]] = json!({});
    }
    increment(&mut root[keys[0]], &keys[1..], amount);
}
impl SimResult {
    pub fn new(zone: Option<&ZoneInput>, lab: Option<&LabyrinthInput>, players: usize) -> Self {
        let mut value = json!({"deaths":{},"experienceGained":{},"encounters":0,"attacks":{},"consumablesUsed":{},"hitpointsGained":{},"manapointsGained":{},"debuffOnLevelGap":{},"dropRateMultiplier":{},"rareFindMultiplier":{},"combatDropQuantity":{},"playerRanOutOfMana":{"player1":false,"player2":false,"player3":false,"player4":false,"player5":false},"playerRanOutOfManaTime":{},"manaUsed":{},"timeSpentAlive":[],"bossSpawns":[],"hitpointsSpent":{},"isDungeon":false,"isLabyrinth":lab.is_some(),"dungeonsCompleted":0,"dungeonsFailed":0,"maxWaveReached":0,"numberOfPlayers":players,"maxEnrageStack":0,"minDungenonTime":0,"maxDungenonTime":0,"lastDungeonFinishTime":0,"lastEncounterFinishTime":0,"labyAttemptCount":0,"wipeEvents":[],"timeSeriesData":{"timestamps":[],"players":{}}});
        if let Some(zone) = zone {
            value["zoneName"] = json!(zone.hrid);
            value["difficultyTier"] = json!(zone.difficulty_tier);
        }
        if let Some(lab) = lab {
            value["labyrinthName"] = json!(lab.hrid);
            value["roomLevel"] = json!(lab.room_level);
        }
        Self { value }
    }
    pub fn alive(&mut self, name: &str, alive: bool, time: f64) {
        let entries = self.value["timeSpentAlive"].as_array_mut().unwrap();
        if let Some(entry) = entries.iter_mut().find(|entry| entry["name"] == name) {
            entry["alive"] = json!(alive);
            if alive {
                entry["spawnedAt"] = json!(time);
            } else {
                entry["timeSpentAlive"] =
                    json!(number(entry, "timeSpentAlive") + (time - number(entry, "spawnedAt")));
                entry["count"] = json!(number(entry, "count") + 1.0);
            }
        } else if alive {
            entries.push(
                json!({"name":name,"timeSpentAlive":0,"spawnedAt":time,"alive":true,"count":0}),
            );
        }
    }
    pub fn apply(
        &mut self,
        op: &Value,
        units: &UnitArena<RuntimeUnit>,
        time: f64,
        data: &DefinitionSet,
    ) {
        let kind = op[0].as_str().unwrap();
        if kind == "encounter" {
            self.value["encounters"] = json!(number(&self.value, "encounters") + 1.0);
            self.value["lastEncounterFinishTime"] = json!(time);
            return;
        }
        let Some(unit) = op[1]
            .as_u64()
            .and_then(|id| units.id_at(id as usize))
            .and_then(|id| units.get(id))
        else {
            return;
        };
        let name = unit.hrid.as_str();
        match kind {
            "attack" => {
                let target = units
                    .get(units.id_at(op[2].as_u64().unwrap() as usize).unwrap())
                    .unwrap();
                let hit = op[4]
                    .as_str()
                    .map(String::from)
                    .unwrap_or_else(|| op[4].as_f64().unwrap().to_string());
                increment(
                    &mut self.value["attacks"],
                    &[name, &target.hrid, op[3].as_str().unwrap(), &hit],
                    1.0,
                );
            }
            "death" => {
                increment(&mut self.value["deaths"], &[name], 1.0);
                if !unit.player {
                    self.alive(name, false, time);
                }
            }
            "consume" => increment(
                &mut self.value["consumablesUsed"],
                &[name, op[2].as_str().unwrap()],
                1.0,
            ),
            "hp" | "mp" | "hpSpent" => {
                let field = match kind {
                    "hp" => "hitpointsGained",
                    "mp" => "manapointsGained",
                    _ => "hitpointsSpent",
                };
                increment(
                    &mut self.value[field],
                    &[name, op[2].as_str().unwrap()],
                    op[3].as_f64().unwrap(),
                );
            }
            "oom" => {
                let out = op[2].as_bool().unwrap();
                if out {
                    self.value["playerRanOutOfMana"][name] = json!(true);
                }
                if !self.value["playerRanOutOfManaTime"][name].is_object() {
                    self.value["playerRanOutOfManaTime"][name] = json!({"isOutOfMana":false,"startTimeForOutOfMana":0,"totalTimeForOutOfMana":0});
                }
                let entry = &mut self.value["playerRanOutOfManaTime"][name];
                let previous = entry["isOutOfMana"].as_bool().unwrap();
                if out && !previous {
                    entry["isOutOfMana"] = json!(true);
                    entry["startTimeForOutOfMana"] = json!(time);
                }
                if !out && previous {
                    entry["isOutOfMana"] = json!(false);
                    entry["totalTimeForOutOfMana"] = json!(
                        number(entry, "totalTimeForOutOfMana")
                            + (time - number(entry, "startTimeForOutOfMana"))
                    );
                }
            }
            "experience" => {
                let UnitInput::Player(input) = &unit.case.input else {
                    return;
                };
                let stats = &unit.attributes.details.combat_stats;
                let skills = [
                    "stamina",
                    "intelligence",
                    "attack",
                    "melee",
                    "defense",
                    "ranged",
                    "magic",
                ];
                if !self.value["experienceGained"][name].is_object() {
                    self.value["experienceGained"][name] = json!({"stamina":0,"intelligence":0,"attack":0,"melee":0,"defense":0,"ranged":0,"magic":0});
                }
                let mut rates = [0.0; 7];
                for (index, skill) in skills.iter().enumerate() {
                    if stats
                        .primary_training
                        .as_deref()
                        .unwrap_or("")
                        .rsplit('/')
                        .next()
                        == Some(*skill)
                    {
                        rates[index] = 0.3;
                    }
                }
                let style = &data.definition("combatStyleDetailMap").unwrap()
                    [&stats.combat_style_hrid]["skillExpMap"];
                let map = style.as_object().unwrap();
                let focus = stats.focus_training.as_deref().unwrap_or("");
                if !focus.is_empty()
                    && map
                        .get(focus)
                        .is_some_and(|v| v.as_f64().unwrap_or(0.0) != 0.0)
                {
                    for (index, skill) in skills.iter().enumerate() {
                        if focus.rsplit('/').next() == Some(*skill) {
                            rates[index] += 0.7;
                        }
                    }
                } else {
                    for key in map.keys() {
                        for (index, skill) in skills.iter().enumerate() {
                            if key.rsplit('/').next() == Some(*skill) {
                                rates[index] += 0.7 / map.len() as f64;
                            }
                        }
                    }
                }
                for (index, skill) in skills.iter().enumerate() {
                    if rates[index] > 0.0 {
                        let gain = op[2].as_f64().unwrap()
                            * (1.0 + stats.combat_experience)
                            * (rates[index] * (1.0 + stats.get(&format!("{skill}Experience"))))
                            * (1.0 + input.debuff_on_level_gap);
                        increment(&mut self.value["experienceGained"], &[name, skill], gain);
                    }
                }
            }
            _ => {}
        }
    }
}
