use crate::{
    actions::definition,
    attributes::{AttributeCase, MonsterInput, UnitInput},
    data::DefinitionSet,
    encounter::{EncounterCase, EncounterRun, EventKind},
    result::SimResult,
    zone::{LabyrinthInput, ZoneInput, ZoneState},
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::rc::Rc;

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SimulationInput {
    pub players: Vec<AttributeCase>,
    pub zone: Option<ZoneInput>,
    pub labyrinth: Option<LabyrinthInput>,
    pub seed: u32,
    pub time_limit: f64,
    #[serde(default)]
    pub visualization: bool,
}
pub struct SimulationState {
    pub zone: Option<ZoneState>,
    pub lab: Option<LabyrinthInput>,
    pub attempts: u32,
    pub encounter_start: f64,
    pub dungeon_count: u32,
    pub result: SimResult,
    pub logs: VecDeque<Value>,
    pub visualization: bool,
}
impl EncounterRun {
    pub fn simulation(mut input: SimulationInput, data: Rc<DefinitionSet>) -> Result<Self, String> {
        if input.zone.is_some() == input.labyrinth.is_some()
            || !input.time_limit.is_finite()
            || input.time_limit <= 0.0
            || input.time_limit > 365.0 * 24.0 * 3600.0 * 1e9
        {
            return Err("Invalid simulation input".into());
        }
        let zone = input
            .zone
            .clone()
            .map(|zone| ZoneState::new(zone, &data))
            .transpose()?;
        if let Some(lab) = &input.labyrinth {
            definition(&data, "combatMonsterDetailMap", &lab.hrid)?;
            if !lab.room_level.is_finite() || lab.room_level <= 0.0 {
                return Err("Invalid labyrinth room".into());
            }
            let mut buffs = Vec::new();
            for crate_hrid in &lab.crates {
                for buff in definition(&data, "labyrinthCrateDetailMap", crate_hrid)?
                    .as_array()
                    .ok_or("Invalid crate buffs")?
                {
                    buffs.push(crate::attributes::buff_definition(buff, 1.0)?);
                }
            }
            for player in &mut input.players {
                player.zone_hrid = None;
                if let UnitInput::Player(value) = &mut player.input {
                    value.guild_buffs.extend(buffs.clone());
                }
            }
        } else {
            for player in &mut input.players {
                player.zone_hrid = input.zone.as_ref().map(|zone| zone.hrid.clone());
            }
        }
        let result = SimResult::new(
            input.zone.as_ref(),
            input.labyrinth.as_ref(),
            input.players.len(),
        );
        let dummy = AttributeCase {
            input: UnitInput::Monster(MonsterInput {
                hrid: "/monsters/crab".into(),
                difficulty_tier: 0.0,
                room_level: 0.0,
            }),
            zone_hrid: None,
            extra: Value::Null,
            steps: vec![],
        };
        let mut run = EncounterRun::new(
            EncounterCase {
                players: input.players,
                enemies: vec![dummy],
                seed: input.seed,
                max_events: 100_000,
                time_limit: input.time_limit,
                setup: vec![],
                scheduled: vec![],
            },
            data,
        )?;
        run.units.truncate(run.players.len());
        run.enemies = None;
        run.full = Some(SimulationState {
            zone,
            lab: input.labyrinth,
            attempts: 0,
            encounter_start: 0.0,
            dungeon_count: 0,
            result,
            logs: VecDeque::with_capacity(200),
            visualization: input.visualization,
        });
        Ok(run)
    }
    pub(crate) fn full_start_encounter(&mut self) -> Result<(), String> {
        let mut full = self.full.take().unwrap();
        if self.all_players_dead {
            self.all_players_dead = false;
            if let Some(zone) = &mut full.zone {
                zone.fail();
            }
        }
        let entries = if let Some(zone) = &mut full.zone {
            let entries = zone.next(&mut self.rng)?;
            if zone.dungeon {
                full.result
                    .alive(&format!("#{}", zone.killed - 1), true, self.time);
                if zone.completed > full.dungeon_count {
                    full.dungeon_count = zone.completed;
                    for id in self.players.clone() {
                        let d = &mut self.unit_mut(id).attributes.details;
                        d.current_hitpoints = d.max_hitpoints;
                        d.current_manapoints = d.max_manapoints;
                    }
                }
            }
            entries
        } else {
            let lab = full.lab.as_ref().unwrap();
            full.attempts += 1;
            vec![AttributeCase {
                input: UnitInput::Monster(MonsterInput {
                    hrid: lab.hrid.clone(),
                    difficulty_tier: 0.0,
                    room_level: lab.room_level,
                }),
                zone_hrid: None,
                extra: Value::Null,
                steps: vec![],
            }]
        };
        full.encounter_start = self.time;
        let mut enemies = Vec::new();
        for entry in entries {
            let mut unit = crate::runtime_unit::RuntimeUnit::new(entry, &self.data)?;
            unit.reset(self.time, false, &self.data, &mut self.rng)?;
            full.result.alive(&unit.hrid, true, self.time);
            let id = self.units.spawn(unit);
            self.unit_mut(id).assign_buff_identities(id.index());
            enemies.push(id);
        }
        self.enemies = Some(enemies);
        self.full = Some(full);
        self.queue
            .clear_matching(|event| event.kind == EventKind::Enrage);
        let mut event =
            crate::encounter::CombatEvent::new(EventKind::Enrage, self.time + 60e9, None);
        event.encounter_time = Some(60e9);
        self.push(event)?;
        self.queue
            .clear_matching(|event| event.kind == EventKind::Cast);
        self.check_triggers()?;
        self.start_attacks()
    }
    pub(crate) fn emit(&mut self, op: Value) {
        if let Some(full) = &mut self.full {
            full.result.apply(&op, &self.units, self.time, &self.data);
        }
        if self.full.is_none() || self.tracing {
            self.operations.push(op);
        }
    }
    pub(crate) fn full_log(
        &mut self,
        source: Option<crate::identity::UnitId>,
        target: crate::identity::UnitId,
        ability: &str,
        damage: f64,
        crit: bool,
    ) {
        let Some(full) = &self.full else {
            return;
        };
        if !full.zone.as_ref().is_some_and(|zone| zone.dungeon) {
            return;
        }
        let target_unit = self.unit(target);
        let hp = target_unit.attributes.details.current_hitpoints;
        let log = json!({"time":self.time,"wave":full.zone.as_ref().unwrap().killed-1,"source":source.map(|id|self.unit(id).hrid.as_str()).unwrap_or("UNKNOWN_SOURCE"),"ability":ability,"target":target_unit.hrid,"damage":damage,"beforeHp":(hp+damage).max(0.0),"afterHp":hp,"playersHp":self.players.iter().map(|id|{let unit=self.unit(*id);json!({"hrid":unit.hrid,"current":unit.attributes.details.current_hitpoints,"max":unit.attributes.details.max_hitpoints})}).collect::<Vec<_>>(),"isCrit":crit});
        let full = self.full.as_mut().unwrap();
        if full.logs.len() == 200 {
            full.logs.pop_front();
        }
        full.logs.push_back(log);
    }
    pub(crate) fn sample(&mut self) {
        if self.full.as_ref().is_some_and(|full| full.visualization)
            && self.processed.is_multiple_of(1000)
        {
            let mut full = self.full.take().unwrap();
            let series = &mut full.result.value["timeSeriesData"];
            series["timestamps"]
                .as_array_mut()
                .unwrap()
                .push(json!(self.time));
            for id in &self.players {
                let unit = self.unit(*id);
                let name = &unit.hrid;
                if !series["players"][name].is_object() {
                    series["players"][name] = json!({"hp":[],"mp":[],"maxHp":[],"maxMp":[]});
                }
                let details = &unit.attributes.details;
                for (key, value) in [
                    ("hp", details.current_hitpoints),
                    ("mp", details.current_manapoints),
                    ("maxHp", details.max_hitpoints),
                    ("maxMp", details.max_manapoints),
                ] {
                    series["players"][name][key]
                        .as_array_mut()
                        .unwrap()
                        .push(json!(value));
                }
            }
            self.full = Some(full);
        }
    }
    pub fn simulation_result(&self) -> Result<Value, String> {
        if self.full.is_none() || !self.done() {
            return Err("Simulation has not completed".into());
        }
        if self.failed {
            return Err("Simulation failed".into());
        }
        let full = self.full.as_ref().unwrap();
        let mut value = full.result.value.clone();
        value["maxEnrageStack"] = json!(self.max_enrage);
        value["simulatedTime"] = json!(self.time);
        if let Some(zone) = &full.zone {
            value["isDungeon"] = json!(zone.dungeon);
            if zone.dungeon {
                value["dungeonsCompleted"] = json!(zone.completed);
                value["dungeonsFailed"] = json!(zone.failed);
                let mut wave = 0;
                if zone.completed > 0 {
                    wave = zone.max_waves;
                } else {
                    for index in 1..=zone.max_waves {
                        if value["timeSpentAlive"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .any(|entry| {
                                entry["name"] == format!("#{index}")
                                    && entry["count"].as_f64().unwrap_or(0.0) > 0.0
                            })
                        {
                            wave = index;
                        } else {
                            break;
                        }
                    }
                }
                value["maxWaveReached"] = json!(wave);
                if let Some(map) = zone.waves["fixedSpawnsMap"].as_object() {
                    let mut keys: Vec<u32> =
                        map.keys().filter_map(|key| key.parse().ok()).collect();
                    keys.sort_unstable();
                    for key in keys {
                        let mut name = format!("#{key}");
                        for monster in map[&key.to_string()].as_array().unwrap() {
                            name.push(',');
                            name.push_str(monster["combatMonsterHrid"].as_str().unwrap());
                        }
                        value["bossSpawns"]
                            .as_array_mut()
                            .unwrap()
                            .push(json!(name));
                    }
                }
                if let Some(bosses) = zone.fight["bossSpawns"].as_array() {
                    for boss in bosses {
                        value["bossSpawns"]
                            .as_array_mut()
                            .unwrap()
                            .push(boss["combatMonsterHrid"].clone());
                    }
                }
            }
        }
        value["labyAttemptCount"] = json!(full.attempts);
        for id in &self.players {
            let unit = self.unit(*id);
            let name = &unit.hrid;
            let stats = &unit.attributes.details.combat_stats;
            value["dropRateMultiplier"][name] = json!(1.0 + stats.combat_drop_rate);
            value["rareFindMultiplier"][name] = json!(1.0 + stats.combat_rare_find);
            value["combatDropQuantity"][name] = json!(stats.combat_drop_quantity);
            if let UnitInput::Player(input) = &unit.case.input {
                value["debuffOnLevelGap"][name] = json!(input.debuff_on_level_gap);
            }
            value["manaUsed"][name] = json!({});
            for (key, amount) in &unit.mana_costs {
                value["manaUsed"][name][key] = json!(amount);
            }
        }
        Ok(value)
    }
    pub fn simulation_summary(&self) -> Result<Value, String> {
        Ok(
            json!({"result":self.simulation_result()?,"randomCalls":self.rng.calls(),"events":self.event_counts,"processed":self.processed}),
        )
    }
    pub fn progress(&self) -> Value {
        json!({"done":self.done(),"time":self.time,"processed":self.processed,"randomCalls":self.rng.calls(),"progress":(self.time/self.case.time_limit).min(1.0)})
    }
    pub fn enable_trace(&mut self) {
        self.tracing = true;
    }
}
pub fn simulate(input: SimulationInput, data: Rc<DefinitionSet>) -> Result<Value, String> {
    let mut run = EncounterRun::simulation(input, data)?;
    while !run.done() {
        run.advance(1000)?;
    }
    run.simulation_summary()
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TraceInput {
    pub input: SimulationInput,
    pub max_events: u32,
    #[serde(default)]
    pub start_event: u32,
}
pub fn trace(input: TraceInput, data: Rc<DefinitionSet>) -> Result<Value, String> {
    if input.max_events == 0 || input.max_events > 10_000 {
        return Err("Invalid trace event limit".into());
    }
    if input.start_event > 1_000_000 {
        return Err("Invalid trace offset".into());
    }
    let mut run = EncounterRun::simulation(input.input, data)?;
    while !run.done() && run.processed < input.start_event {
        run.advance((input.start_event - run.processed).min(1000))?;
    }
    run.enable_trace();
    Ok(json!(run.advance(input.max_events)?))
}
