import init, { PrototypeEngine, module_info, live_engines, live_probes, js_round, js_remainder } from '../.wasm-build/pkg/combat_wasm.js';
import wasmUrl from '../.wasm-build/pkg/combat_wasm_bg.wasm';
import dataUrl from '../.wasm-build/data/combat-data.json?asset';
import manifest from '../.wasm-build/manifest.json';

let modulePromise, wasm, dataText, engine, busy = false;
let moduleInitCount = 0, engineInitCount = 0, dataFetchCount = 0;
let loadMode = 'not-loaded';
const failure = (code, message) => Object.assign(new Error(message), { code });

async function sha256(bytes) {
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
}

async function ensureEngine(options = {}) {
    if (options.expectedHash && options.expectedHash !== manifest.dataFingerprint) throw failure('DATA_MISMATCH', 'Data fingerprint mismatch');
    if (!wasm) {
        modulePromise ||= (async () => {
            const response = await fetch(options.wasmUrl || wasmUrl);
            if (!response.ok) throw failure('LOAD_FAILED', `WASM HTTP ${response.status}`);
            // Check the actual asset before either streaming or byte initialization.
            const bytes = await response.clone().arrayBuffer();
            if (await sha256(bytes) !== manifest.artifacts['combat_wasm_bg.wasm']) throw failure('DATA_MISMATCH', 'WASM asset fingerprint mismatch');
            loadMode = options.byteLoading ? 'bytes' : 'response';
            wasm = await init({ module_or_path: options.byteLoading ? bytes : response });
            const info = JSON.parse(module_info());
            if (info.interfaceVersion !== manifest.interfaceVersion || info.rngVersion !== manifest.rngVersion ||
                info.dataFingerprint !== manifest.dataFingerprint) throw failure('DATA_MISMATCH', 'Module interface or data mismatch');
            moduleInitCount++;
        })();
        try { await modulePromise; }
        catch (error) { modulePromise = undefined; wasm = undefined; throw error; }
    }
    if (!dataText) {
        const response = await fetch(options.dataUrl || dataUrl);
        if (!response.ok) throw failure('LOAD_FAILED', `Data HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (await sha256(bytes) !== manifest.dataAssetSha256) throw failure('DATA_MISMATCH', 'Definition asset fingerprint mismatch');
        dataText = new TextDecoder().decode(bytes);
        dataFetchCount++;
    }
    if (!engine) { engine = new PrototypeEngine(dataText, manifest.dataFingerprint); engineInitCount++; }
}

function stats() {
    return { moduleInitCount, engineInitCount, dataFetchCount, loadMode,
        liveEngines: wasm ? live_engines() : 0, liveProbes: wasm ? live_probes() : 0,
        memoryBytes: wasm?.memory.buffer.byteLength ?? 0,
        info: engine ? JSON.parse(engine.info()) : null,
        module: wasm ? JSON.parse(module_info()) : null,
        assets: { wasm: new URL(wasmUrl, location.href).href, data: new URL(dataUrl, location.href).href } };
}

async function execute(message) {
    if (message.command === 'stats') return stats();
    if (message.command === 'destroy') { if (engine) engine.free(); engine = undefined; return stats(); }
    await ensureEngine(message.options);
    if (message.command === 'init') return stats();
    if (message.command === 'queue') return JSON.parse(engine.queue_trace(message.actionsJson));
    if (message.command === 'numeric') return { round: message.values.map(js_round), remainder: message.values.map(value => js_remainder(value, 2)) };
    if (message.command === 'rng') {
        if (!Number.isInteger(message.seed) || message.seed < 0 || message.seed > 0xffffffff ||
            !Array.isArray(message.points) || message.points.length > 100 ||
            message.points.some((value, index) => !Number.isInteger(value) || value < 1 || value > 10_000_000 || (index > 0 && value <= message.points[index - 1]))) {
            throw failure('INVALID_INPUT', 'Invalid RNG checkpoints');
        }
        const chunk = message.chunk ?? 50_000;
        if (!Number.isInteger(chunk) || chunk < 1 || chunk > 100_000) throw failure('INVALID_INPUT', 'Invalid chunk size');
        const probe = engine.create_rng_probe(message.seed);
        try {
            const values = [];
            for (const point of message.points) {
                let value;
                while (probe.calls() < point) {
                    value = probe.sample_to(Math.min(point, probe.calls() + chunk));
                    if (values.length === 0 && probe.calls() === Math.min(point, chunk)) self.postMessage({ id: message.id, progress: { calls: probe.calls() } });
                    // Yield only between chunks; random draws stay entirely in Rust.
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                values.push({ call: point, u32: value });
            }
            return { values, calls: probe.calls() };
        } finally { probe.free(); }
    }
    throw failure('INVALID_INPUT', 'Unknown prototype command');
}

self.onmessage = async ({ data }) => {
    const { id } = data;
    if (busy) { self.postMessage({ id, error: { code: 'BUSY', message: 'Worker already has a task' } }); return; }
    busy = true;
    try { self.postMessage({ id, result: await execute(data) }); }
    catch (error) { self.postMessage({ id, error: { code: error.code || 'INVALID_INPUT', message: String(error.message || error) } }); }
    finally { busy = false; }
};
