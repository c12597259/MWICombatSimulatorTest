import Heap from "heap-js";

class EventQueue {
    constructor() {
        this.minHeap = new Heap((a, b) => a.time - b.time);
    }

    addEvent(event) {
        this.minHeap.push(event);
    }

    getNextEvent() {
        return this.minHeap.pop();
    }

    containsEventOfType(type) {
        let heapEvents = this.minHeap.heapArray;

        return heapEvents.some((event) => event.type == type);
    }

    containsEventOfTypeAndHrid(type, hrid) {
        let heapEvents = this.minHeap.heapArray;
        return heapEvents.some((event) => event.type == type && event.hrid == hrid);
    }

    clear() {
        this.minHeap = new Heap((a, b) => a.time - b.time);
    }

    clearEventsForUnit(unit) {
        this.clearMatching((event) => event.source == unit || event.target == unit);
    }

    clearEventsOfType(type) {
        this.clearMatching((event) => event.type == type);
    }

    clearMatching(fn) {
        let cleared = false;
        // Snapshot only matching entries, preserving the old removal order. A
        // lazy-delete heap would reorder equal-time events and change battles.
        const matches = this.minHeap.heapArray.filter(fn);
        for (const event of matches) {
            this.minHeap.remove(event);
            cleared = true;
        }
        return cleared;
    }

    getMatching(fn) {
        let heapEvents = this.minHeap.heapArray;
    
        for (const event of heapEvents) {
            if (fn(event)) {
                return event; 
            }
        }
    
        return null; 
    }
}

export default EventQueue;
