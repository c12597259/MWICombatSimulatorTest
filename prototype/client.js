export class ProbeClient {
    constructor() {
        this.worker = new Worker(new URL('./worker.js', import.meta.url));
        this.nextId = 1;
        this.pending = new Map();
        this.worker.onmessage = ({ data }) => {
            const task = this.pending.get(data.id);
            if (!task) return;
            if (data.progress) { task.onProgress?.(data.progress); return; }
            clearTimeout(task.timer);
            this.pending.delete(data.id);
            if (data.error) task.reject(Object.assign(new Error(data.error.message), { code: data.error.code }));
            else task.resolve(data.result);
        };
        this.worker.onerror = () => this.terminate('WORKER_ERROR');
    }

    request(command, input = {}, onProgress) {
        if (this.closed) return Promise.reject(Object.assign(new Error('Worker is terminated'), { code: 'CANCELLED' }));
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => { this.terminate('TIMEOUT'); }, 30_000);
            this.pending.set(id, { resolve, reject, timer, onProgress });
            this.worker.postMessage({ ...input, command, id });
        });
    }

    terminate(code = 'CANCELLED') {
        this.closed = true;
        this.worker.terminate();
        for (const { reject, timer } of this.pending.values()) {
            clearTimeout(timer);
            reject(Object.assign(new Error(code), { code }));
        }
        this.pending.clear();
    }
}
