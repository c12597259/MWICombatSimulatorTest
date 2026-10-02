#[derive(Clone, Copy, Debug, Eq, PartialEq, serde::Serialize)]
#[serde(transparent)]
pub struct UnitId {
    serial: usize,
    #[serde(skip)]
    slot: usize,
}
impl UnitId {
    pub(crate) fn index(self) -> usize {
        self.serial
    }
}

/// IDs identify objects, not HRIDs or positions. Replacements allocate a new ID;
/// slots may be reused only after the object is unreachable. A monotonic serial
/// keeps stale handles and shared ability-buff identities distinct on reuse.
pub struct UnitArena<T> {
    units: Vec<Option<(UnitId, T)>>,
    free: Vec<usize>,
    by_serial: std::collections::HashMap<usize, usize>,
    next_serial: usize,
}

impl<T> Default for UnitArena<T> {
    fn default() -> Self {
        Self {
            units: Vec::new(),
            free: Vec::new(),
            by_serial: std::collections::HashMap::new(),
            next_serial: 0,
        }
    }
}
impl<T> UnitArena<T> {
    pub(crate) fn iter_mut(&mut self) -> impl Iterator<Item = &mut T> {
        self.units.iter_mut().flatten().map(|(_, unit)| unit)
    }
    // Only used to discard the constructor's dummy encounter, before execution.
    pub(crate) fn truncate(&mut self, count: usize) {
        assert!(self.free.is_empty() && self.next_serial == self.units.len());
        assert!(count <= self.units.len());
        self.units.truncate(count);
        self.by_serial.retain(|serial, _| *serial < count);
        self.next_serial = count;
    }
    pub fn iter(&self) -> impl Iterator<Item = (UnitId, &T)> {
        self.units.iter().flatten().map(|(id, unit)| (*id, unit))
    }
    pub fn id_at(&self, index: usize) -> Option<UnitId> {
        self.by_serial.get(&index).map(|slot| UnitId {
            serial: index,
            slot: *slot,
        })
    }
    pub fn pair_mut(&mut self, first: UnitId, second: UnitId) -> Option<(&mut T, &mut T)> {
        if first.slot == second.slot || self.get(first).is_none() || self.get(second).is_none() {
            return None;
        }
        if first.slot < second.slot {
            let (left, right) = self.units.split_at_mut(second.slot);
            Some((&mut left[first.slot].as_mut()?.1, &mut right[0].as_mut()?.1))
        } else {
            let (left, right) = self.units.split_at_mut(first.slot);
            Some((
                &mut right[0].as_mut()?.1,
                &mut left[second.slot].as_mut()?.1,
            ))
        }
    }
    pub fn spawn(&mut self, unit: T) -> UnitId {
        let slot = self.free.pop().unwrap_or(self.units.len());
        let id = UnitId {
            serial: self.next_serial,
            slot,
        };
        self.next_serial += 1;
        if slot == self.units.len() {
            self.units.push(Some((id, unit)));
        } else {
            self.units[slot] = Some((id, unit));
        }
        self.by_serial.insert(id.serial, slot);
        id
    }
    pub fn get(&self, id: UnitId) -> Option<&T> {
        self.units
            .get(id.slot)?
            .as_ref()
            .filter(|(stored, _)| *stored == id)
            .map(|(_, unit)| unit)
    }
    pub fn get_mut(&mut self, id: UnitId) -> Option<&mut T> {
        self.units
            .get_mut(id.slot)?
            .as_mut()
            .filter(|(stored, _)| *stored == id)
            .map(|(_, unit)| unit)
    }
    pub(crate) fn retain_reachable(&mut self, roots: impl Iterator<Item = UnitId>) {
        let mut marked = vec![false; self.units.len()];
        for id in roots {
            if self.get(id).is_some() {
                marked[id.slot] = true;
            }
        }
        for (slot, unit) in self.units.iter_mut().enumerate() {
            if !marked[slot] {
                if let Some((id, _)) = unit.take() {
                    self.by_serial.remove(&id.serial);
                    self.free.push(slot);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn respawn_retains_identity_and_replacement_keeps_old_refs_distinct() {
        let mut arena = UnitArena::default();
        let original = arena.spawn(("same-hrid", 0));
        let second = arena.spawn(("same-hrid", 0));
        assert_ne!(original, second);
        arena.get_mut(original).unwrap().1 = 110;
        assert_eq!(arena.get(original).unwrap().1, 110);
        let replacement = arena.spawn(("same-hrid", 220));
        assert_ne!(replacement, original);
        assert_eq!(arena.get(original).unwrap().1, 110);
        assert_eq!(arena.get(replacement).unwrap().1, 220);
    }

    #[test]
    fn reclaimed_slots_do_not_alias_old_handles_or_grow_with_encounter_count() {
        let mut arena = UnitArena::default();
        let player = arena.spawn("player");
        let old = arena.spawn("monster");
        arena.retain_reachable([player].into_iter());
        let replacement = arena.spawn("monster");
        assert_eq!(old.slot, replacement.slot);
        assert_ne!(old.index(), replacement.index());
        assert!(arena.get(old).is_none());
        assert!(arena.get_mut(old).is_none());
        assert!(arena.id_at(old.index()).is_none());
        assert!(arena.pair_mut(old, player).is_none());
        assert!(arena.pair_mut(player, old).is_none());
        assert_eq!(serde_json::to_value(replacement).unwrap(), 2);
        assert_eq!(arena.id_at(2), Some(replacement));
        let (monster, retained_player) = arena.pair_mut(replacement, player).unwrap();
        *monster = "replacement";
        assert_eq!(*retained_player, "player");
        // A stale handle must not keep the replacement alive either.
        arena.retain_reachable([player, old].into_iter());
        assert!(arena.get(replacement).is_none());
        for _ in 0..10_000 {
            let enemy = arena.spawn("enemy");
            arena.retain_reachable([player, enemy].into_iter());
            arena.retain_reachable([player].into_iter());
        }
        assert_eq!(arena.units.len(), 2);
        assert_eq!(arena.by_serial.len(), 1);
        assert_eq!(arena.iter().count(), 1);
    }
}
