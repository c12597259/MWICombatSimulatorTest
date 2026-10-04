use crate::{
    actions::number,
    attributes::UnitInput,
    data::DefinitionSet,
    identity::UnitArena,
    runtime_unit::RuntimeUnit,
    zone::{LabyrinthInput, ZoneInput},
};
use serde_json::{json, Value};
use std::borrow::Cow;

pub struct SimResult {
    pub value: Value,
}
fn increment(root: &mut Value, keys: &[&str], amount: f64) {
    // Value's mutable string indexing allocates an owned key even on a hit.
    // Borrow existing entries; allocate keys only when first inserting them.
    if let Some(entry) = root.get_mut(keys[0]) {
        increment_entry(entry, &keys[1..], amount);
    } else {
        let mut entry = Value::Null;
        increment_entry(&mut entry, &keys[1..], amount);
        root[keys[0]] = entry;
    }
}
fn increment_entry(entry: &mut Value, keys: &[&str], amount: f64) {
    if keys.is_empty() {
        let previous = entry.as_f64().unwrap_or(0.0);
        *entry = json!(previous + amount);
    } else {
        if !entry.is_object() {
            *entry = json!({});
        }
        increment(entry, keys, amount);
    }
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
                let hit = match op[4].as_str() {
                    Some(hit) => Cow::Borrowed(hit),
                    None => Cow::Owned(op[4].as_f64().unwrap().to_string()),
                };
                increment(
                    &mut self.value,
                    &["attacks", name, &target.hrid, op[3].as_str().unwrap(), &hit],
                    1.0,
                );
            }
            "death" => {
                increment(&mut self.value, &["deaths", name], 1.0);
                if !unit.player {
                    self.alive(name, false, time);
                }
            }
            "consume" => increment(
                &mut self.value,
                &["consumablesUsed", name, op[2].as_str().unwrap()],
                1.0,
            ),
            "hp" | "mp" | "hpSpent" => {
                let field = match kind {
                    "hp" => "hitpointsGained",
                    "mp" => "manapointsGained",
                    _ => "hitpointsSpent",
                };
                increment(
                    &mut self.value,
                    &[field, name, op[2].as_str().unwrap()],
                    op[3].as_f64().unwrap(),
                );
            }
            "oom" => {
                let out = op[2].as_bool().unwrap();
                if out {
                    self.value["playerRanOutOfMana"][name] = json!(true);
                }
                let times = self.value.get_mut("playerRanOutOfManaTime").unwrap();
                if !times[name].is_object() {
                    times[name] = json!({"isOutOfMana":false,"startTimeForOutOfMana":0,"totalTimeForOutOfMana":0});
                }
                let entry = times.get_mut(name).unwrap();
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
                let experience = self.value.get_mut("experienceGained").unwrap();
                if !experience[name].is_object() {
                    experience[name] = json!({"stamina":0,"intelligence":0,"attack":0,"melee":0,"defense":0,"ranged":0,"magic":0});
                }
                let experience = experience.get_mut(name).unwrap();
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
                        // skillExpMap uses booleans; JS tests the entry's truthiness.
                        .is_some_and(|v| {
                            v.as_bool().unwrap_or(false) || v.as_f64().unwrap_or(0.0) != 0.0
                        })
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
                let bonuses = [
                    stats.stamina_experience,
                    stats.intelligence_experience,
                    stats.attack_experience,
                    stats.melee_experience,
                    stats.defense_experience,
                    stats.ranged_experience,
                    stats.magic_experience,
                ];
                for (index, skill) in skills.iter().enumerate() {
                    if rates[index] > 0.0 {
                        let gain = op[2].as_f64().unwrap()
                            * (1.0 + stats.combat_experience)
                            * (rates[index] * (1.0 + bonuses[index]))
                            * (1.0 + input.debuff_on_level_gap);
                        increment(experience, &[skill], gain);
                    }
                }
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // The original implementation is the oracle for coercion, insertion order,
    // signed zero, non-finite values and non-associative floating point sums.
    fn reference_increment(root: &mut Value, keys: &[&str], amount: f64) {
        if keys.len() == 1 {
            let previous = root[keys[0]].as_f64().unwrap_or(0.0);
            root[keys[0]] = json!(previous + amount);
            return;
        }
        if !root[keys[0]].is_object() {
            root[keys[0]] = json!({});
        }
        reference_increment(&mut root[keys[0]], &keys[1..], amount);
    }

    #[test]
    fn borrowed_counters_preserve_every_intermediate_serialized_result() {
        let paths: &[&[&str]] = &[
            &["attacks", "player1", "crab", "attack", "10"],
            &["attacks", "player1", "crab", "attack", "2"],
            &["attacks", "player2", "crab", "attack", "miss"],
            &["experienceGained", "player1", "magic"],
            &["experienceGained", "player1", "stamina"],
            &["existing", "nested"],
            &["existing"],
            &["zero"],
        ];
        let amounts = [
            0.0,
            -0.0,
            1e16,
            1.0,
            -1e16,
            0.1,
            f64::INFINITY,
            2.0,
            f64::NAN,
        ];
        for initial in [Value::Null, json!({"existing": "reset", "zero": -0.0})] {
            let mut actual = initial.clone();
            let mut expected = initial;
            for path in paths {
                for amount in amounts {
                    increment(&mut actual, path, amount);
                    reference_increment(&mut expected, path, amount);
                    assert_eq!(
                        serde_json::to_string(&actual).unwrap(),
                        serde_json::to_string(&expected).unwrap()
                    );
                }
            }
            // Revisit both occupied and previously replaced nested paths.
            for index in 0..200 {
                let path = paths[index % paths.len()];
                let amount = amounts[index % amounts.len()];
                increment(&mut actual, path, amount);
                reference_increment(&mut expected, path, amount);
                assert_eq!(
                    serde_json::to_string(&actual).unwrap(),
                    serde_json::to_string(&expected).unwrap()
                );
            }
        }
    }
}
