// Compatibility adaptation of heap-js 2.2.0 (BSD-3-Clause, Ignacio Lago).
// Full attribution and license: ../../THIRD-PARTY-NOTICES.md.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
pub struct ProbeEvent {
    pub id: u32,
    pub time: f64,
    pub kind: String,
    pub source: u32,
    pub target: u32,
    pub hrid: String,
}

#[derive(Default)]
pub struct CompatEventQueue {
    heap: Vec<ProbeEvent>,
}

impl CompatEventQueue {
    pub fn events(&self) -> &[ProbeEvent] {
        &self.heap
    }
    pub fn clear(&mut self) {
        self.heap.clear();
    }

    pub fn push(&mut self, event: ProbeEvent) -> Result<(), String> {
        if !event.time.is_finite() {
            return Err("Event time must be finite".into());
        }
        self.heap.push(event);
        self.sort_up(self.heap.len() - 1);
        Ok(())
    }

    pub fn pop(&mut self) -> Option<ProbeEvent> {
        let last = self.heap.pop()?;
        if self.heap.is_empty() {
            return Some(last);
        }
        let root = std::mem::replace(&mut self.heap[0], last);
        self.sort_down(0);
        Some(root)
    }

    pub fn remove(&mut self, id: u32) -> bool {
        let Some(index) = self.heap.iter().position(|event| event.id == id) else {
            return false;
        };
        if index == 0 {
            self.pop();
        } else if index == self.heap.len() - 1 {
            self.heap.pop();
        } else {
            let last = self.heap.pop().expect("nonempty heap");
            self.heap[index] = last;
            // heap-js sorts down at the original index, even if sort_up moved it.
            self.sort_up(index);
            self.sort_down(index);
        }
        true
    }

    pub fn clear_matching(&mut self, predicate: impl Fn(&ProbeEvent) -> bool) -> bool {
        let matches: Vec<u32> = self
            .heap
            .iter()
            .filter(|event| predicate(event))
            .map(|event| event.id)
            .collect();
        for id in &matches {
            self.remove(*id);
        }
        !matches.is_empty()
    }

    fn sort_up(&mut self, mut index: usize) {
        while index > 0 {
            let parent = (index - 1) / 2;
            if self.heap[parent].time <= self.heap[index].time {
                break;
            }
            self.heap.swap(index, parent);
            index = parent;
        }
    }

    fn sort_down(&mut self, mut index: usize) {
        loop {
            let left = index * 2 + 1;
            if left >= self.heap.len() {
                break;
            }
            let right = left + 1;
            let best = if right < self.heap.len() && self.heap[right].time < self.heap[left].time {
                right
            } else {
                left
            };
            if self.heap[index].time <= self.heap[best].time {
                break;
            }
            self.heap.swap(index, best);
            index = best;
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum QueueAction {
    Push {
        event: ProbeEvent,
    },
    Pop,
    Clear,
    Remove {
        id: u32,
    },
    ClearUnit {
        unit: u32,
    },
    ClearType {
        kind: String,
    },
    Query {
        kind: String,
        source: u32,
        hrid: String,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFrame {
    pub heap: Vec<u32>,
    pub popped: Option<u32>,
    pub removed: Option<bool>,
    pub matched: Option<u32>,
    pub contains_type: Option<bool>,
    pub contains_hrid: Option<bool>,
}

pub fn queue_trace(actions: &[QueueAction]) -> Result<Vec<QueueFrame>, String> {
    let mut queue = CompatEventQueue::default();
    let mut output = Vec::with_capacity(actions.len());
    for action in actions {
        let mut frame = QueueFrame {
            heap: Vec::new(),
            popped: None,
            removed: None,
            matched: None,
            contains_type: None,
            contains_hrid: None,
        };
        match action {
            QueueAction::Push { event } => queue.push(event.clone())?,
            QueueAction::Pop => frame.popped = queue.pop().map(|event| event.id),
            QueueAction::Clear => queue.clear(),
            QueueAction::Remove { id } => frame.removed = Some(queue.remove(*id)),
            QueueAction::ClearUnit { unit } => {
                queue.clear_matching(|event| event.source == *unit || event.target == *unit);
            }
            QueueAction::ClearType { kind } => {
                queue.clear_matching(|event| event.kind == *kind);
            }
            QueueAction::Query { kind, source, hrid } => {
                frame.matched = queue
                    .events()
                    .iter()
                    .find(|event| event.kind == *kind && event.source == *source)
                    .map(|event| event.id);
                frame.contains_type = Some(queue.events().iter().any(|event| event.kind == *kind));
                frame.contains_hrid = Some(
                    queue
                        .events()
                        .iter()
                        .any(|event| event.kind == *kind && event.hrid == *hrid),
                );
            }
        }
        frame.heap = queue.events().iter().map(|event| event.id).collect();
        output.push(frame);
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn event(id: u32, time: f64) -> ProbeEvent {
        ProbeEvent {
            id,
            time,
            kind: "attack".into(),
            source: id % 3,
            target: 0,
            hrid: "unit".into(),
        }
    }

    #[test]
    fn equal_time_order_is_heap_js_not_fifo() {
        let mut queue = CompatEventQueue::default();
        for id in 1..=8 {
            queue.push(event(id, 1.0)).unwrap();
        }
        let mut ids = Vec::new();
        while let Some(event) = queue.pop() {
            ids.push(event.id);
        }
        assert_eq!(ids, [1, 8, 7, 6, 5, 4, 3, 2]);
        assert!(queue.pop().is_none());
    }

    #[test]
    fn removal_and_clear_do_not_keep_stale_events() {
        let mut queue = CompatEventQueue::default();
        for id in 1..=8 {
            queue.push(event(id, f64::from(8 - id))).unwrap();
        }
        assert!(queue.remove(3));
        assert!(!queue.remove(3));
        queue.clear_matching(|event| event.source == 2 || event.target == 2);
        assert!(!queue.events().iter().any(|event| event.source == 2));
        queue.clear();
        assert!(queue.events().is_empty());
        assert!(queue.push(event(1, f64::NAN)).is_err());
    }
}
