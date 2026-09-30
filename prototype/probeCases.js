import EventQueue from '../src/combatsimulator/events/eventQueue.js';

export function queueCases() {
    const randomActions = [];
    let seed = 33;
    const random = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
    // Exactly the existing P0 5,000-operation test, with object identities mapped to IDs.
    for (let i = 0; i < 5000; i++) {
        const kind = 'type' + random(4);
        const source = random(3);
        const action = random(8);
        if (action < 4) randomActions.push({ op: 'push', event: { id: i, time: random(12), kind, source,
            target: random(3), hrid: 'unit' + random(3) } });
        else if (action === 4) randomActions.push({ op: 'pop' });
        else if (action === 5) randomActions.push({ op: 'clear_unit', unit: source });
        else if (action === 6) randomActions.push({ op: 'clear_type', kind });
        else randomActions.push({ op: 'query', kind, source, hrid: 'unit1' });
    }
    const edgeActions = [];
    const push = (id, time, source = 0) => edgeActions.push({ op: 'push', event: { id, time, kind: 'attack', source, target: 2, hrid: 'same-monster' } });
    for (let id = 1; id <= 64; id++) push(id, 1, id % 3);
    for (let id of [1, 17, 64, 999]) edgeActions.push({ op: 'remove', id });
    edgeActions.push({ op: 'clear_unit', unit: 1 }, { op: 'query', kind: 'attack', source: 0, hrid: 'same-monster' });
    for (let i = 0; i < 64; i++) edgeActions.push({ op: 'pop' });
    edgeActions.push({ op: 'clear' });
    for (let id = 101; id <= 164; id++) push(id, (id * 7) % 13 + 0.25);
    for (let id = 101; id <= 164; id += 3) edgeActions.push({ op: 'remove', id });
    edgeActions.push({ op: 'clear_type', kind: 'attack' });
    for (let id = 201; id <= 208; id++) push(id, -0.5);
    for (let i = 0; i < 9; i++) edgeActions.push({ op: 'pop' });
    return { randomActions, edgeActions };
}

export function jsQueueTrace(actions) {
    const queue = new EventQueue();
    const units = [{}, {}, {}];
    return actions.map(action => {
        const frame = { heap: [], popped: null, removed: null, matched: null, containsType: null, containsHrid: null };
        if (action.op === 'push') {
            const event = action.event;
            queue.addEvent({ ...event, type: event.kind, source: units[event.source], target: units[event.target] });
        } else if (action.op === 'pop') frame.popped = queue.getNextEvent()?.id ?? null;
        else if (action.op === 'clear') queue.clear();
        else if (action.op === 'remove') {
            const event = queue.getMatching(event => event.id === action.id);
            frame.removed = event ? queue.minHeap.remove(event) : false;
        } else if (action.op === 'clear_unit') queue.clearEventsForUnit(units[action.unit]);
        else if (action.op === 'clear_type') queue.clearEventsOfType(action.kind);
        else if (action.op === 'query') {
            frame.matched = queue.getMatching(event => event.type === action.kind && event.source === units[action.source])?.id ?? null;
            frame.containsType = queue.containsEventOfType(action.kind);
            frame.containsHrid = queue.containsEventOfTypeAndHrid(action.kind, action.hrid);
        } else throw new Error('Unknown queue action');
        frame.heap = queue.minHeap.heapArray.map(event => event.id);
        return frame;
    });
}

export const numericCases = [-Number.MAX_VALUE, -4503599627370497, -2.5, -1.5, -0.5, -0.1, -0,
    0, Number.MIN_VALUE, 0.49999999999999994, 0.5, 1.5, 4503599627370497, Number.MAX_VALUE, NaN, Infinity, -Infinity];
