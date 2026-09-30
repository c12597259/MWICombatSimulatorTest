#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UnitId(usize);

/// IDs identify objects, not HRIDs or positions. Replacements allocate a new ID;
/// old objects remain addressable until the run ends, just like queued JS refs.
pub struct UnitArena<T> {
    units: Vec<T>,
}

impl<T> Default for UnitArena<T> {
    fn default() -> Self {
        Self { units: Vec::new() }
    }
}
impl<T> UnitArena<T> {
    pub fn spawn(&mut self, unit: T) -> UnitId {
        let id = UnitId(self.units.len());
        self.units.push(unit);
        id
    }
    pub fn get(&self, id: UnitId) -> Option<&T> {
        self.units.get(id.0)
    }
    pub fn get_mut(&mut self, id: UnitId) -> Option<&mut T> {
        self.units.get_mut(id.0)
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
}
