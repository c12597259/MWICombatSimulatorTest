use crate::{
    actions::{Ability, AbilityEffect, Consumable, Trigger},
    attributes::{AttributeCase, AttributeStep, CombatBuff, MonsterInput, UnitInput},
    combat_math::{self, AttackResult},
    data::DefinitionSet,
    identity::{UnitArena, UnitId},
    queue::{CompatEventQueue, TimedEvent},
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
    data: Rc<DefinitionSet>,
    case: EncounterCase,
    pub units: UnitArena<RuntimeUnit>,
    players: Vec<UnitId>,
    enemies: Option<Vec<UnitId>>,
    pub queue: CompatEventQueue<CombatEvent>,
    rng: CombatRng,
    next_event_id: u32,
    pub time: f64,
    processed: u32,
    ended: bool,
    failed: bool,
    all_players_dead: bool,
    operations: Vec<Value>,
    max_enrage: f64,
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
        }
        for entry in &case.enemies {
            if !matches!(entry.input, UnitInput::Monster(_)) {
                return Err("Enemy list contains a player".into());
            }
            enemies.push(units.spawn(RuntimeUnit::new(entry.clone(), &data)?));
        }
        for setup in &case.setup {
            if units.id_at(setup.unit).is_none() {
                return Err("Unknown setup unit".into());
            }
        }
        let rng = CombatRng::new(case.seed);
        let mut run = Self {
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
        };
        run.push(CombatEvent::new(EventKind::Start, 0.0, None))?;
        Ok(run)
    }
    fn unit(&self, id: UnitId) -> &RuntimeUnit {
        self.units.get(id).expect("valid runtime identity")
    }
    fn unit_mut(&mut self, id: UnitId) -> &mut RuntimeUnit {
        self.units.get_mut(id).expect("valid runtime identity")
    }
    fn push(&mut self, mut event: CombatEvent) -> Result<(), String> {
        self.next_event_id += 1;
        event.id = self.next_event_id;
        self.queue.push(event)
    }
    fn at(&mut self, kind: EventKind, time: f64, source: Option<UnitId>) -> Result<(), String> {
        self.push(CombatEvent::new(kind, time, source))
    }
    fn clear_unit(&mut self, id: UnitId) {
        self.queue
            .clear_matching(|event| event.source == Some(id) || event.target == Some(id));
    }
    fn step(&mut self, id: UnitId, step: &AttributeStep) -> Result<(), String> {
        self.units
            .get_mut(id)
            .expect("valid identity")
            .step(step, &self.data)
    }
    fn buff(&mut self, id: UnitId, buffs: &[CombatBuff], time: Option<f64>) -> Result<(), String> {
        self.units
            .get_mut(id)
            .expect("valid identity")
            .attributes
            .add_buffs(buffs, time, &self.data)
    }
    fn sides(&self, source: UnitId) -> (Vec<UnitId>, Option<Vec<UnitId>>) {
        if self.unit(source).player {
            (self.players.clone(), self.enemies.clone())
        } else {
            (
                self.enemies.clone().unwrap_or_default(),
                Some(self.players.clone()),
            )
        }
    }
    fn live(&self, values: &[UnitId]) -> Vec<UnitId> {
        values
            .iter()
            .copied()
            .filter(|id| self.unit(*id).alive())
            .collect()
    }
    fn first_target(&self, enemies: Option<&[UnitId]>) -> Option<UnitId> {
        enemies.and_then(|values| values.iter().copied().find(|id| self.unit(*id).alive()))
    }
    fn event_snapshot(&self, event: &CombatEvent) -> Value {
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
    fn frame(&mut self, event: &CombatEvent) -> Value {
        let frame = json!({ "event":self.event_snapshot(event), "time":self.time, "randomCalls":self.rng.calls(),
            "units":self.units.iter().map(|(id, unit)| json!({"id":id,"state":unit.snapshot()})).collect::<Vec<_>>(),
            "players":self.players,"enemies":self.enemies,"heap":self.queue.events().iter().map(|event| self.event_snapshot(event)).collect::<Vec<_>>(),
            "operations":self.operations,"allPlayersDead":self.all_players_dead,"maxEnrageStack":self.max_enrage });
        self.operations.clear();
        frame
    }
    pub fn done(&self) -> bool {
        self.failed
            || self.ended
            || self.processed >= self.case.max_events
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
    fn advance_inner(&mut self, events: u32) -> Result<Vec<Value>, String> {
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
            frames.push(self.frame(&event));
            if self.enemies.is_none() || self.all_players_dead {
                self.ended = true;
            }
        }
        Ok(frames)
    }
    fn apply_setup(&mut self) -> Result<(), String> {
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
    fn process(&mut self, event: CombatEvent) -> Result<(), String> {
        match event.kind {
            EventKind::Start => {
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
                return Err("Map progression belongs to the full simulator".into())
            }
        }
        Ok(())
    }
    fn start_attacks(&mut self) -> Result<(), String> {
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
    fn trigger(
        &self,
        trigger: &Trigger,
        source: UnitId,
        target: Option<UnitId>,
        allies: &[UnitId],
        enemies: Option<&[UnitId]>,
    ) -> Result<bool, String> {
        let dep = trigger.dependency_hrid.rsplit('/').next().unwrap_or("");
        let value = match dep {
            "self" => self.unit(source).trigger_value(trigger, self.time)?,
            "targeted_enemy" => {
                let Some(target) = target else {
                    return Ok(false);
                };
                self.unit(target).trigger_value(trigger, self.time)?
            }
            "all_allies" | "all_enemies" => {
                let values = if dep == "all_allies" {
                    allies
                } else {
                    let Some(values) = enemies else {
                        return Ok(false);
                    };
                    values
                };
                let condition = trigger.condition_hrid.rsplit('/').next().unwrap_or("");
                let value = match condition {
                    "number_of_active_units" => self.live(values).len() as f64,
                    "number_of_dead_units" => values
                        .iter()
                        .filter(|id| self.unit(**id).attributes.details.current_hitpoints <= 0.0)
                        .count() as f64,
                    "lowest_hp_percentage" => {
                        self.live(values).iter().fold(2.0_f64, |min, id| {
                            let details = &self.unit(*id).attributes.details;
                            let current = details.current_hitpoints / details.max_hitpoints;
                            if current < min {
                                current
                            } else {
                                min
                            }
                        }) * 100.0
                    }
                    _ => {
                        let mut total = 0.0;
                        let mut object = false;
                        for id in self.live(values) {
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
    fn compare(trigger: &Trigger, value: &Dependency) -> Result<bool, String> {
        Ok(
            match trigger.comparator_hrid.rsplit('/').next().unwrap_or("") {
                "greater_than_equal" => value.number >= trigger.value,
                "less_than_equal" => value.number <= trigger.value,
                "is_active" => value.active,
                "is_inactive" => !value.active,
                _ => return Err("Unknown trigger comparator".into()),
            },
        )
    }
    fn should_trigger(
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
        let (allies, enemies) = self.sides(id);
        let target = self.first_target(enemies.as_deref());
        let mut active = true;
        // The original loop evaluates all trigger conditions even after one fails.
        for trigger in triggers {
            if !self.trigger(trigger, id, target, &allies, enemies.as_deref())? {
                active = false;
            }
        }
        Ok(active)
    }
    fn can_use(&mut self, id: UnitId, ability: &Ability) -> bool {
        if !self.unit(id).alive() {
            return false;
        }
        let oom = self.unit(id).attributes.details.current_manapoints < ability.mana_cost;
        if self.unit(id).player {
            self.operations.push(json!(["oom", id, oom, self.time]));
        }
        !oom
    }
    fn next_attack(&mut self, id: UnitId) -> Result<(), String> {
        if self.queue.events().iter().any(|event| {
            event.source == Some(id) && matches!(event.kind, EventKind::Cast | EventKind::Attack)
        }) {
            return Ok(());
        }
        let abilities = self.unit(id).abilities.clone();
        let mut skip = false;
        let mut used = false;
        for (index, ability) in abilities.iter().enumerate() {
            let Some(ability) = ability else {
                continue;
            };
            if used || skip {
                continue;
            }
            let haste = self.unit(id).attributes.details.combat_stats.ability_haste;
            let cd = if haste > 0.0 {
                ability.cooldown * 100.0 / (100.0 + haste)
            } else {
                ability.cooldown
            };
            if self.should_trigger(id, ability.last_used, cd, &ability.triggers, true)? {
                if !self.can_use(id, ability) {
                    skip = true;
                } else {
                    let cast = ability.cast
                        / (1.0 + self.unit(id).attributes.details.combat_stats.cast_speed);
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
        if self.sides(id).1.is_none() {
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
    fn check_triggers(&mut self) -> Result<(), String> {
        for _ in 0..10_000 {
            let mut used = false;
            // Each side filters alive units once, preserving the JS array loop.
            for side in [
                self.players.clone(),
                self.enemies.clone().unwrap_or_default(),
            ] {
                for id in self.live(&side) {
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
                                .clone();
                            let Some(item) = item else {
                                continue;
                            };
                            let stats = &self.unit(id).attributes.details.combat_stats;
                            let haste = if item.category.contains("food") {
                                stats.food_haste
                            } else {
                                stats.drink_concentration
                            };
                            let cd = if haste > 0.0 {
                                item.cooldown / (1.0 + haste)
                            } else {
                                item.cooldown
                            };
                            if self.should_trigger(id, item.last_used, cd, &item.triggers, false)?
                                && self.consume(id, drink, index, &item)?
                            {
                                used = true;
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
    fn consume(
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
        if concentration > 0.0 && item.category.contains("drink") {
            cd /= 1.0 + concentration;
        } else if food_haste > 0.0 && item.category.contains("food") {
            cd /= 1.0 + food_haste;
        }
        self.at(EventKind::Cooldown, self.time + cd, None)?;
        self.operations.push(json!(["consume", id, item.hrid]));
        if item.recovery == 0.0 {
            if item.hp > 0.0 {
                let value = self.unit_mut(id).add_hp(item.hp);
                self.operations.push(json!(["hp", id, item.hrid, value]));
            }
            if item.mp > 0.0 {
                let value = self.unit_mut(id).add_mp(item.mp);
                self.operations.push(json!(["mp", id, item.hrid, value]));
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
            if concentration > 0.0 && item.category.contains("drink") {
                buff.ratio_boost *= 1.0 + concentration;
                buff.flat_boost *= 1.0 + concentration;
                buff.duration /= 1.0 + concentration;
            }
            self.buff(id, &[buff.clone()], Some(self.time))?;
            self.at(EventKind::BuffExpire, self.time + buff.duration, Some(id))?;
        }
        Ok(true)
    }
    fn hot(&mut self, mut event: CombatEvent) -> Result<(), String> {
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
            self.operations.push(json!(["hp", id, item.hrid, value]));
        }
        if item.mp > 0.0 {
            let value = self
                .unit_mut(id)
                .add_mp(combat_math::tick_value(item.mp, ticks, tick));
            self.operations.push(json!(["mp", id, item.hrid, value]));
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
    fn dot(&mut self, mut event: CombatEvent) -> Result<(), String> {
        let target = event.target.ok_or("Missing DOT target")?;
        let source = event.source_ref.ok_or("Missing DOT source ref")?;
        let tick = event.tick.ok_or("Missing DOT tick")?;
        let ticks = event.ticks.ok_or("Missing DOT ticks")?;
        let damage =
            combat_math::tick_value(event.amount.ok_or("Missing DOT damage")?, ticks, tick)
                .min(self.unit(target).attributes.details.current_hitpoints);
        self.unit_mut(target).attributes.details.current_hitpoints -= damage;
        self.operations
            .push(json!(["attack", source, target, "damageOverTime", damage]));
        if tick < ticks {
            event.time = self.time + DOT;
            event.tick = Some(tick + 1.0);
            self.push(event)?;
        }
        self.death_if_zero(target);
        self.check_end()?;
        Ok(())
    }
    fn regen(&mut self) -> Result<(), String> {
        for id in self.players.clone() {
            if !self.unit(id).alive() {
                continue;
            }
            let details = &self.unit(id).attributes.details;
            let hp = (details.max_hitpoints * details.combat_stats.hp_regen_per10).floor();
            let mp = (details.max_manapoints * details.combat_stats.mp_regen_per10).floor();
            let hp = self.unit_mut(id).add_hp(hp);
            self.operations.push(json!(["hp", id, "regen", hp]));
            let mp = self.unit_mut(id).add_mp(mp);
            self.operations.push(json!(["mp", id, "regen", mp]));
            if self.unit(id).out_of_mana {
                self.at(EventKind::Await, self.time, Some(id))?;
            }
        }
        self.at(EventKind::Regen, self.time + REGEN, None)
    }
    fn enrage(&mut self, elapsed: f64) -> Result<(), String> {
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
    fn make_buff(unique: &str, kind: &str, ratio: f64, flat: f64, duration: f64) -> CombatBuff {
        CombatBuff {
            unique_hrid: format!("/buff_uniques/{unique}"),
            type_hrid: format!("/buff_types/{kind}"),
            ratio_boost: ratio,
            flat_boost: flat,
            duration,
            start_time: None,
        }
    }
    fn death_if_zero(&mut self, id: UnitId) {
        if self.unit(id).attributes.details.current_hitpoints == 0.0 {
            self.clear_unit(id);
            self.operations.push(json!(["death", id]));
        }
    }
    fn check_end(&mut self) -> Result<bool, String> {
        if let Some(enemies) = self.enemies.clone() {
            for id in &enemies {
                if !self.unit(*id).alive() && self.unit(*id).experience_rate == 0.0 {
                    let elapsed = self.time.min(self.unit(*id).enrage_time);
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
                for id in &self.players {
                    self.operations.push(json!([
                        "experience",
                        id,
                        experience / self.players.len() as f64
                    ]));
                }
                self.enemies = None;
                self.operations.push(json!(["encounter"]));
            }
        }
        for id in self.players.clone() {
            if !self.unit(id).alive()
                && !self.queue.events().iter().any(|event| {
                    event.kind == EventKind::Respawn
                        && event.hrid.as_deref() == Some(self.unit(id).hrid.as_str())
                })
            {
                let mut event =
                    CombatEvent::new(EventKind::Respawn, self.time + 150.0 * SECOND, None);
                event.hrid = Some(self.unit(id).hrid.clone());
                self.push(event)?;
                self.operations.push(json!(["oom", id, false, self.time]));
            }
        }
        if self.live(&self.players).is_empty() {
            self.queue
                .clear_matching(|event| matches!(event.kind, EventKind::Attack | EventKind::Cast));
            self.all_players_dead = true;
        }
        Ok(self.enemies.is_none() || self.all_players_dead)
    }
    fn parry(&mut self, targets: &[UnitId]) -> Option<UnitId> {
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
    fn threat_target(&mut self, targets: &[UnitId]) -> Result<UnitId, String> {
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
    fn attack(
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
    fn record_attack(
        &mut self,
        source: UnitId,
        target: UnitId,
        ability: &str,
        result: &AttackResult,
    ) {
        self.operations.push(json!([
            "attack",
            source,
            target,
            ability,
            if result.did_hit {
                json!(result.damage_done)
            } else {
                json!("miss")
            }
        ]));
    }
    fn record_returns(
        &mut self,
        source: UnitId,
        target: UnitId,
        result: &AttackResult,
        resources: bool,
    ) {
        if resources && result.life_steal_heal > 0.0 {
            self.operations
                .push(json!(["hp", source, "lifesteal", result.life_steal_heal]));
        }
        if resources && result.mana_leech_mana > 0.0 {
            self.operations
                .push(json!(["mp", source, "manaLeech", result.mana_leech_mana]));
        }
        if result.thorn_damage_done > 0.0 {
            self.operations.push(json!([
                "attack",
                target,
                source,
                result.thorn_type,
                result.thorn_damage_done
            ]));
        }
        if self
            .unit(target)
            .attributes
            .details
            .combat_stats
            .retaliation
            > 0.0
        {
            self.operations.push(json!([
                "attack",
                target,
                source,
                "retaliation",
                if result.retaliation_damage_done > 0.0 {
                    json!(result.retaliation_damage_done)
                } else {
                    json!("miss")
                }
            ]));
        }
    }
    fn stacks(
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
    fn auto_attack(&mut self, original: UnitId) -> Result<(), String> {
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
            self.record_returns(source, target, &result, true);
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
    fn use_ability(&mut self, mut source: UnitId, index: usize) -> Result<bool, String> {
        let ability = self
            .unit(source)
            .abilities
            .get(index)
            .and_then(Option::as_ref)
            .ok_or("Unknown cast ability")?
            .clone();
        if !self.can_use(source, &ability) {
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
                        self.operations
                            .push(json!(["hpSpent", source, ability.hrid, spent]));
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
                        self.next_attack(source)?;
                    }
                    _ => return Err("Unsupported ability effect".into()),
                }
            }
        }
        let ripple = self.unit(source).attributes.details.combat_stats.ripple;
        if ripple > 0.0 && self.rng.next_f64() < ripple {
            let value = self.unit_mut(source).add_mp(10.0);
            self.operations.push(json!(["mp", source, "ripple", value]));
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
    fn ability_buff(
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
    fn ability_damage(
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
                self.record_returns(parry, source, &result, true);
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
            if result.hp_drain > 0.0 {
                self.operations
                    .push(json!(["hp", source, ability.hrid, result.hp_drain]));
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
            self.record_returns(source, target, &result, false);
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
    fn apply_cc(&mut self, target: UnitId, duration: f64, kind: EventKind) -> Result<(), String> {
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
    fn ability_heal(
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
            self.operations
                .push(json!(["hp", target, ability.hrid, healed]));
            if revive {
                self.next_attack(target)?;
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
