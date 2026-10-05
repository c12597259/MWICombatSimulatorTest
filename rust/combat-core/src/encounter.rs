use crate::{
    actions::{
        Ability, AbilityEffect, Consumable, Trigger, TriggerComparator, TriggerCondition,
        TriggerDependency,
    },
    attributes::{AttributeCase, AttributeStep, CombatBuff, MonsterInput, UnitInput},
    combat_math::{self, AttackResult},
    data::DefinitionSet,
    identity::{UnitArena, UnitId},
    queue::{CompatEventQueue, TimedEvent},
    result::{Hit, ResultOp},
    rng::CombatRng,
    runtime_unit::{Dependency, RuntimeUnit},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::rc::Rc;

const SECOND: f64 = 1e9;
const HOT: f64 = 5.0 * SECOND;
const DOT: f64 = 3.0 * SECOND;
const REGEN: f64 = 10.0 * SECOND;
const ENRAGE: f64 = 60.0 * SECOND;
const STACK_DURATION: f64 = 15.0 * SECOND;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
pub enum EventKind {
    #[serde(rename = "combatStart")]
    Start,
    #[serde(rename = "playerRespawn")]
    Respawn,
    #[serde(rename = "enemyRespawn")]
    NextEncounter,
    #[serde(rename = "autoAttack")]
    Attack,
    #[serde(rename = "consumableTick")]
    Hot,
    #[serde(rename = "damageOverTime")]
    Dot,
    #[serde(rename = "checkBuffExpiration")]
    BuffExpire,
    #[serde(rename = "regenTick")]
    Regen,
    #[serde(rename = "stunExpiration")]
    StunExpire,
    #[serde(rename = "blindExpiration")]
    BlindExpire,
    #[serde(rename = "silenceExpiration")]
    SilenceExpire,
    #[serde(rename = "curseExpiration")]
    CurseExpire,
    #[serde(rename = "weakenExpiration")]
    WeakenExpire,
    #[serde(rename = "furyExpiration")]
    FuryExpire,
    #[serde(rename = "enrageTick")]
    Enrage,
    #[serde(rename = "abilityCastEndEvent")]
    Cast,
    #[serde(rename = "awaitCooldownEvent")]
    Await,
    #[serde(rename = "cooldownReady")]
    Cooldown,
}
#[derive(Clone)]
pub struct CombatEvent {
    pub id: u32,
    pub time: f64,
    pub kind: EventKind,
    pub source: Option<UnitId>,
    pub target: Option<UnitId>,
    pub source_ref: Option<UnitId>,
    pub ability: Option<usize>,
    pub consumable: Option<(bool, usize)>,
    pub hrid: Option<String>,
    pub amount: Option<f64>,
    pub ticks: Option<f64>,
    pub tick: Option<f64>,
    pub encounter_time: Option<f64>,
    pub style: Option<String>,
}
impl TimedEvent for CombatEvent {
    fn id(&self) -> u32 {
        self.id
    }
    fn time(&self) -> f64 {
        self.time
    }
}
impl CombatEvent {
    pub fn new(kind: EventKind, time: f64, source: Option<UnitId>) -> Self {
        Self {
            id: 0,
            time,
            kind,
            source,
            target: None,
            source_ref: None,
            ability: None,
            consumable: None,
            hrid: None,
            amount: None,
            ticks: None,
            tick: None,
            encounter_time: None,
            style: None,
        }
    }
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnitSetup {
    pub unit: usize,
    #[serde(default)]
    pub combat_details: Value,
    #[serde(default)]
    pub flags: Value,
    #[serde(default)]
    pub buffs: Vec<CombatBuff>,
    #[serde(default)]
    pub last_used: Vec<(usize, f64)>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScheduledEvent {
    pub time: f64,
    pub kind: EventKind,
    pub unit: Option<usize>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EncounterCase {
    pub players: Vec<AttributeCase>,
    pub enemies: Vec<AttributeCase>,
    pub seed: u32,
    pub max_events: u32,
    pub time_limit: f64,
    #[serde(default)]
    pub setup: Vec<UnitSetup>,
    #[serde(default)]
    pub scheduled: Vec<ScheduledEvent>,
}
pub struct EncounterRun {
    pub(crate) full: Option<crate::simulation::SimulationState>,
    pub(crate) tracing: bool,
    pub(crate) retain_unit_history: bool,
    pub(crate) event_counts: serde_json::Map<String, Value>,
    pub(crate) data: Rc<DefinitionSet>,
    pub(crate) case: EncounterCase,
    pub units: UnitArena<RuntimeUnit>,
    pub(crate) players: Vec<UnitId>,
    pub(crate) enemies: Option<Vec<UnitId>>,
    pub queue: CompatEventQueue<CombatEvent>,
    pub(crate) rng: CombatRng,
    pub(crate) next_event_id: u32,
    pub time: f64,
    pub(crate) processed: u32,
    pub(crate) ended: bool,
    pub(crate) failed: bool,
    pub(crate) all_players_dead: bool,
    pub(crate) operations: Vec<Value>,
    pub(crate) max_enrage: f64,
    trigger_snapshot: Vec<UnitId>,
}
impl EncounterRun {
    pub fn new(case: EncounterCase, data: Rc<DefinitionSet>) -> Result<Self, String> {
        if case.players.is_empty()
            || case.players.len() > 5
            || case.enemies.is_empty()
            || case.enemies.len() > 20
            || case.max_events == 0
            || case.max_events > 100_000
            || !case.time_limit.is_finite()
            || case.time_limit <= 0.0
        {
            return Err("Invalid encounter limits".into());
        }
        let mut units = UnitArena::default();
        let mut players = vec![];
        let mut enemies = vec![];
        for entry in &case.players {
            if !matches!(entry.input, UnitInput::Player(_)) {
                return Err("Player list contains a monster".into());
            }
            players.push(units.spawn(RuntimeUnit::new(entry.clone(), &data)?));
            let id = *players.last().unwrap();
            units
                .get_mut(id)
                .unwrap()
                .assign_buff_identities(id.index());
        }
        for entry in &case.enemies {
            if !matches!(entry.input, UnitInput::Monster(_)) {
                return Err("Enemy list contains a player".into());
            }
            enemies.push(units.spawn(RuntimeUnit::new(entry.clone(), &data)?));
            let id = *enemies.last().unwrap();
            units
                .get_mut(id)
                .unwrap()
                .assign_buff_identities(id.index());
        }
        for setup in &case.setup {
            if units.id_at(setup.unit).is_none() {
                return Err("Unknown setup unit".into());
            }
        }
        let rng = CombatRng::new(case.seed);
        let mut run = Self {
            full: None,
            tracing: false,
            retain_unit_history: true,
            event_counts: serde_json::Map::new(),
            data,
            case,
            units,
            players,
            enemies: Some(enemies),
            queue: CompatEventQueue::default(),
            rng,
            next_event_id: 0,
            time: 0.0,
            processed: 0,
            ended: false,
            failed: false,
            all_players_dead: false,
            operations: vec![],
            max_enrage: 0.0,
            trigger_snapshot: Vec::new(),
        };
        run.push(CombatEvent::new(EventKind::Start, 0.0, None))?;
        Ok(run)
    }
    pub(crate) fn unit(&self, id: UnitId) -> &RuntimeUnit {
        self.units.get(id).expect("valid runtime identity")
    }
    pub(crate) fn unit_mut(&mut self, id: UnitId) -> &mut RuntimeUnit {
        self.units.get_mut(id).expect("valid runtime identity")
    }
    pub(crate) fn push(&mut self, mut event: CombatEvent) -> Result<(), String> {
        self.next_event_id += 1;
        event.id = self.next_event_id;
        self.queue.push(event)
    }
    pub(crate) fn at(
        &mut self,
        kind: EventKind,
        time: f64,
        source: Option<UnitId>,
    ) -> Result<(), String> {
        self.push(CombatEvent::new(kind, time, source))
    }
    pub(crate) fn clear_unit(&mut self, id: UnitId) {
        self.queue
            .clear_matching(|event| event.source == Some(id) || event.target == Some(id));
    }
    pub(crate) fn step(&mut self, id: UnitId, step: &AttributeStep) -> Result<(), String> {
        self.units
            .get_mut(id)
            .expect("valid identity")
            .step(step, &self.data)
    }
    pub(crate) fn buff(
        &mut self,
        id: UnitId,
        buffs: &[CombatBuff],
        time: Option<f64>,
    ) -> Result<(), String> {
        for buff in buffs {
            if let Some(instance) = buff.instance {
                for unit in self.units.iter_mut() {
                    unit.attributes.refresh_shared_buff(instance, time);
                }
            }
        }
        self.units
            .get_mut(id)
            .expect("valid identity")
            .attributes
            .add_buffs(buffs, time, &self.data)
    }
    pub(crate) fn sides(&self, source: UnitId) -> (Vec<UnitId>, Option<Vec<UnitId>>) {
        let (allies, enemies) = self.side_refs(source);
        (allies.to_vec(), enemies.map(<[UnitId]>::to_vec))
    }
    fn side_refs(&self, source: UnitId) -> (&[UnitId], Option<&[UnitId]>) {
        if self.unit(source).player {
            (&self.players, self.enemies.as_deref())
        } else {
            (
                self.enemies.as_deref().unwrap_or_default(),
                Some(&self.players),
            )
        }
    }
    pub(crate) fn live(&self, values: &[UnitId]) -> Vec<UnitId> {
        values
            .iter()
            .copied()
            .filter(|id| self.unit(*id).alive())
            .collect()
    }
    pub(crate) fn first_target(&self, enemies: Option<&[UnitId]>) -> Option<UnitId> {
        enemies.and_then(|values| values.iter().copied().find(|id| self.unit(*id).alive()))
    }
    pub(crate) fn event_snapshot(&self, event: &CombatEvent) -> Value {
        let ability = event.source.and_then(|source| {
            event.ability.and_then(|index| {
                self.unit(source).abilities[index]
                    .as_ref()
                    .map(|value| value.hrid.clone())
            })
        });
        let consumable = event.source.and_then(|source| {
            event.consumable.and_then(|(drink, index)| {
                let unit = self.unit(source);
                (if drink { &unit.drinks } else { &unit.food })[index]
                    .as_ref()
                    .map(|value| value.hrid.clone())
            })
        });
        json!({ "id":event.id,"type":event.kind,"time":event.time,"source":event.source,"target":event.target,"sourceRef":event.source_ref,
            "ability":ability,"consumable":consumable,"hrid":event.hrid,"amount":event.amount,"totalTicks":event.ticks,"currentTick":event.tick,"encounterTime":event.encounter_time,"combatStyleHrid":event.style })
    }
    pub(crate) fn frame(&mut self, event: &CombatEvent) -> Value {
        let mut frame = json!({ "event":self.event_snapshot(event), "time":self.time, "randomCalls":self.rng.calls(),
            "units":self.units.iter().map(|(id, unit)| json!({"id":id,"state":unit.snapshot()})).collect::<Vec<_>>(),
            "players":self.players,"enemies":self.enemies,"heap":self.queue.events().iter().map(|event| self.event_snapshot(event)).collect::<Vec<_>>(),
            "operations":self.operations,"allPlayersDead":self.all_players_dead,"maxEnrageStack":self.max_enrage });
        if let Some(full) = &self.full {
            frame["result"] = full.result.value.clone();
            frame["result"]["maxEnrageStack"] = json!(self.max_enrage);
            for wipe in frame["result"]["wipeEvents"].as_array_mut().unwrap() {
                wipe.as_object_mut().unwrap().remove("timestamp");
            }
            frame["zone"] = full
                .zone
                .as_ref()
                .map(|zone| zone.snapshot())
                .unwrap_or(Value::Null);
            frame["attempts"] = json!(full.attempts);
        }
        self.operations.clear();
        frame
    }
    pub fn done(&self) -> bool {
        self.failed
            || self.ended
            || (self.full.is_none() && self.processed >= self.case.max_events)
            || self.time >= self.case.time_limit
    }
    pub fn advance(&mut self, events: u32) -> Result<Vec<Value>, String> {
        if self.failed {
            return Err("Encounter failed; create a new run".into());
        }
        if events == 0 || events > 10_000 {
            return Err("Invalid encounter chunk size".into());
        }
        let result = self.advance_inner(events);
        if result.is_err() {
            self.failed = true;
        }
        result
    }
    pub(crate) fn advance_inner(&mut self, events: u32) -> Result<Vec<Value>, String> {
        let mut frames = Vec::new();
        for _ in 0..events {
            if self.done() {
                break;
            }
            let Some(event) = self.queue.pop() else {
                self.ended = true;
                break;
            };
            self.time = event.time;
            self.process(event.clone())?;
            self.check_triggers()?;
            self.processed += 1;
            if self.full.is_some() {
                let key = serde_json::to_value(event.kind)
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string();
                let count = self
                    .event_counts
                    .get(&key)
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                self.event_counts.insert(key, json!(count + 1));
                self.sample();
            }
            if self.full.is_none() || self.tracing {
                frames.push(self.frame(&event));
            }
            if self.full.is_none() && (self.enemies.is_none() || self.all_players_dead) {
                self.ended = true;
            }
            // Collect only between complete events: emit() has already consumed
            // operation references, and all future reads are rooted in the sides
            // or queue (including DOT source_ref and promoted off-side units).
            if !self.retain_unit_history && self.processed.is_multiple_of(64) {
                self.collect_units();
            }
        }
        Ok(frames)
    }
    pub(crate) fn collect_units(&mut self) {
        self.units.retain_reachable(
            self.players
                .iter()
                .copied()
                .chain(self.enemies.iter().flatten().copied())
                .chain(self.queue.events().iter().flat_map(|event| {
                    [event.source, event.target, event.source_ref]
                        .into_iter()
                        .flatten()
                })),
        );
    }
    pub(crate) fn apply_setup(&mut self) -> Result<(), String> {
        for setup in self.case.setup.clone() {
            let id = self.units.id_at(setup.unit).ok_or("Unknown setup unit")?;
            if !setup.buffs.is_empty() {
                self.buff(id, &setup.buffs, Some(self.time))?;
            }
            let unit = self.unit_mut(id);
            if let Some(patch) = setup.combat_details.as_object() {
                let mut value = serde_json::to_value(&unit.attributes.details)
                    .map_err(|_| "Cannot encode setup")?;
                for (key, item) in patch {
                    if key == "combatStats" {
                        for (stat, item) in item.as_object().ok_or("Invalid setup stats")? {
                            value[key][stat] = item.clone();
                        }
                    } else {
                        value[key] = item.clone();
                    }
                }
                unit.attributes.details =
                    serde_json::from_value(value).map_err(|_| "Invalid setup attributes")?;
            }
            if let Some(flags) = setup.flags.as_object() {
                for (key, value) in flags {
                    match key.as_str() {
                        "isStunned" => unit.stunned = value.as_bool().ok_or("Invalid stun flag")?,
                        "isBlinded" => {
                            unit.blinded = value.as_bool().ok_or("Invalid blind flag")?
                        }
                        "isSilenced" => {
                            unit.silenced = value.as_bool().ok_or("Invalid silence flag")?
                        }
                        "isOutOfMana" => {
                            unit.out_of_mana = value.as_bool().ok_or("Invalid mana flag")?
                        }
                        "isWeakened" => {
                            unit.weakened = value.as_bool().ok_or("Invalid weaken flag")?
                        }
                        "weakenPercentage" => {
                            unit.weaken_percentage =
                                value.as_f64().ok_or("Invalid weaken percentage")?
                        }
                        "stunExpireTime" => unit.stun_expire = value.as_f64(),
                        "blindExpireTime" => unit.blind_expire = value.as_f64(),
                        "silenceExpireTime" => unit.silence_expire = value.as_f64(),
                        "weakenExpireTime" => unit.weaken_expire = value.as_f64(),
                        _ => return Err("Unknown setup flag".into()),
                    }
                }
            }
            for (index, time) in setup.last_used {
                unit.abilities
                    .get_mut(index)
                    .and_then(Option::as_mut)
                    .ok_or("Unknown setup ability")?
                    .last_used = time;
            }
        }
        for spec in self.case.scheduled.clone() {
            let unit = spec
                .unit
                .map(|index| self.units.id_at(index).ok_or("Unknown scheduled unit"))
                .transpose()?;
            let mut event = CombatEvent::new(spec.kind, spec.time, unit);
            if spec.kind == EventKind::Respawn {
                event.hrid = Some(self.unit(unit.ok_or("Respawn needs a unit")?).hrid.clone());
                event.source = None;
            }
            if !matches!(
                spec.kind,
                EventKind::Respawn
                    | EventKind::BuffExpire
                    | EventKind::Regen
                    | EventKind::StunExpire
                    | EventKind::BlindExpire
                    | EventKind::SilenceExpire
                    | EventKind::CurseExpire
                    | EventKind::WeakenExpire
                    | EventKind::FuryExpire
                    | EventKind::Await
                    | EventKind::Cooldown
            ) {
                return Err("Unsupported scheduled event".into());
            }
            if matches!(
                spec.kind,
                EventKind::BuffExpire
                    | EventKind::StunExpire
                    | EventKind::BlindExpire
                    | EventKind::SilenceExpire
                    | EventKind::CurseExpire
                    | EventKind::WeakenExpire
                    | EventKind::FuryExpire
                    | EventKind::Await
            ) && unit.is_none()
            {
                return Err("Scheduled event needs a unit".into());
            }
            self.push(event)?;
        }
        Ok(())
    }
    pub(crate) fn process(&mut self, event: CombatEvent) -> Result<(), String> {
        match event.kind {
            EventKind::Start => {
                if self.full.is_some() {
                    let lab = self.full.as_ref().unwrap().lab.is_some();
                    for id in self.players.clone() {
                        self.units.get_mut(id).unwrap().reset(
                            if lab { 0.0 } else { self.time },
                            self.time == 0.0,
                            &self.data,
                            &mut self.rng,
                        )?;
                    }
                    self.at(EventKind::Regen, self.time + REGEN, None)?;
                    self.full_start_encounter()?;
                    return Ok(());
                }
                for id in self.players.clone() {
                    self.units.get_mut(id).unwrap().reset(
                        self.time,
                        true,
                        &self.data,
                        &mut self.rng,
                    )?;
                }
                self.at(EventKind::Regen, self.time + REGEN, None)?;
                for id in self.enemies.clone().unwrap_or_default() {
                    self.units.get_mut(id).unwrap().reset(
                        self.time,
                        false,
                        &self.data,
                        &mut self.rng,
                    )?;
                }
                let mut enrage = CombatEvent::new(EventKind::Enrage, self.time + ENRAGE, None);
                enrage.encounter_time = Some(ENRAGE);
                self.push(enrage)?;
                self.apply_setup()?;
                self.check_triggers()?;
                self.start_attacks()?;
            }
            EventKind::Attack => self.auto_attack(event.source.ok_or("Missing attack source")?)?,
            EventKind::Cast => {
                self.use_ability(
                    event.source.ok_or("Missing caster")?,
                    event.ability.ok_or("Missing ability")?,
                )?;
            }
            EventKind::Await => self.next_attack(event.source.ok_or("Missing cooldown source")?)?,
            EventKind::Cooldown => {}
            EventKind::BuffExpire
            | EventKind::CurseExpire
            | EventKind::WeakenExpire
            | EventKind::FuryExpire => self.step(
                event.source.ok_or("Missing buff source")?,
                &AttributeStep::Expire { time: self.time },
            )?,
            EventKind::StunExpire => {
                let id = event.source.ok_or("Missing stun source")?;
                self.unit_mut(id).stunned = false;
                self.next_attack(id)?;
            }
            EventKind::BlindExpire => {
                let id = event.source.ok_or("Missing blind source")?;
                self.unit_mut(id).blinded = false;
                self.next_attack(id)?;
            }
            EventKind::SilenceExpire => {
                self.unit_mut(event.source.ok_or("Missing silence source")?)
                    .silenced = false
            }
            EventKind::Regen => self.regen()?,
            EventKind::Enrage => self.enrage(event.encounter_time.unwrap_or(ENRAGE))?,
            EventKind::Hot => self.hot(event)?,
            EventKind::Dot => self.dot(event)?,
            EventKind::Respawn => {
                let id = self
                    .players
                    .iter()
                    .copied()
                    .find(|id| Some(&self.unit(*id).hrid) == event.hrid.as_ref())
                    .ok_or("Unknown respawning player")?;
                let unit = self.unit_mut(id);
                unit.attributes.details.current_hitpoints = unit.attributes.details.max_hitpoints;
                unit.attributes.details.current_manapoints = unit.attributes.details.max_manapoints;
                self.step(id, &AttributeStep::Clear)?;
                self.unit_mut(id).clear_cc();
                if self.all_players_dead {
                    self.all_players_dead = false;
                    self.start_attacks()?;
                } else {
                    self.next_attack(id)?;
                }
            }
            EventKind::NextEncounter => {
                self.full_start_encounter()?;
            }
        }
        Ok(())
    }
    pub(crate) fn start_attacks(&mut self) -> Result<(), String> {
        for id in self
            .players
            .iter()
            .chain(self.enemies.as_deref().unwrap_or_default())
            .copied()
            .collect::<Vec<_>>()
        {
            if self.unit(id).alive() {
                self.next_attack(id)?;
            }
        }
        Ok(())
    }
    pub(crate) fn trigger(
        &self,
        trigger: &Trigger,
        source: UnitId,
        target: Option<UnitId>,
        allies: &[UnitId],
        enemies: Option<&[UnitId]>,
    ) -> Result<bool, String> {
        let dep = trigger.dependency;
        let value = match dep {
            TriggerDependency::SelfUnit => self.unit(source).trigger_value(trigger, self.time)?,
            TriggerDependency::Target => {
                let Some(target) = target else {
                    return Ok(false);
                };
                self.unit(target).trigger_value(trigger, self.time)?
            }
            TriggerDependency::Allies | TriggerDependency::Enemies => {
                let values = if dep == TriggerDependency::Allies {
                    allies
                } else {
                    let Some(values) = enemies else {
                        return Ok(false);
                    };
                    values
                };
                let condition = trigger.condition;
                let value = match condition {
                    TriggerCondition::ActiveUnits => {
                        values.iter().filter(|id| self.unit(**id).alive()).count() as f64
                    }
                    TriggerCondition::DeadUnits => values
                        .iter()
                        .filter(|id| self.unit(**id).attributes.details.current_hitpoints <= 0.0)
                        .count() as f64,
                    TriggerCondition::LowestHp => {
                        values.iter().filter(|id| self.unit(**id).alive()).fold(
                            2.0_f64,
                            |min, id| {
                                let details = &self.unit(*id).attributes.details;
                                let current = details.current_hitpoints / details.max_hitpoints;
                                if current < min {
                                    current
                                } else {
                                    min
                                }
                            },
                        ) * 100.0
                    }
                    _ => {
                        let mut total = 0.0;
                        let mut object = false;
                        for id in values.iter().copied().filter(|id| self.unit(*id).alive()) {
                            let value = self.unit(id).trigger_value(trigger, self.time)?;
                            total += value.number;
                            object |= value.object;
                        }
                        return Self::compare(
                            trigger,
                            &Dependency {
                                number: total,
                                active: object || (total != 0.0 && !total.is_nan()),
                                object,
                            },
                        );
                    }
                };
                Dependency {
                    number: value,
                    active: value != 0.0 && !value.is_nan(),
                    object: false,
                }
            }
            _ => return Err("Unknown trigger dependency".into()),
        };
        Self::compare(trigger, &value)
    }
    pub(crate) fn compare(trigger: &Trigger, value: &Dependency) -> Result<bool, String> {
        Ok(match trigger.comparator {
            TriggerComparator::GreaterEqual => value.number >= trigger.value,
            TriggerComparator::LessEqual => value.number <= trigger.value,
            TriggerComparator::Active => value.active,
            TriggerComparator::Inactive => !value.active,
            _ => return Err("Unknown trigger comparator".into()),
        })
    }
    pub(crate) fn should_trigger(
        &self,
        id: UnitId,
        last: f64,
        cooldown: f64,
        triggers: &[Trigger],
        ability: bool,
    ) -> Result<bool, String> {
        let unit = self.unit(id);
        if unit.stunned || (ability && unit.silenced) || last + cooldown > self.time {
            return Ok(false);
        }
        let (allies, enemies) = self.side_refs(id);
        let target = self.first_target(enemies);
        let mut active = true;
        // The original loop evaluates all trigger conditions even after one fails.
        for trigger in triggers {
            if !self.trigger(trigger, id, target, allies, enemies)? {
                active = false;
            }
        }
        Ok(active)
    }
    pub(crate) fn can_use(&mut self, id: UnitId, mana_cost: f64) -> bool {
        if !self.unit(id).alive() {
            return false;
        }
        let oom = self.unit(id).attributes.details.current_manapoints < mana_cost;
        if self.unit(id).player {
            self.emit(ResultOp::Oom(id, oom));
        }
        !oom
    }
    pub(crate) fn next_attack(&mut self, id: UnitId) -> Result<(), String> {
        if self.queue.events().iter().any(|event| {
            event.source == Some(id) && matches!(event.kind, EventKind::Cast | EventKind::Attack)
        }) {
            return Ok(());
        }
        let count = self.unit(id).abilities.len();
        let mut skip = false;
        let mut used = false;
        for index in 0..count {
            if used || skip {
                continue;
            }
            // Trigger evaluation only reads state. Copy the scalars needed by
            // scheduling rather than cloning every ability, effect and trigger.
            let (triggered, mana_cost, cast) = {
                let unit = self.unit(id);
                let Some(ability) = unit.abilities[index].as_ref() else {
                    continue;
                };
                let haste = unit.attributes.details.combat_stats.ability_haste;
                let cd = if haste > 0.0 {
                    ability.cooldown * 100.0 / (100.0 + haste)
                } else {
                    ability.cooldown
                };
                (
                    self.should_trigger(id, ability.last_used, cd, &ability.triggers, true)?,
                    ability.mana_cost,
                    ability.cast,
                )
            };
            if triggered {
                if !self.can_use(id, mana_cost) {
                    skip = true;
                } else {
                    let cast =
                        cast / (1.0 + self.unit(id).attributes.details.combat_stats.cast_speed);
                    let mut event = CombatEvent::new(EventKind::Cast, self.time + cast, Some(id));
                    event.ability = Some(index);
                    self.push(event)?;
                    used = true;
                }
            }
        }
        if used {
            self.unit_mut(id).out_of_mana = false;
            return Ok(());
        }
        if self.side_refs(id).1.is_none() {
            return Ok(());
        }
        if !self.unit(id).blinded {
            self.at(
                EventKind::Attack,
                self.time
                    + self
                        .unit(id)
                        .attributes
                        .details
                        .combat_stats
                        .attack_interval,
                Some(id),
            )?;
        } else {
            self.unit_mut(id).out_of_mana = true;
        }
        Ok(())
    }
    pub(crate) fn check_triggers(&mut self) -> Result<(), String> {
        let mut snapshot = std::mem::take(&mut self.trigger_snapshot);
        let result = self.check_triggers_with_snapshot(&mut snapshot);
        // Restore reusable storage on both success and evaluation errors.
        snapshot.clear();
        self.trigger_snapshot = snapshot;
        result
    }

    fn check_triggers_with_snapshot(&mut self, snapshot: &mut Vec<UnitId>) -> Result<(), String> {
        for _ in 0..10_000 {
            let mut used = false;
            // Consumption changes unit state and queues later events; it does
            // not change either roster. Keep the original per-side alive
            // snapshot and order, reusing its storage instead of cloning sides.
            for enemy_side in [false, true] {
                snapshot.clear();
                let side = if enemy_side {
                    self.enemies.as_deref().unwrap_or_default()
                } else {
                    &self.players
                };
                snapshot.extend(side.iter().copied().filter(|id| self.unit(*id).alive()));
                for &id in snapshot.iter() {
                    if !self.unit(id).alive() {
                        return Err("Checking triggers for a dead unit".into());
                    }
                    for drink in [false, true] {
                        let count = if drink {
                            self.unit(id).drinks.len()
                        } else {
                            self.unit(id).food.len()
                        };
                        for index in 0..count {
                            let item = (if drink {
                                &self.unit(id).drinks
                            } else {
                                &self.unit(id).food
                            })[index]
                                .as_ref();
                            let Some(item) = item else {
                                continue;
                            };
                            let stats = &self.unit(id).attributes.details.combat_stats;
                            let haste = if item.is_food {
                                stats.food_haste
                            } else {
                                stats.drink_concentration
                            };
                            let cd = if haste > 0.0 {
                                item.cooldown / (1.0 + haste)
                            } else {
                                item.cooldown
                            };
                            if self.should_trigger(id, item.last_used, cd, &item.triggers, false)? {
                                // Keep the execution snapshot, but do not copy
                                // strings/triggers/buffs for a rejected item.
                                let item = item.clone();
                                if self.consume(id, drink, index, &item)? {
                                    used = true;
                                }
                            }
                        }
                    }
                }
            }
            if !used {
                return Ok(());
            }
        }
        Err("Consumable triggers did not settle".into())
    }
    pub(crate) fn consume(
        &mut self,
        id: UnitId,
        drink: bool,
        index: usize,
        item: &Consumable,
    ) -> Result<bool, String> {
        if !self.unit(id).alive() {
            return Ok(false);
        }
        let time = self.time;
        let unit = self.unit_mut(id);
        (if drink {
            &mut unit.drinks
        } else {
            &mut unit.food
        })[index]
            .as_mut()
            .unwrap()
            .last_used = time;
        let stats = &self.unit(id).attributes.details.combat_stats;
        let concentration = stats.drink_concentration;
        let food_haste = stats.food_haste;
        let mut cd = item.cooldown;
        if concentration > 0.0 && item.is_drink {
            cd /= 1.0 + concentration;
        } else if food_haste > 0.0 && item.is_food {
            cd /= 1.0 + food_haste;
        }
        self.at(EventKind::Cooldown, self.time + cd, None)?;
        self.emit(ResultOp::Consume(id, &item.hrid));
        if item.recovery == 0.0 {
            if item.hp > 0.0 {
                let value = self.unit_mut(id).add_hp(item.hp);
                self.emit(ResultOp::Hp(id, &item.hrid, value));
            }
            if item.mp > 0.0 {
                let value = self.unit_mut(id).add_mp(item.mp);
                self.emit(ResultOp::Mp(id, &item.hrid, value));
                if self.unit(id).out_of_mana {
                    self.at(EventKind::Await, self.time, Some(id))?;
                }
            }
        } else {
            let mut event = CombatEvent::new(EventKind::Hot, self.time + HOT, Some(id));
            event.consumable = Some((drink, index));
            event.ticks = Some(item.recovery / HOT);
            event.tick = Some(1.0);
            self.push(event)?;
        }
        for buff in &item.buffs {
            let mut buff = buff.clone();
            if concentration > 0.0 && item.is_drink {
                buff.ratio_boost *= 1.0 + concentration;
                buff.flat_boost *= 1.0 + concentration;
                buff.duration /= 1.0 + concentration;
            }
            self.buff(id, &[buff.clone()], Some(self.time))?;
            self.at(EventKind::BuffExpire, self.time + buff.duration, Some(id))?;
        }
        Ok(true)
    }
    pub(crate) fn hot(&mut self, mut event: CombatEvent) -> Result<(), String> {
        let id = event.source.ok_or("Missing HOT source")?;
        let (drink, index) = event.consumable.ok_or("Missing consumable")?;
        let item = (if drink {
            &self.unit(id).drinks
        } else {
            &self.unit(id).food
        })[index]
            .as_ref()
            .ok_or("Unknown consumable")?
            .clone();
        let tick = event.tick.ok_or("Missing HOT tick")?;
        let ticks = event.ticks.ok_or("Missing HOT ticks")?;
        if item.hp > 0.0 {
            let value = self
                .unit_mut(id)
                .add_hp(combat_math::tick_value(item.hp, ticks, tick));
            self.emit(ResultOp::Hp(id, &item.hrid, value));
        }
        if item.mp > 0.0 {
            let value = self
                .unit_mut(id)
                .add_mp(combat_math::tick_value(item.mp, ticks, tick));
            self.emit(ResultOp::Mp(id, &item.hrid, value));
            if self.unit(id).out_of_mana {
                self.at(EventKind::Await, self.time, Some(id))?;
            }
        }
        if tick < ticks {
            event.time = self.time + HOT;
            event.tick = Some(tick + 1.0);
            self.push(event)?;
        }
        Ok(())
    }
    pub(crate) fn dot(&mut self, mut event: CombatEvent) -> Result<(), String> {
        let target = event.target.ok_or("Missing DOT target")?;
        let source = event.source_ref.ok_or("Missing DOT source ref")?;
        let tick = event.tick.ok_or("Missing DOT tick")?;
        let ticks = event.ticks.ok_or("Missing DOT ticks")?;
        let damage =
            combat_math::tick_value(event.amount.ok_or("Missing DOT damage")?, ticks, tick)
                .min(self.unit(target).attributes.details.current_hitpoints);
        self.unit_mut(target).attributes.details.current_hitpoints -= damage;
        self.emit(ResultOp::Attack {
            source,
            target,
            ability: "damageOverTime",
            hit: Hit::Damage(damage),
        });
        if tick < ticks {
            event.time = self.time + DOT;
            event.tick = Some(tick + 1.0);
            self.push(event)?;
        }
        if self.unit(target).player {
            self.full_log(None, target, "damageOverTime", damage, false);
        }
        self.death_if_zero(target);
        self.check_end()?;
        Ok(())
    }
    pub(crate) fn regen(&mut self) -> Result<(), String> {
        for id in self.players.clone() {
            if !self.unit(id).alive() {
                continue;
            }
            let details = &self.unit(id).attributes.details;
            let hp = (details.max_hitpoints * details.combat_stats.hp_regen_per10).floor();
            let mp = (details.max_manapoints * details.combat_stats.mp_regen_per10).floor();
            let hp = self.unit_mut(id).add_hp(hp);
            self.emit(ResultOp::Hp(id, "regen", hp));
            let mp = self.unit_mut(id).add_mp(mp);
            self.emit(ResultOp::Mp(id, "regen", mp));
            if self.unit(id).out_of_mana {
                self.at(EventKind::Await, self.time, Some(id))?;
            }
        }
        self.at(EventKind::Regen, self.time + REGEN, None)
    }
    pub(crate) fn enrage(&mut self, elapsed: f64) -> Result<(), String> {
        let Some(enemies) = self.enemies.clone() else {
            return Ok(());
        };
        for id in self.live(&enemies) {
            let stack = (elapsed / self.unit(id).enrage_time).floor().min(10.0);
            if stack <= 0.0 {
                continue;
            }
            let damage = Self::make_buff("enrage_damage", "damage", stack * 0.1, 0.0, ENRAGE);
            let accuracy = Self::make_buff("enrage_accuracy", "accuracy", stack * 0.1, 0.0, ENRAGE);
            self.buff(id, &[damage, accuracy], None)?;
            self.max_enrage = self.max_enrage.max(stack);
        }
        let mut event = CombatEvent::new(EventKind::Enrage, self.time + ENRAGE, None);
        event.encounter_time = Some(elapsed + ENRAGE);
        self.push(event)
    }
    pub(crate) fn make_buff(
        unique: &str,
        kind: &str,
        ratio: f64,
        flat: f64,
        duration: f64,
    ) -> CombatBuff {
        CombatBuff {
            instance: None,
            unique_hrid: format!("/buff_uniques/{unique}"),
            type_hrid: format!("/buff_types/{kind}"),
            ratio_boost: ratio,
            flat_boost: flat,
            duration,
            start_time: None,
        }
    }
    pub(crate) fn death_if_zero(&mut self, id: UnitId) {
        if self.unit(id).attributes.details.current_hitpoints == 0.0 {
            self.clear_unit(id);
            self.emit(ResultOp::Death(id));
        }
    }
    pub(crate) fn check_end(&mut self) -> Result<bool, String> {
        if let Some(enemies) = self.enemies.clone() {
            for id in &enemies {
                if !self.unit(*id).alive() && self.unit(*id).experience_rate == 0.0 {
                    let begin = self
                        .full
                        .as_ref()
                        .map(|full| full.encounter_start)
                        .unwrap_or(0.0);
                    let elapsed = (self.time - begin).min(self.unit(*id).enrage_time);
                    self.unit_mut(*id).experience_rate = 1.0 + elapsed / self.unit(*id).enrage_time;
                }
            }
            if self.live(&enemies).is_empty() {
                self.queue
                    .clear_matching(|event| event.kind == EventKind::Attack);
                self.at(EventKind::NextEncounter, self.time + 3.0 * SECOND, None)?;
                let experience: f64 = enemies
                    .iter()
                    .map(|id| self.unit(*id).attributes.experience * self.unit(*id).experience_rate)
                    .sum();
                for id in self.players.clone() {
                    self.emit(ResultOp::Experience(
                        id,
                        experience / self.players.len() as f64,
                    ));
                }
                self.enemies = None;
                if let Some(full) = &mut self.full {
                    if let Some(zone) = &full.zone {
                        if zone.dungeon {
                            full.result
                                .alive(&format!("#{}", zone.killed - 1), false, self.time);
                            if zone.killed > zone.max_waves {
                                if let Some(start) = full.result.value["timeSpentAlive"]
                                    .as_array()
                                    .unwrap()
                                    .iter()
                                    .find(|entry| entry["name"] == "#1")
                                    .and_then(|entry| entry["spawnedAt"].as_f64())
                                {
                                    let elapsed = self.time - start;
                                    for key in ["minDungenonTime", "maxDungenonTime"] {
                                        let previous = full.result.value[key].as_f64().unwrap();
                                        if previous == 0.0
                                            || (key == "minDungenonTime" && previous > elapsed)
                                            || (key == "maxDungenonTime" && previous < elapsed)
                                        {
                                            full.result.value[key] = json!(elapsed);
                                        }
                                    }
                                }
                                full.result.value["lastDungeonFinishTime"] = json!(self.time);
                            }
                        }
                    }
                }
                self.emit(ResultOp::Encounter);
            }
        }
        for id in self.players.clone() {
            if !self.unit(id).alive()
                && !self.queue.events().iter().any(|event| {
                    event.kind == EventKind::Respawn
                        && event.hrid.as_deref() == Some(self.unit(id).hrid.as_str())
                })
            {
                if self
                    .full
                    .as_ref()
                    .is_none_or(|full| full.zone.as_ref().is_some_and(|zone| !zone.dungeon))
                {
                    let mut event =
                        CombatEvent::new(EventKind::Respawn, self.time + 150.0 * SECOND, None);
                    event.hrid = Some(self.unit(id).hrid.clone());
                    self.push(event)?;
                }
                self.emit(ResultOp::Oom(id, false));
            }
        }
        if self.live(&self.players).is_empty() {
            if self
                .full
                .as_ref()
                .is_some_and(|full| full.zone.as_ref().is_some_and(|zone| zone.dungeon))
            {
                let full = self.full.as_mut().unwrap();
                full.result.value["wipeEvents"].as_array_mut().unwrap().push(json!({"simulationTime":self.time,"logs":full.logs.iter().collect::<Vec<_>>(),"wave":full.zone.as_ref().unwrap().killed-1,"timestamp":"runtime-clock"}));
                full.logs.clear();
                for kind in [
                    EventKind::Attack,
                    EventKind::Cast,
                    EventKind::Dot,
                    EventKind::Hot,
                    EventKind::Regen,
                    EventKind::Enrage,
                    EventKind::StunExpire,
                    EventKind::BlindExpire,
                    EventKind::SilenceExpire,
                    EventKind::Await,
                ] {
                    self.queue.clear_matching(|event| event.kind == kind);
                }
                self.enemies = None;
                self.at(EventKind::Start, self.time + 3e9, None)?;
            }
            self.queue
                .clear_matching(|event| event.kind == EventKind::Attack);
            // JS removes attacks first, then casts from the resulting heap.
            // Combining the predicates changes equal-time event ordering.
            self.queue
                .clear_matching(|event| event.kind == EventKind::Cast);
            self.all_players_dead = true;
        }
        let ended = self.enemies.is_none() || self.all_players_dead;
        if self.full.as_ref().is_some_and(|full| {
            full.lab.is_some() && (self.time - full.encounter_start > 120e9 || ended)
        }) {
            self.enemies = None;
            self.queue.clear();
            self.at(EventKind::Start, self.time, None)?;
            return Ok(true);
        }
        Ok(ended)
    }
    pub(crate) fn parry(&mut self, targets: &[UnitId]) -> Option<UnitId> {
        let values: Vec<_> = self
            .live(targets)
            .into_iter()
            .filter(|id| self.unit(*id).attributes.details.combat_stats.parry > 0.0)
            .collect();
        if values.is_empty() {
            return None;
        }
        let id = values[(self.rng.next_f64() * values.len() as f64).floor() as usize];
        if self.unit(id).attributes.details.combat_stats.parry > self.rng.next_f64() {
            Some(id)
        } else {
            None
        }
    }
    pub(crate) fn threat_target(&mut self, targets: &[UnitId]) -> Result<UnitId, String> {
        let total: f64 = targets
            .iter()
            .map(|id| self.unit(*id).attributes.details.combat_stats.threat)
            .sum();
        let value = self.rng.next_f64() * total;
        let mut cumulative = 0.0;
        for id in targets {
            let threat = self.unit(*id).attributes.details.combat_stats.threat;
            cumulative += threat;
            if value >= cumulative - threat && value < cumulative {
                return Ok(*id);
            }
        }
        Err("Threat selection found no target".into())
    }
    pub(crate) fn attack(
        &mut self,
        source: UnitId,
        target: UnitId,
        effect: Option<&AbilityEffect>,
    ) -> Result<AttackResult, String> {
        let (source, target) = self
            .units
            .pair_mut(source, target)
            .ok_or("Invalid attack identities")?;
        combat_math::attack(source, target, effect, &mut self.rng)
    }
    pub(crate) fn record_attack(
        &mut self,
        source: UnitId,
        target: UnitId,
        ability: &str,
        result: &AttackResult,
    ) {
        self.emit(ResultOp::Attack {
            source,
            target,
            ability,
            hit: if result.did_hit {
                Hit::Damage(result.damage_done)
            } else {
                Hit::Miss
            },
        });
    }
    pub(crate) fn record_returns(
        &mut self,
        source: UnitId,
        target: UnitId,
        result: &AttackResult,
        resources: bool,
        logs: bool,
    ) {
        if resources && result.life_steal_heal > 0.0 {
            self.emit(ResultOp::Hp(source, "lifesteal", result.life_steal_heal));
        }
        if resources && result.mana_leech_mana > 0.0 {
            self.emit(ResultOp::Mp(source, "manaLeech", result.mana_leech_mana));
        }
        if result.thorn_damage_done > 0.0 {
            if logs && self.unit(source).player {
                self.full_log(
                    Some(target),
                    source,
                    &result.thorn_type,
                    result.thorn_damage_done,
                    false,
                );
            }
            self.emit(ResultOp::Attack {
                source: target,
                target: source,
                ability: &result.thorn_type,
                hit: Hit::Damage(result.thorn_damage_done),
            });
        }
        if logs && result.retaliation_damage_done > 0.0 && self.unit(source).player {
            self.full_log(
                Some(target),
                source,
                "retaliation",
                result.retaliation_damage_done,
                false,
            );
        }
        if self
            .unit(target)
            .attributes
            .details
            .combat_stats
            .retaliation
            > 0.0
        {
            self.emit(ResultOp::Attack {
                source: target,
                target: source,
                ability: "retaliation",
                hit: if result.retaliation_damage_done > 0.0 {
                    Hit::Damage(result.retaliation_damage_done)
                } else {
                    Hit::Miss
                },
            });
        }
    }
    pub(crate) fn stacks(
        &mut self,
        source: UnitId,
        target: UnitId,
        result: &AttackResult,
        skill: bool,
    ) -> Result<(), String> {
        let curse = self.unit(source).attributes.details.combat_stats.curse;
        if result.did_hit && curse > 0.0 {
            let amount = self
                .queue
                .events()
                .iter()
                .find(|event| event.kind == EventKind::CurseExpire && event.source == Some(target))
                .and_then(|event| event.amount)
                .unwrap_or(0.0);
            self.queue.clear_matching(|event| {
                event.kind == EventKind::CurseExpire && event.source == Some(target)
            });
            let amount = (amount + 1.0).min(5.0);
            let mut event = CombatEvent::new(
                EventKind::CurseExpire,
                self.time + STACK_DURATION,
                Some(target),
            );
            event.amount = Some(amount);
            self.buff(
                target,
                &[Self::make_buff(
                    "curse",
                    "damage_taken",
                    0.0,
                    curse * amount,
                    STACK_DURATION,
                )],
                Some(self.time),
            )?;
            self.push(event)?;
        }
        let fury = self.unit(source).attributes.details.combat_stats.fury;
        if fury > 0.0 {
            let amount = self
                .queue
                .events()
                .iter()
                .find(|event| event.kind == EventKind::FuryExpire && event.source == Some(source))
                .and_then(|event| event.amount)
                .unwrap_or(0.0);
            self.queue.clear_matching(|event| {
                event.kind == EventKind::FuryExpire && event.source == Some(source)
            });
            let amount = if result.did_hit {
                (amount + 1.0).min(5.0)
            } else {
                amount / 2.0
            };
            if amount > 0.0 {
                let mut event = CombatEvent::new(
                    EventKind::FuryExpire,
                    self.time + STACK_DURATION,
                    Some(source),
                );
                event.amount = Some(amount);
                self.push(event)?;
                self.buff(
                    source,
                    &[
                        Self::make_buff(
                            "fury_accuracy",
                            "fury_accuracy",
                            amount * fury,
                            0.0,
                            STACK_DURATION,
                        ),
                        Self::make_buff(
                            "fury_damage",
                            "fury_damage",
                            amount * fury,
                            0.0,
                            STACK_DURATION,
                        ),
                    ],
                    Some(self.time),
                )?;
            } else {
                self.step(
                    source,
                    &AttributeStep::Remove {
                        keys: vec![
                            "/buff_uniques/fury_accuracy".into(),
                            "/buff_uniques/fury_damage".into(),
                        ],
                    },
                )?;
            }
        }
        let weaken = self.unit(target).attributes.details.combat_stats.weaken;
        if weaken > 0.0 {
            if skill {
                self.unit_mut(source).weaken_expire = Some(self.time + STACK_DURATION);
            }
            let amount = self
                .queue
                .events()
                .iter()
                .find(|event| event.kind == EventKind::WeakenExpire && event.source == Some(source))
                .and_then(|event| event.amount)
                .unwrap_or(0.0);
            self.queue.clear_matching(|event| {
                event.kind == EventKind::WeakenExpire && event.source == Some(source)
            });
            let amount = (amount + 1.0).min(5.0);
            let mut event = CombatEvent::new(
                EventKind::WeakenExpire,
                self.time + STACK_DURATION,
                Some(source),
            );
            event.amount = Some(amount);
            self.buff(
                source,
                &[Self::make_buff(
                    "weaken",
                    "damage",
                    -weaken * amount,
                    0.0,
                    STACK_DURATION,
                )],
                Some(self.time),
            )?;
            self.push(event)?;
        }
        Ok(())
    }
    pub(crate) fn auto_attack(&mut self, original: UnitId) -> Result<(), String> {
        let (_, targets) = self.sides(original);
        let Some(targets) = targets else {
            return Ok(());
        };
        let alive = self.live(&targets);
        for (index, id) in alive.iter().enumerate() {
            let mut target = *id;
            if !self.unit(original).player && alive.len() > 1 {
                target = self.threat_target(&alive)?;
            }
            let mut source = original;
            let parry = self.parry(&targets);
            if let Some(value) = parry {
                target = source;
                source = value;
            }
            let result = self.attack(source, target, None)?;
            if self.unit(target).player && result.did_hit && result.damage_done > 0.0 {
                self.full_log(
                    Some(source),
                    target,
                    "autoAttack",
                    result.damage_done,
                    result.is_crit,
                );
            }
            let mayhem =
                self.unit(source).attributes.details.combat_stats.mayhem > self.rng.next_f64();
            self.stacks(source, target, &result, false)?;
            if !mayhem || result.did_hit || index == alive.len() - 1 {
                self.record_attack(
                    source,
                    target,
                    if parry.is_some() {
                        "parry"
                    } else {
                        "autoAttack"
                    },
                    &result,
                );
            }
            self.record_returns(source, target, &result, true, true);
            self.death_if_zero(target);
            if self.unit(source).attributes.details.current_hitpoints == 0.0
                && (result.thorn_damage_done != 0.0 || result.retaliation_damage_done != 0.0)
            {
                self.death_if_zero(source);
                break;
            }
            if mayhem && !result.did_hit {
                continue;
            }
            if !result.did_hit
                || parry.is_some()
                || self.unit(source).attributes.details.combat_stats.pierce <= self.rng.next_f64()
            {
                break;
            }
        }
        if !self.check_end()? {
            self.next_attack(original)?;
        }
        Ok(())
    }
    pub(crate) fn use_ability(&mut self, mut source: UnitId, index: usize) -> Result<bool, String> {
        let ability = self
            .unit(source)
            .abilities
            .get(index)
            .and_then(Option::as_ref)
            .ok_or("Unknown cast ability")?
            .clone();
        if !self.can_use(source, ability.mana_cost) {
            return Ok(false);
        }
        let time = self.time;
        let unit = self.unit_mut(source);
        if unit.player {
            if let Some((_, value)) = unit
                .mana_costs
                .iter_mut()
                .find(|(key, _)| key == &ability.hrid)
            {
                *value += ability.mana_cost;
            } else {
                unit.mana_costs
                    .push((ability.hrid.clone(), ability.mana_cost));
            }
        }
        unit.attributes.details.current_manapoints -= ability.mana_cost;
        unit.abilities[index].as_mut().unwrap().last_used = time;
        let mut todo = vec![ability];
        let stats = self.unit(source).attributes.details.combat_stats.clone();
        if stats.blaze > 0.0 && self.rng.next_f64() < stats.blaze {
            todo.push(Ability::proc("blaze"));
        }
        if stats.bloom > 0.0 && self.rng.next_f64() < stats.bloom {
            todo.push(Ability::proc("bloom"));
        }
        for ability in todo {
            for effect in &ability.effects {
                match effect.kind.as_str() {
                    "/ability_effect_types/buff" => self.ability_buff(source, &ability, effect)?,
                    "/ability_effect_types/damage" => {
                        self.ability_damage(source, &ability, effect)?
                    }
                    "/ability_effect_types/heal" => {
                        self.ability_heal(source, &ability, effect, false)?
                    }
                    "/ability_effect_types/revive" => {
                        self.ability_heal(source, &ability, effect, true)?
                    }
                    "/ability_effect_types/spend_hp" => {
                        if effect.target != "self" {
                            return Err("Unsupported spend HP target".into());
                        }
                        let spent = (self.unit(source).attributes.details.current_hitpoints
                            * effect.spend_hp_ratio)
                            .floor();
                        self.unit_mut(source).attributes.details.current_hitpoints -= spent;
                        self.emit(ResultOp::HpSpent(source, &ability.hrid, spent));
                    }
                    "/ability_effect_types/promote" => {
                        self.clear_unit(source);
                        let types = [
                            "/monsters/enchanted_rook",
                            "/monsters/enchanted_knight",
                            "/monsters/enchanted_bishop",
                        ];
                        let hrid =
                            types[(self.rng.next_f64() * types.len() as f64).floor() as usize];
                        let tier = self.unit(source).tier;
                        let case = AttributeCase {
                            input: UnitInput::Monster(MonsterInput {
                                hrid: hrid.into(),
                                difficulty_tier: tier,
                                room_level: 0.0,
                            }),
                            zone_hrid: None,
                            extra: Value::Null,
                            steps: vec![],
                        };
                        source = self.units.spawn(RuntimeUnit::new(case, &self.data)?);
                        self.unit_mut(source).assign_buff_identities(source.index());
                        self.next_attack(source)?;
                    }
                    _ => return Err("Unsupported ability effect".into()),
                }
            }
        }
        let ripple = self.unit(source).attributes.details.combat_stats.ripple;
        if ripple > 0.0 && self.rng.next_f64() < ripple {
            let value = self.unit_mut(source).add_mp(10.0);
            self.emit(ResultOp::Mp(source, "ripple", value));
            let time = self.time;
            for ability in self.unit_mut(source).abilities.iter_mut().flatten() {
                if ability.last_used != 0.0 && ability.last_used + ability.cooldown - time > 0.0 {
                    ability.last_used =
                        (ability.last_used - SECOND * 2.0).max(time - ability.cooldown);
                }
            }
        }
        self.next_attack(source)?;
        self.death_if_zero(source);
        self.check_end()?;
        Ok(true)
    }
    pub(crate) fn ability_buff(
        &mut self,
        source: UnitId,
        ability: &Ability,
        effect: &AbilityEffect,
    ) -> Result<(), String> {
        let targets = match effect.target.as_str() {
            "self" => vec![source],
            "allAllies" => self.live(&self.sides(source).0),
            _ => return Err("Unsupported buff target".into()),
        };
        for target in targets {
            for value in effect.buffs.as_deref().unwrap_or_default() {
                let mut buff = value.buff.clone();
                if effect.target == "allAllies"
                    && ability.special
                    && !value.skill.is_empty()
                    && value.multiplier > 0.0
                {
                    let level = serde_json::to_value(&self.unit(source).attributes.details)
                        .map_err(|_| "Cannot read skill multiplier")?
                        [format!("{}Level", value.skill.rsplit('/').next().unwrap_or(""))]
                    .as_f64()
                    .unwrap_or(f64::NAN);
                    let multiplier = 1.0 + level * value.multiplier;
                    buff.flat_boost *= multiplier;
                    buff.ratio_boost *= multiplier;
                    buff.instance = None;
                }
                self.buff(target, &[buff], Some(self.time))?;
                self.at(
                    EventKind::BuffExpire,
                    self.time + value.buff.duration,
                    Some(target),
                )?;
            }
        }
        Ok(())
    }
    pub(crate) fn ability_damage(
        &mut self,
        source: UnitId,
        ability: &Ability,
        effect: &AbilityEffect,
    ) -> Result<(), String> {
        if effect.target != "enemy" && effect.target != "allEnemies" {
            return Err("Unsupported damage target".into());
        }
        let Some(mut targets) = self.sides(source).1 else {
            return Ok(());
        };
        let initial = self.live(&targets);
        let mut avoid: Vec<String> = vec![];
        for (index, initial_target) in initial.iter().enumerate() {
            let parry = if index == 0 {
                self.parry(&targets)
            } else {
                None
            };
            if let Some(parry) = parry {
                let result = self.attack(parry, source, None)?;
                self.record_attack(parry, source, "parry", &result);
                self.record_returns(parry, source, &result, true, false);
                self.death_if_zero(source);
                if self.unit(parry).attributes.details.current_hitpoints == 0.0
                    && (result.thorn_damage_done != 0.0 || result.retaliation_damage_done != 0.0)
                {
                    self.death_if_zero(parry);
                }
                break;
            }
            targets.retain(|id| self.unit(*id).alive() && !avoid.contains(&self.unit(*id).hrid));
            let mut target = *initial_target;
            if !self.unit(source).player && !targets.is_empty() && effect.target == "enemy" {
                target = self.threat_target(&targets)?;
                avoid.push(self.unit(target).hrid.clone());
            }
            if targets.is_empty() {
                break;
            }
            let result = self.attack(source, target, Some(effect))?;
            if self.unit(target).player && result.did_hit && result.damage_done > 0.0 {
                self.full_log(
                    Some(source),
                    target,
                    &ability.hrid,
                    result.damage_done,
                    result.is_crit,
                );
            }
            if result.hp_drain > 0.0 {
                self.emit(ResultOp::Hp(source, &ability.hrid, result.hp_drain));
            }
            if result.did_hit {
                for buff in effect.buffs.as_deref().unwrap_or_default() {
                    self.buff(target, std::slice::from_ref(&buff.buff), Some(self.time))?;
                    self.at(
                        EventKind::BuffExpire,
                        self.time + buff.buff.duration,
                        Some(target),
                    )?;
                }
            }
            if effect.dot_ratio > 0.0 && result.damage_done > 0.0 {
                let mut event = CombatEvent::new(EventKind::Dot, self.time + DOT, None);
                event.source_ref = Some(source);
                event.target = Some(target);
                event.amount = Some(result.damage_done * effect.dot_ratio);
                event.ticks = Some(effect.dot_duration / DOT);
                event.tick = Some(1.0);
                event.style = Some(effect.style.clone());
                self.push(event)?;
            }
            if result.did_hit {
                for (chance, duration, kind) in [
                    (effect.stun, effect.stun_duration, EventKind::StunExpire),
                    (effect.blind, effect.blind_duration, EventKind::BlindExpire),
                    (
                        effect.silence,
                        effect.silence_duration,
                        EventKind::SilenceExpire,
                    ),
                ] {
                    if chance > 0.0
                        && self.rng.next_f64()
                            < chance * 100.0
                                / (100.0
                                    + self.unit(target).attributes.details.combat_stats.tenacity)
                    {
                        self.apply_cc(target, duration, kind)?;
                    }
                }
            }
            self.stacks(source, target, &result, true)?;
            self.record_attack(source, target, &ability.hrid, &result);
            self.record_returns(source, target, &result, false, true);
            self.death_if_zero(target);
            if result.did_hit && effect.pierce > self.rng.next_f64() {
                continue;
            }
            if effect.target == "enemy" {
                break;
            }
        }
        Ok(())
    }
    pub(crate) fn apply_cc(
        &mut self,
        target: UnitId,
        duration: f64,
        kind: EventKind,
    ) -> Result<(), String> {
        let time = self.time + duration;
        let unit = self.unit_mut(target);
        match kind {
            EventKind::StunExpire => {
                unit.stunned = true;
                unit.stun_expire = Some(time);
                self.queue.clear_matching(|event| {
                    event.source == Some(target)
                        && matches!(
                            event.kind,
                            EventKind::Attack | EventKind::Cast | EventKind::StunExpire
                        )
                });
            }
            EventKind::BlindExpire => {
                unit.blinded = true;
                unit.blind_expire = Some(time);
                self.queue
                    .clear_matching(|event| event.source == Some(target) && event.kind == kind);
                if self.queue.clear_matching(|event| {
                    event.source == Some(target) && event.kind == EventKind::Attack
                }) {
                    self.next_attack(target)?;
                }
            }
            EventKind::SilenceExpire => {
                unit.silenced = true;
                unit.silence_expire = Some(time);
                self.queue
                    .clear_matching(|event| event.source == Some(target) && event.kind == kind);
                if self.queue.clear_matching(|event| {
                    event.source == Some(target) && event.kind == EventKind::Cast
                }) {
                    self.next_attack(target)?;
                }
            }
            _ => return Err("Invalid control expiration".into()),
        }
        self.at(kind, time, Some(target))
    }
    pub(crate) fn ability_heal(
        &mut self,
        source: UnitId,
        ability: &Ability,
        effect: &AbilityEffect,
        revive: bool,
    ) -> Result<(), String> {
        let allies = self.sides(source).0;
        let targets = if revive {
            if effect.target != "deadAlly" {
                return Err("Unsupported revive target".into());
            }
            allies
                .into_iter()
                .find(|id| self.unit(*id).attributes.details.current_hitpoints <= 0.0)
                .into_iter()
                .collect::<Vec<_>>()
        } else {
            match effect.target.as_str() {
                "self" => vec![source],
                "allAllies" => self.live(&allies),
                "lowestHpAlly" => {
                    let mut target = None;
                    for id in self.live(&allies) {
                        if target.is_none_or(|previous| {
                            let current = &self.unit(id).attributes.details;
                            let previous = &self.unit(previous).attributes.details;
                            current.current_hitpoints / current.max_hitpoints
                                < previous.current_hitpoints / previous.max_hitpoints
                        }) {
                            target = Some(id);
                        }
                    }
                    target.into_iter().collect()
                }
                _ => return Err("Unsupported heal target".into()),
            }
        };
        for target in targets {
            if revive {
                let hrid = self.unit(target).hrid.clone();
                self.queue.clear_matching(|event| {
                    event.kind == EventKind::Respawn && event.hrid.as_ref() == Some(&hrid)
                });
                self.step(target, &AttributeStep::Expire { time: self.time })?;
            }
            let value = combat_math::heal_roll(
                self.units.get(source).expect("valid heal source"),
                effect,
                &mut self.rng,
            )?;
            let healed = self.unit_mut(target).add_hp(value);
            if revive {
                let unit = self.unit_mut(target);
                unit.attributes.details.current_manapoints = unit.attributes.details.max_manapoints;
                unit.clear_cc();
            }
            self.emit(ResultOp::Hp(target, &ability.hrid, healed));
            if revive {
                self.next_attack(target)?;
                if !self.unit(target).player {
                    let hrid = self.unit(target).hrid.clone();
                    if let Some(full) = &mut self.full {
                        full.result.alive(&hrid, true, self.time);
                    }
                }
            }
        }
        Ok(())
    }
}
pub fn encounter_trace(cases: &[EncounterCase], data: Rc<DefinitionSet>) -> Result<Value, String> {
    if cases.len() > 1000
        || cases
            .iter()
            .map(|case| u64::from(case.max_events))
            .sum::<u64>()
            > 100_000
    {
        return Err("Too many encounter cases or event frames".into());
    }
    let mut output = Vec::new();
    for case in cases {
        let mut run = EncounterRun::new(case.clone(), data.clone())?;
        let mut frames = Vec::new();
        while !run.done() {
            frames.extend(run.advance(1000)?);
        }
        output.push(frames);
    }
    Ok(json!(output))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_run() -> EncounterRun {
        let data = Rc::new(DefinitionSet::parse(&json!({
            "schemaVersion": 1, "sourceSha256": "test", "definitions": {
                "actionDetailMap": {}, "abilityDetailMap": {}, "itemDetailMap": {},
                "combatMonsterDetailMap": {"/monsters/crab": {
                    "abilities": [], "enrageTime": 60e9,
                    "combatDetails": {"combatStats": {"combatStyleHrids": ["/combat_styles/stab"]}}
                }}
            }
        }).to_string(), "test").unwrap());
        let player: AttributeCase = serde_json::from_value(json!({"input": {
            "kind": "player", "inputVersion": 1, "hrid": "player1",
            "levels": [1,1,1,1,1,1,1], "equipment": [], "houseRooms": [],
            "achievements": {}, "shrines": [0,0,0,0,0], "guildBuffs": [],
            "food": [], "drinks": [], "abilities": [], "debuffOnLevelGap": 0
        }}))
        .unwrap();
        let enemy: AttributeCase = serde_json::from_value(json!({"input": {
            "kind": "monster", "hrid": "/monsters/crab"
        }}))
        .unwrap();
        EncounterRun::new(
            EncounterCase {
                players: vec![player],
                enemies: vec![enemy.clone()],
                seed: 1,
                max_events: 100,
                time_limit: 100e9,
                setup: vec![],
                scheduled: vec![],
            },
            data.clone(),
        )
        .unwrap()
    }

    #[test]
    fn collection_keeps_all_event_roots_and_surviving_shared_buffs() {
        let mut run = test_run();
        let data = run.data.clone();
        let enemy = run.case.enemies[0].clone();
        let player = run.players[0];
        let dot_source = run.enemies.as_ref().unwrap()[0];
        let target = run
            .units
            .spawn(RuntimeUnit::new(enemy.clone(), &data).unwrap());
        let promoted = run
            .units
            .spawn(RuntimeUnit::new(enemy.clone(), &data).unwrap());
        let active = run
            .units
            .spawn(RuntimeUnit::new(enemy.clone(), &data).unwrap());
        let garbage = run
            .units
            .spawn(RuntimeUnit::new(enemy.clone(), &data).unwrap());
        run.enemies = Some(vec![active]);
        run.queue.clear();
        let mut dot = CombatEvent::new(EventKind::Dot, 3e9, None);
        dot.source_ref = Some(dot_source);
        dot.target = Some(target);
        run.push(dot).unwrap();
        run.at(EventKind::Await, 4e9, Some(promoted)).unwrap();
        let mut buff = EncounterRun::make_buff("shared", "damage", 0.1, 0.0, 20e9);
        buff.instance = Some(((promoted.index() as u64 + 1) << 32) | 1);
        run.buff(player, &[buff.clone()], Some(1.0)).unwrap();

        run.collect_units();
        for id in [player, active, dot_source, target, promoted] {
            assert!(run.units.get(id).is_some());
        }
        assert!(run.units.get(garbage).is_none());
        run.queue.clear();
        run.collect_units();
        for id in [dot_source, target, promoted] {
            assert!(run.units.get(id).is_none());
        }
        assert_eq!(run.units.iter().count(), 2);
        let replacement = run.units.spawn(RuntimeUnit::new(enemy, &data).unwrap());
        buff.instance = Some(((replacement.index() as u64 + 1) << 32) | 1);
        run.buff(active, &[buff], Some(2.0)).unwrap();
        // Reusing a caster's slot cannot refresh a buff left on a survivor.
        assert_eq!(
            run.unit(player).attributes.buffs_snapshot()[0]["startTime"],
            1.0
        );
    }

    fn test_trigger(dependency: &str, condition: &str, comparator: &str) -> Trigger {
        serde_json::from_value(
            json!({"dependencyHrid": dependency, "conditionHrid": condition,
            "comparatorHrid": comparator, "value": 1e9}),
        )
        .unwrap()
    }

    #[test]
    fn compiled_trigger_errors_keep_original_skip_and_evaluation_order() {
        let mut run = test_run();
        let id = run.players[0];
        let invalid = test_trigger("self", "unknown", "is_active");
        assert!(!run
            .should_trigger(id, 0.0, 10.0, std::slice::from_ref(&invalid), true)
            .unwrap());
        run.unit_mut(id).stunned = true;
        assert!(!run
            .should_trigger(id, -100.0, 0.0, std::slice::from_ref(&invalid), true)
            .unwrap());
        run.unit_mut(id).stunned = false;
        run.unit_mut(id).silenced = true;
        assert!(!run
            .should_trigger(id, -100.0, 0.0, std::slice::from_ref(&invalid), true)
            .unwrap());
        run.unit_mut(id).silenced = false;
        run.enemies = None;
        assert!(!run
            .should_trigger(
                id,
                -100.0,
                0.0,
                &[test_trigger("targeted_enemy", "unknown", "unknown")],
                true
            )
            .unwrap());
        let false_first = test_trigger("self", "current_hp", "greater_than_equal");
        assert!(run
            .should_trigger(id, -100.0, 0.0, &[false_first, invalid], true)
            .unwrap_err()
            .contains("Unknown trigger condition"));
        assert!(run
            .should_trigger(
                id,
                -100.0,
                0.0,
                &[test_trigger("self", "current_hp", "unknown")],
                true
            )
            .unwrap_err()
            .contains("Unknown trigger comparator"));
    }

    #[test]
    fn trigger_snapshot_storage_survives_errors_and_roster_changes() {
        let mut run = test_run();
        let id = run.players[0];
        run.unit_mut(id).attributes.details.current_hitpoints = 10.0;
        run.unit_mut(id).food = vec![Some(Consumable {
            hrid: "test".into(),
            is_food: true,
            is_drink: false,
            cooldown: 1.0,
            hp: 0.0,
            mp: 0.0,
            recovery: 0.0,
            buffs: vec![],
            triggers: vec![test_trigger("self", "unknown", "is_active")],
            last_used: -100.0,
        })];
        assert!(run.check_triggers().is_err());
        assert!(run.trigger_snapshot.is_empty());
        let capacity = run.trigger_snapshot.capacity();
        assert!(capacity > 0);
        run.unit_mut(id).food.clear();
        run.unit_mut(id).attributes.details.current_hitpoints = 0.0;
        run.enemies = None;
        run.check_triggers().unwrap();
        assert_eq!(run.trigger_snapshot.capacity(), capacity);
        assert!(run.trigger_snapshot.is_empty());
    }

    #[test]
    fn consumable_categories_preserve_cooldown_and_buff_precedence() {
        for (category, food, drink, cooldown) in [
            (json!("/item_categories/food"), true, false, 20.0),
            (json!("/item_categories/drink"), false, true, 10.0),
            (json!("custom/food_and_drink"), true, true, 10.0),
            (json!("seafood"), true, false, 20.0),
            (json!("unknown"), false, false, 40.0),
            (json!("FOOD_DRINK"), false, false, 40.0),
            (Value::Null, false, false, 40.0),
            (json!(42), false, false, 40.0),
        ] {
            let data = DefinitionSet::parse(
                &json!({"schemaVersion": 1, "sourceSha256": "test", "definitions": {
                    "actionDetailMap": {}, "abilityDetailMap": {}, "combatMonsterDetailMap": {},
                    "itemDetailMap": {"test": {"categoryHrid": category,
                        "consumableDetail": {"cooldownDuration": 40, "defaultCombatTriggers": []}}}
                }})
                .to_string(),
                "test",
            )
            .unwrap();
            let selection = serde_json::from_value(json!({"hrid": "test"})).unwrap();
            let mut item = Consumable::selected(&selection, &data).unwrap();
            assert_eq!((item.is_food, item.is_drink), (food, drink));

            // Trigger eligibility prefers food haste, even when the category
            // also matches drink. Actual consumption gives drink precedence.
            let mut run = test_run();
            let id = run.players[0];
            let stats = &mut run.unit_mut(id).attributes.details.combat_stats;
            stats.food_haste = 1.0;
            stats.drink_concentration = 3.0;
            item.last_used = 0.0;
            run.unit_mut(id).food = vec![Some(item.clone())];
            run.time = 15.0;
            run.check_triggers().unwrap();
            assert_eq!(
                run.unit(id).food[0].as_ref().unwrap().last_used,
                if food { 0.0 } else { 15.0 }
            );

            let mut run = test_run();
            let id = run.players[0];
            let stats = &mut run.unit_mut(id).attributes.details.combat_stats;
            stats.food_haste = 1.0;
            stats.drink_concentration = 3.0;
            item.buffs = vec![EncounterRun::make_buff("test", "damage", 0.25, 4.0, 80.0)];
            run.unit_mut(id).food = vec![Some(item.clone())];
            run.consume(id, false, 0, &item).unwrap();
            assert_eq!(
                run.queue
                    .events()
                    .iter()
                    .find(|event| event.kind == EventKind::Cooldown)
                    .unwrap()
                    .time,
                cooldown
            );
            let buffs = run.unit(id).attributes.buffs_snapshot();
            let multiplier = if drink { 4.0 } else { 1.0 };
            assert_eq!(buffs[0]["ratioBoost"], json!(0.25 * multiplier));
            assert_eq!(buffs[0]["flatBoost"], json!(4.0 * multiplier));
            assert_eq!(buffs[0]["duration"], json!(80.0 / multiplier));
        }
    }
}
