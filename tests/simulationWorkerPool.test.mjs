import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/simulationWorkerPool.js', import.meta.url), 'utf8');
const { runSimulationWorkerPool, getSimulationWorkerCount } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

test('worker limits reserve a core and bound low-memory concurrency', () => {
    assert.equal(getSimulationWorkerCount(undefined, undefined), 1);
    assert.equal(getSimulationWorkerCount(1, 8), 1);
    assert.equal(getSimulationWorkerCount(8, 4), 2);
    assert.equal(getSimulationWorkerCount(64, 16), 8);
});

test('reuses workers, preserves task order and completes aggregate progress', async () => {
    const workers = [];
    const progress = [];
    const results = await runSimulationWorkerPool([1, 2, 3, 4, 5], {
        concurrency: 2, onProgress: value => progress.push(value),
        createWorker: () => {
            const worker = { calls: 0, stopped: false,
                postMessage(value) {
                    this.calls++;
                    setTimeout(() => {
                        this.onmessage({ data: { type: 'simulation_progress', progress: 0.5 } });
                        this.onmessage({ data: { type: 'simulation_result', simResult: value * 2 } });
                    }, value % 2 ? 10 : 1);
                }, terminate() { this.stopped = true; } };
            workers.push(worker); return worker;
        },
    });
    assert.deepEqual(results, [2, 4, 6, 8, 10]);
    assert.equal(workers.length, 2);
    assert.ok(workers.some(w => w.calls > 1));
    assert.ok(workers.every(w => w.stopped));
    assert.equal(progress.at(-1), 1);
    assert.ok(progress.every((p, i) => !i || p >= progress[i - 1]));
});

for (const failure of ['runtime', 'message', 'post', 'create']) test(`cleans up batch on ${failure} failure`, async () => {
    const workers = [];
    await assert.rejects(runSimulationWorkerPool([1, 2, 3], { concurrency: 2,
        createWorker: () => {
            if (failure === 'create' && workers.length) throw new Error('create failed');
            const worker = { stopped: false,
                postMessage() {
                    if (failure === 'post') throw new Error('post failed');
                    queueMicrotask(() => {
                        if (failure === 'runtime') this.onerror({ message: 'runtime failed' });
                        if (failure === 'message') this.onmessage({ data: { type: 'simulation_error', error: new Error('message failed') } });
                    });
                }, terminate() { this.stopped = true; } };
            workers.push(worker); return worker;
        },
    }));
    assert.ok(workers.every(w => w.stopped));
});
