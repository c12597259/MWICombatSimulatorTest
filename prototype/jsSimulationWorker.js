import { simulationReference } from '../bench/simulationsReference.js';
// This Worker runs the actual JS combat engine with the browser's native Math.
// It never patches Math.pow or borrows WASM formulas to obtain parity.
self.onmessage = async ({ data }) => {
    const { id, command } = data;
    try {
        if (command === 'init') { self.postMessage({ id, result: { nativePow: Math.pow(123.4, 1.4) } }); return; }
        const input = JSON.parse(data.inputJson);
        const value = command === 'simulationTrace'
            ? await simulationReference(input.input, input.maxEvents, input.startEvent || 0)
            : await simulationReference(input);
        self.postMessage({ id, result: value });
    } catch (error) { self.postMessage({ id, error: { message: String(error.message || error), code: 'JS_ERROR' } }); }
};
